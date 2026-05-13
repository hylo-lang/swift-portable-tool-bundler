
// Linux SO closure strategy for `walkDependencyClosure`.
//
// Closure-walk recursion target: ELF DT_RUNPATH entries (commonly
// `$ORIGIN`) resolve relative to the file's location at the time
// `ld.so` reads it. The bundle is still being assembled so siblings
// are not yet present there; we must recurse on the **toolchain source
// path** so rpath stays valid.

import * as fs from "fs";
import * as path from "path";

import { isAllowedLinuxSo } from "./allowlist";
import { type DependencyResolver, type ResolvedDependency } from "./closure-walk";
import { getSoDependencies, type RunLdd } from "./dependencies-linux";

/**
 * Returns a `DependencyResolver` that discovers Linux shared-object
 * dependencies via `ldd` and resolves them against the build directory
 * and the paths reported by the dynamic linker.
 */
export function linuxDependencyResolver(
  bundleDir: string,
  buildDirectory: string,
  runLdd?: RunLdd,
): DependencyResolver {
  return (entry: string): ResolvedDependency[] => {
    const ds: ResolvedDependency[] = [];

    for (const { soname: SOName, path: resolvedPath } of getSoDependencies(entry, runLdd)) {
      if (!isAllowedLinuxSo(SOName)) continue;

      if (resolvedPath === "" || resolvedPath === "not found") {
        throw new Error(
          `ldd could not resolve allow-listed library '${SOName}' for ${entry}.`,
        );
      }

      // Build products next to the executable take precedence.
      const localBuild = path.join(buildDirectory, SOName);
      const sourceForWalk = fs.existsSync(localBuild) ? localBuild : resolvedPath;

      // Dereference symlinks: the bundle must contain the real file,
      // not a dangling absolute symlink back into the toolchain.
      const copySource = fs.realpathSync(sourceForWalk);

      const destination = path.join(bundleDir, SOName);
      const alreadyCopied = path.resolve(copySource) === path.resolve(destination);

      ds.push({
        bundleName: SOName,
        copySource: alreadyCopied ? undefined : copySource,
        // Recurse on the *source* in the toolchain, not the bundled copy,
        // so `$ORIGIN`-rooted rpath entries keep resolving correctly.
        recursionEntry: sourceForWalk,
      });
    }

    return ds;
  };
}
