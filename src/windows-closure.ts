// Windows DLL closure strategy for `walkDependencyClosure`.
//
// Closure-walk recursion target: Windows imports are resolved by *name*
// (no rpath concept), so after copying a DLL into the bundle we recurse
// on the **bundled copy**. This keeps the walk anchored to the final
// layout and lets test stubs reason exclusively about bundle-local paths.

import * as fs from "fs";
import * as path from "path";

import { isAllowedWindowsDll } from "./allowlist";
import { type DependencyResolver, type ResolvedDependency } from "./closure-walk";
import { getDllDependencies, type RunReadobj } from "./dependencies-windows";

/**
 * Returns a `DependencyResolver` that discovers Windows DLL imports via
 * `llvm-readobj` and resolves them against the bundle, build directory,
 * and PATH in that order.
 */
export function windowsDependencyResolver(
  bundleDir: string,
  buildDirectory: string,
  pathDirs: readonly string[],
  runReadobj?: RunReadobj,
): DependencyResolver {
  return (entry: string): ResolvedDependency[] => {
    const ds: ResolvedDependency[] = [];

    for (const name of getDllDependencies(entry, runReadobj)) {
      const dest = path.join(bundleDir, name);

      const lowered = name.toLowerCase();

      // Already in the bundle (copied by a previous iteration).
      if (fs.existsSync(dest)) {
        ds.push({
          bundleName: name,
          deduplicationKey: lowered,
          copySource: undefined,
          recursionEntry: dest,
        });
        continue;
      }

      // Build product sitting next to the executable.
      const inBuild = path.join(buildDirectory, name);
      if (fs.existsSync(inBuild)) {
        ds.push({
          bundleName: name,
          deduplicationKey: lowered,
          copySource: inBuild,
          recursionEntry: dest,
          companions: pdbCompanion(inBuild, name),
        });
        continue;
      }

      // Allow-listed library found on PATH.
      if (!isAllowedWindowsDll(name)) continue;

      const onPath = findOnPath(name, pathDirs);
      if (onPath === undefined) {
        throw new Error(`Could not locate allow-listed DLL '${name}' on PATH.`);
      }

      ds.push({
        bundleName: name,
        deduplicationKey: lowered,
        copySource: onPath,
        recursionEntry: dest,
        companions: pdbCompanion(onPath, name),
      });
    }

    return ds;
  };
}

/**
 * Returns a companion entry for the `.pdb` debug-symbol file next to
 * `dllSource`, if any.
 */
function pdbCompanion(
  dllSource: string,
  dllName: string,
): ResolvedDependency["companions"] {
  const pdb = dllSource.replace(/\.dll$/i, ".pdb");
  if (!fs.existsSync(pdb)) return undefined;
  return [{ source: pdb, destName: dllName.replace(/\.dll$/i, ".pdb") }];
}

/** Returns the first file named `name` found in `dirs`, if any. */
function findOnPath(name: string, dirs: readonly string[]): string | undefined {
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}
