// SPDX short identifier: Apache-2.0
//
// Orchestrates assembling a portable bundle from a Swift build directory.

import * as fs from "fs";
import * as path from "path";

import { isAllowedLinuxSo, isAllowedWindowsDll } from "./allowlist";
import { currentPlatform, looksLikeExecutable, Platform } from "./platform";
import { getDllDependencies, RunReadobj } from "./windows-deps";
import { getSoDependencies, LddEntry, RunLdd } from "./linux-deps";

export interface BundleOptions {
  /** Source Swift build products directory. */
  buildFolder: string;
  /** Destination bundle directory. Created if missing. */
  outputDirectory: string;
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
 * `buildFolder` into `outputDirectory`:
 *
 * 1. Every executable (`*.exe` on Windows; any extensionless regular file
 *    on Linux/macOS) is copied verbatim.
 * 2. Every `*.resources` and `*.bundle` directory is copied verbatim so
 *    SwiftPM's generated `Bundle.module` accessor can still find resources
 *    next to the executable.
 * 3. The dynamic-library closure of each copied executable is resolved via
 *    the platform's inspection tool (`llvm-readobj` on Windows, `ldd` on
 *    Linux) and every dependency on the corresponding allow-list is copied
 *    into the bundle. On macOS no dylibs are bundled (the Swift runtime
 *    ships with the OS).
 *
 * Anything else in the build folder — SwiftPM build metadata, import
 * libraries, intermediate object directories, etc. — is ignored.
 */
export function bundle(opts: BundleOptions): BundleResult {
  const platform = opts.platform ?? currentPlatform();
  const log = opts.log ?? ((msg: string) => console.log(msg));

  const buildFolder = path.resolve(opts.buildFolder);
  const outputDirectory = path.resolve(opts.outputDirectory);

  if (!fs.existsSync(buildFolder) || !fs.statSync(buildFolder).isDirectory()) {
    throw new Error(`build-folder does not exist or is not a directory: ${buildFolder}`);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });

  const executablePaths = copyExecutables(buildFolder, outputDirectory, platform, log);
  if (executablePaths.length === 0) {
    throw new Error(
      `No executables found in build-folder: ${buildFolder}. ` +
        `Nothing to bundle.`,
    );
  }

  const resourceBundlePaths = copyResourceBundles(buildFolder, outputDirectory, log);

  const libraryPaths: string[] = [];
  if (platform === "windows") {
    const pathDirs = opts.pathDirs ?? splitPath(process.env.PATH ?? "");
    for (const exe of executablePaths) {
      copyWindowsDllClosure({
        entry: exe,
        bundleDir: outputDirectory,
        buildFolder,
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
        bundleDir: outputDirectory,
        buildFolder,
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

function splitPath(p: string): string[] {
  const sep = process.platform === "win32" ? ";" : ":";
  return p.split(sep).filter((s) => s.length > 0);
}

function copyExecutables(
  buildFolder: string,
  outputDirectory: string,
  platform: Platform,
  log: (msg: string) => void,
): string[] {
  const copied: string[] = [];
  for (const entry of fs.readdirSync(buildFolder, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!looksLikeExecutable(entry.name, platform)) continue;
    const src = path.join(buildFolder, entry.name);
    if (!isProbablyExecutableFile(src, platform)) continue;
    const dst = path.join(outputDirectory, entry.name);
    log(`Copying executable: ${entry.name}`);
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

/**
 * Fast, magic-number based executable detection. Avoids treating scripts,
 * text files, or random artifacts as executables just because they lack an
 * extension.
 */
function isProbablyExecutableFile(
  absPath: string,
  platform: Platform,
): boolean {
  let fd: number | undefined;
  try {
    fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    if (platform === "windows") {
      return buf[0] === 0x4d && buf[1] === 0x5a; // "MZ"
    }
    if (platform === "linux") {
      return buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46; // "\x7fELF"
    }
    // macOS Mach-O: any of several magic numbers.
    const magic = buf.readUInt32LE(0);
    return (
      magic === 0xfeedface ||
      magic === 0xcefaedfe ||
      magic === 0xfeedfacf ||
      magic === 0xcffaedfe ||
      magic === 0xcafebabe ||
      magic === 0xbebafeca
    );
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function copyResourceBundles(
  buildFolder: string,
  outputDirectory: string,
  log: (msg: string) => void,
): string[] {
  const copied: string[] = [];
  for (const entry of fs.readdirSync(buildFolder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith(".resources") && !entry.name.endsWith(".bundle")) continue;
    const src = path.join(buildFolder, entry.name);
    const dst = path.join(outputDirectory, entry.name);
    log(`Copying resource bundle: ${entry.name}`);
    copyDirRecursive(src, dst);
    copied.push(dst);
  }
  return copied;
}

function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(s), d);
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
  buildFolder: string;
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
  const localBuild = path.join(ctx.buildFolder, name);
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
  bundleDir: string;
  buildFolder: string;
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
    // `ldd` refuses to run on non-ELF files (e.g. shell wrappers); such
    // inputs can't have a dynamic closure.
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
    const localBuild = path.join(ctx.buildFolder, soname);
    const sourceForCopy = fs.existsSync(localBuild) ? localBuild : resolvedPath;

    const dest = path.join(ctx.bundleDir, soname);
    if (path.resolve(sourceForCopy) !== path.resolve(dest)) {
      ctx.log(`Copying ${sourceForCopy}`);
      const resolved = fs.realpathSync(sourceForCopy);
      fs.copyFileSync(resolved, dest);
      ctx.out.push(dest);
    }

    copyLinuxSoClosure({ ...ctx, entry: dest });
  }
}
