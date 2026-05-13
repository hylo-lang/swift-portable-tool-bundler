// Generic dynamic-library closure walker. Platform-specific resolution
// strategies (Windows DLL, Linux SO) plug in via `DependencyResolver`.

import * as fs from "fs";
import * as path from "path";

/** A resolved dependency ready to be copied into the bundle. */
export interface ResolvedDependency {
  /** Filename in the bundle directory. */
  bundleName: string;
  /**
   * Key for visited-set deduplication.
   *
   * Defaults to `bundleName` when `undefined`. Set explicitly when the
   * dedup criterion differs from the filename (e.g. case-insensitive
   * matching on Windows).
   */
  deduplicationKey?: string;
  /** Absolute path to copy from, or `undefined` if already in the bundle. */
  copySource: string | undefined;
  /** Path to recurse into for transitive dependency discovery. */
  recursionEntry: string;
  /**
   * Companion files to copy alongside the main library, if any.
   *
   * e.g. `.pdb` debug symbols on Windows.
   */
  companions?: ReadonlyArray<{ source: string; destName: string }>;
}

/**
 * Resolves the dynamic dependencies of a single binary into entries that
 * should be copied into the bundle.
 *
 * Entries not on the allow-list or otherwise irrelevant are excluded from
 * the returned array.
 */
export type DependencyResolver = (entry: string) => ResolvedDependency[];

export interface ClosureWalkOptions {
  /**
   * `true` iff errors thrown by the resolver on transitive (non-root)
   * entries should be logged and skipped rather than propagated.
   *
   * Linux needs this because `ldd` fails on non-ELF blobs (e.g. shell
   * wrappers) that cannot have a dynamic closure of their own. Windows
   * does not.
   */
  swallowTransitiveErrors: boolean;
  /** Logger for copy and skip messages. */
  log: (msg: string) => void;
}

/**
 * Walk the dynamic-library closure of `roots`, copying every dependency
 * returned by `resolve` into `bundleDir`.
 *
 * Returns the absolute paths of all files copied into the bundle
 * (excluding companions).
 */
export function walkDependencyClosure(
  roots: readonly string[],
  bundleDir: string,
  resolve: DependencyResolver,
  options: ClosureWalkOptions,
): string[] {
  const visited = new Set<string>();
  const copied: string[] = [];
  const rootSet = new Set(roots.map((r) => path.resolve(r)));

  function walk(entry: string): void {
    let ds: ResolvedDependency[];
    try {
      ds = resolve(entry);
    } catch (e) {
      if (options.swallowTransitiveErrors && !rootSet.has(path.resolve(entry))) {
        // Guaranteed: resolve implementations only throw Error instances.
        options.log(`Skipping non-ELF or broken ELF: ${entry} (${(e as Error).message})`);
        return;
      }
      if (rootSet.has(path.resolve(entry))) {
        throw new Error(
          // Guaranteed: resolve implementations only throw Error instances.
          `Dependency resolution failed on root entry '${entry}': ${(e as Error).message}`,
        );
      }
      throw e;
    }

    for (const d of ds) {
      const key = d.deduplicationKey ?? d.bundleName;
      if (visited.has(key)) continue;
      visited.add(key);

      if (d.copySource !== undefined) {
        const dest = path.join(bundleDir, d.bundleName);
        options.log(`Copying ${d.copySource}`);
        fs.copyFileSync(d.copySource, dest);
        copied.push(dest);
      }

      if (d.companions) {
        for (const c of d.companions) {
          fs.copyFileSync(c.source, path.join(bundleDir, c.destName));
        }
      }

      walk(d.recursionEntry);
    }
  }

  for (const root of roots) walk(root);
  return copied;
}
