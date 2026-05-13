
// Orchestrates assembling a portable bundle from a Swift build directory.

import * as fs from "fs";
import * as path from "path";

import { walkDependencyClosure } from "./closure-walk";
import { linuxDependencyResolver } from "./linux-closure";
import { type RunLdd } from "./dependencies-linux";
import { splitPath } from "./path-utils";
import { currentPlatform, type Platform } from "./platform";
import { windowsDependencyResolver } from "./windows-closure";
import { type RunReadobj } from "./dependencies-windows";

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

  const libraryPaths = copyLibraryClosure(executablePaths, outputDirectory, buildDirectory, platform, opts, log);

  return {
    bundlePath: outputDirectory,
    executablePaths,
    resourceBundlePaths,
    libraryPaths,
  };
}

// MARK: - Library closure

function copyLibraryClosure(
  executablePaths: readonly string[],
  outputDirectory: string,
  buildDirectory: string,
  platform: Platform,
  opts: BundleOptions,
  log: (msg: string) => void,
): string[] {
  if (platform === "windows") {
    const pathDirs = opts.pathDirs ?? splitPath(process.env.PATH ?? "", platform);
    return walkDependencyClosure(
      executablePaths,
      outputDirectory,
      windowsDependencyResolver(outputDirectory, buildDirectory, pathDirs, opts.runReadobj),
      { swallowTransitiveErrors: false, log },
    );
  }

  if (platform === "linux") {
    return walkDependencyClosure(
      executablePaths,
      outputDirectory,
      linuxDependencyResolver(outputDirectory, buildDirectory, opts.runLdd),
      { swallowTransitiveErrors: true, log },
    );
  }

  // macOS: nothing to do; Swift stdlib is part of the OS.
  return [];
}

// MARK: - Executables

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

// MARK: - Resource bundles

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
