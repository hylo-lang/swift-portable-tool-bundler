// SPDX short identifier: Apache-2.0
//
// Orchestrates assembling a portable bundle from a Swift build directory.
//
// Closure-walk recursion-target rule (subtle but important):
//
// * Windows / PE — imports are resolved by *name* (no rpath concept), so
//   after copying a DLL into the bundle we recurse on the **bundled copy**.
//   This keeps the walk anchored to the final layout and lets test stubs
//   reason exclusively about bundle-local paths.
//
// * Linux / ELF — DT_RUNPATH entries (commonly `$ORIGIN`) resolve relative
//   to the file's location at the time `ld.so` reads it. The bundle is
//   still being assembled so siblings are not yet present there; we must
//   recurse on the **toolchain source path** so rpath stays valid.
//
// Any future change that touches the recursion target needs to preserve
// this asymmetry. There are dedicated regression tests for both branches.

import * as fs from "fs";
import * as path from "path";

import { isAllowedLinuxSo, isAllowedWindowsDll } from "./allowlist";
import { currentPlatform, Platform } from "./platform";
import { getDllDependencies, RunReadobj } from "./windows-deps";
import { getSoDependencies, LddEntry, RunLdd } from "./linux-deps";

export interface BundleOptions {
  /** Source Swift build products directory. */
  buildDirectory: string;
  /** Destination bundle directory. Created if missing. */
  outputDirectory: string;
  /** Executable target names to bundle (resolved from product names). */
  executableNames: string[];
  /** Override the detected platform (for testing). */
  platform?: Platform;
  /** Injectable PATH lookup, for testing. */
  pathDirs?: string[];
  /** Injectable `llvm-readobj` runner, for testing. */
  runReadobj?: RunReadobj;
  /** Injectable `ldd` runner, for testing. */
  runLdd?: RunLdd;
  /** Injectable logger (defaults to `console.log`). */
  log?: (msg: string) => void;
}

export interface BundleResult {
  /** Absolute path to the bundle root. */
  bundlePath: string;
  /** Absolute paths of executables copied into the bundle. */
  executablePaths: string[];
  /** Absolute paths of resource bundle directories copied into the bundle. */
  resourceBundlePaths: string[];
  /** Absolute paths of dynamic libraries copied into the bundle. */
  libraryPaths: string[];
}

/**
 * Produce a portable bundle. Copies the allow-listed subset of
 * `buildDirectory` into `outputDirectory`:
 *
 * 1. The named executable targets (from `executableNames`) are copied
 *    verbatim (`*.exe` on Windows; bare name on Linux/macOS).
 * 2. Every `*.resources` and `*.bundle` directory is copied verbatim so
 *    SwiftPM's generated `Bundle.module` accessor can still find resources
 *    next to the executable.
 * 3. The dynamic-library closure of each copied executable is resolved via
 *    the platform's inspection tool (`llvm-readobj` on Windows, `ldd` on
 *    Linux) and every dependency on the corresponding allow-list is copied
 *    into the bundle. On macOS no dylibs are bundled (the Swift runtime
 *    ships with the OS).
 *
 * Anything else in the build directory — SwiftPM build metadata, import
 * libraries, intermediate object directories, etc. — is ignored.
 */
