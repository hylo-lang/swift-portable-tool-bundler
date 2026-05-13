
// Linux shared-object dependency discovery via `ldd`.
// Ported from swift-bundler's `GenericLinuxBundler.swift`.

import { execFileSync } from "child_process";

/** Runs `ldd` on `modulePath` and returns its stdout. */
export type RunLdd = (modulePath: string) => string;

/** Default runner: invokes the system `ldd`. */
export const defaultLdd: RunLdd = (modulePath) =>
  execFileSync("ldd", [modulePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Hard cap so a wedged or hung ldd cannot stall a CI run.
    timeout: 30_000,
  });

export interface LddEntry {
  /** `SONAME` as reported by the dynamic linker, e.g. `libFoundation.so.6.2`. */
  soname: string;
  /** Absolute path on the host filesystem, e.g. `/usr/lib/swift/linux/libFoundation.so.6.2`. */
  path: string;
}

/**
 * Parses `ldd` output into `(soname, path)` pairs. Lines without a `=>` link
 * (e.g. `linux-vdso.so.1`, the dynamic linker itself) are ignored. Lines
 * where the resolved path is `not found` are kept with the sentinel path so
 * callers can surface a clear error for missing allow-listed libraries.
 */
export function parseLdd(output: string): LddEntry[] {
  const entries: LddEntry[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || !line.includes("=>")) continue;
    const [left, right] = line.split("=>").map((s) => s.trim());
    const soname = left.split(/\s+/)[0];
    // Strip trailing load-address annotation `(0x00007fff...)`.
    const path = right.replace(/\s*\(0x[0-9a-f]+\)\s*$/i, "").trim();
    entries.push({ soname, path });
  }
  return entries;
}

/** Runs `ldd` on `modulePath` and returns the parsed `(soname, path)` entries. */
export function getSoDependencies(
  modulePath: string,
  run: RunLdd = defaultLdd,
): LddEntry[] {
  return parseLdd(run(modulePath));
}