export function bundle(opts: BundleOptions): BundleResult {
  const platform = opts.platform ?? currentPlatform();
  const log = opts.log ?? ((msg: string) => console.log(msg));

  const { executableNames } = opts;
  if (executableNames.length === 0) {
    throw new Error("executableNames must not be empty.");
  }

  const buildDirectory = path.resolve(opts.buildDirectory);
  const outputDirectory = path.resolve(opts.outputDirectory);

  if (!fs.existsSync(buildDirectory) || !fs.statSync(buildDirectory).isDirectory()) {
    throw new Error(`build-directory does not exist or is not a directory: ${buildDirectory}`);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });

  const executablePaths = copyExecutables(
    buildDirectory,
    outputDirectory,
    executableNames,
    platform,
    log,
  );

  const resourceBundlePaths = copyResourceBundles(buildDirectory, outputDirectory, log);

  const libraryPaths: string[] = [];
  if (platform === "windows") {
    const pathDirs = opts.pathDirs ?? splitPath(process.env.PATH ?? "", platform);
    for (const exe of executablePaths) {
      copyWindowsDllClosure({
        entry: exe,
        bundleDir: outputDirectory,
        buildDirectory,
        pathDirs,
        runReadobj: opts.runReadobj,
        visited: new Set<string>(),
        out: libraryPaths,
        log,
      });
    }
  } else if (platform === "linux") {
    for (const exe of executablePaths) {
      copyLinuxSoClosure({
        entry: exe,
        isRoot: true,
        bundleDir: outputDirectory,
        buildDirectory,
        runLdd: opts.runLdd,
        visited: new Set<string>(),
        out: libraryPaths,
        log,
      });
    }
  }
  // macOS: nothing to do; Swift stdlib is part of the OS.

  return {
    bundlePath: outputDirectory,
    executablePaths,
    resourceBundlePaths,
    libraryPaths,
  };
}

/** Splits an OS-style PATH list using the separator appropriate for `platform`. */
export function splitPath(p: string, platform: Platform): string[] {
  const sep = platform === "windows" ? ";" : ":";
  return p.split(sep).filter((s) => s.length > 0);
}

function copyExecutables(
  buildDirectory: string,
  outputDirectory: string,
  executableNames: string[],
  platform: Platform,
  log: (msg: string) => void,
): string[] {
  const copied: string[] = [];
  for (const name of executableNames) {
    const fileName = platform === "windows" ? `${name}.exe` : name;
    const src = path.join(buildDirectory, fileName);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Executable '${fileName}' not found in build directory: ${buildDirectory}`,
      );
    }
    const dst = path.join(outputDirectory, fileName);
    log(`Copying executable: ${fileName}`);
    fs.copyFileSync(src, dst);
    if (platform !== "windows") fs.chmodSync(dst, 0o755);
    copied.push(dst);

    // Carry companion debug symbols if present (Windows `.pdb`).
    if (platform === "windows") {
      const pdb = src.replace(/\.exe$/i, ".pdb");
      if (fs.existsSync(pdb)) {
        fs.copyFileSync(pdb, path.join(outputDirectory, path.basename(pdb)));
      }
    }
  }
  return copied;
}

function copyResourceBundles(
  buildDirectory: string,
  outputDirectory: string,
  log: (msg: string) => void,
): string[] {
  const copied: string[] = [];
  for (const entry of fs.readdirSync(buildDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith(".resources") && !entry.name.endsWith(".bundle")) continue;
    const src = path.join(buildDirectory, entry.name);
    const dst = path.join(outputDirectory, entry.name);
    log(`Copying resource bundle: ${entry.name}`);
    copyDirRecursive(src, dst);
    copied.push(dst);
  }
  return copied;
}

/**
 * Recursively copy a directory. Symbolic links are de-referenced and the
 * pointed-to file (or directory) is copied as a regular file: re-creating
 * the symlink would require admin privileges on Windows and would also
 * leave the bundle dependent on the absolute path the link encodes.
 */
function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    // `entry.isDirectory()` returns false for a symlink-to-directory, so
    // we use `fs.statSync` (which follows links) to make the right call.
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ---------------------------------------------------------------------------
// Windows DLL closure
// ---------------------------------------------------------------------------

interface WindowsClosureCtx {
  entry: string;
  bundleDir: string;
  buildDirectory: string;
  pathDirs: string[];
  runReadobj?: RunReadobj;
  visited: Set<string>;
  out: string[];
  log: (msg: string) => void;
}

function copyWindowsDllClosure(ctx: WindowsClosureCtx): void {
  for (const dep of getDllDependencies(ctx.entry, ctx.runReadobj)) {
    const key = dep.toLowerCase();
    if (ctx.visited.has(key)) continue;
    ctx.visited.add(key);

    const source = resolveWindowsDll(dep, ctx);
    if (source === null) continue;

    const dest = path.join(ctx.bundleDir, dep);
    if (source.toLowerCase() !== dest.toLowerCase()) {
      ctx.log(`Copying ${source}`);
      fs.copyFileSync(source, dest);
      const pdb = source.replace(/\.dll$/i, ".pdb");
      if (fs.existsSync(pdb)) {
        fs.copyFileSync(
          pdb,
          path.join(ctx.bundleDir, path.basename(dep).replace(/\.dll$/i, ".pdb")),
        );
      }
      ctx.out.push(dest);
    }

    // Always continue the walk against the bundled copy so transitive
    // imports are discovered relative to the final layout (and so test
    // stubs only need to reason about bundle-local paths).
    copyWindowsDllClosure({ ...ctx, entry: dest });
  }
}

function resolveWindowsDll(name: string, ctx: WindowsClosureCtx): string | null {
  // Build products sitting next to the executable are always kept.
  const localBundle = path.join(ctx.bundleDir, name);
  if (fs.existsSync(localBundle)) return localBundle;
  const localBuild = path.join(ctx.buildDirectory, name);
  if (fs.existsSync(localBuild)) {
    // Stage it into the bundle so the closure walk is consistent.
    const dst = path.join(ctx.bundleDir, name);
    fs.copyFileSync(localBuild, dst);
    ctx.out.push(dst);
    return dst;
  }

  if (!isAllowedWindowsDll(name)) return null;

  for (const dir of ctx.pathDirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Could not locate allow-listed DLL '${name}' on PATH.`);
}

// ---------------------------------------------------------------------------
// Linux SO closure
// ---------------------------------------------------------------------------

interface LinuxClosureCtx {
  entry: string;
  /** True when `entry` is a root executable from the build directory; false for libraries discovered transitively. */
  isRoot: boolean;
  bundleDir: string;
  buildDirectory: string;
  runLdd?: RunLdd;
  visited: Set<string>;
  out: string[];
  log: (msg: string) => void;
}

function copyLinuxSoClosure(ctx: LinuxClosureCtx): void {
  let entries: LddEntry[];
  try {
    entries = getSoDependencies(ctx.entry, ctx.runLdd);
  } catch (err) {
    // For root executables an `ldd` failure is fatal: a corrupt input,
    // a missing read permission, or `ldd` not being on PATH would
    // otherwise silently produce a bundle without any libraries and
    // mislead the user. For transitively-discovered libraries, log and
    // skip; e.g. `ldd` refuses to run on non-ELF blobs (shell wrappers,
    // linker scripts) which cannot have a dynamic closure of their own.
    if (ctx.isRoot) {
      throw new Error(
        `ldd failed on root executable '${ctx.entry}': ${(err as Error).message}`,
      );
    }
    ctx.log(`Skipping non-ELF or broken ELF: ${ctx.entry} (${(err as Error).message})`);
    return;
  }

  for (const { soname, path: resolvedPath } of entries) {
    const key = soname;
    if (ctx.visited.has(key)) continue;
    ctx.visited.add(key);

    if (!isAllowedLinuxSo(soname)) continue;

    if (resolvedPath === "" || resolvedPath === "not found") {
      throw new Error(
        `ldd could not resolve allow-listed library '${soname}' for ${ctx.entry}.`,
      );
    }

    // Build products next to the executable are kept in place.
    const localBuild = path.join(ctx.buildDirectory, soname);
    const sourceForCopy = fs.existsSync(localBuild) ? localBuild : resolvedPath;

    const dest = path.join(ctx.bundleDir, soname);
    if (path.resolve(sourceForCopy) !== path.resolve(dest)) {
      ctx.log(`Copying ${sourceForCopy}`);
      const resolved = fs.realpathSync(sourceForCopy);
      fs.copyFileSync(resolved, dest);
      ctx.out.push(dest);
    }

    // Continue the walk against the *source* file in the toolchain, not
    // the freshly-copied one in the bundle: ELF DT_RUNPATH entries like
    // `$ORIGIN` resolve relative to the file's location, and the bundle
    // is still being assembled so sibling deps are not yet present
    // there. Walking the toolchain copy keeps rpath resolution stable.
    // See the file-level comment for the matching Windows rationale.
    copyLinuxSoClosure({ ...ctx, entry: sourceForCopy, isRoot: false });
  }
}
