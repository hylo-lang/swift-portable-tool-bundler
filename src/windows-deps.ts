// SPDX short identifier: Apache-2.0
//
// Windows DLL dependency discovery via `llvm-readobj --coff-imports`.
// Ported from swift-windows-dll-bundler's `scripts/Bundle-Dlls.ps1`.

import { execFileSync } from "child_process";

export type RunReadobj = (args: string[]) => string;

/** Default runner: invokes `llvm-readobj` from PATH. */
export const defaultReadobj: RunReadobj = (args) =>
  execFileSync("llvm-readobj", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Hard cap so a wedged or hung llvm-readobj cannot stall a CI run.
    timeout: 30_000,
  });

/**
 * Parse the Import-table output of `llvm-readobj --coff-imports` and return
 * the list of imported DLL base names (preserving case as emitted).
 *
 * Throws if the output does not contain any `Import {` section, which is a
 * reliable indicator that either the input is not a PE file or the tool
 * failed silently.
 */
export function parseCoffImports(output: string, modulePath: string): string[] {
  const chunks = output.split(/Import\s*\{/);
  if (chunks.length < 2) {
    throw new Error(
      `llvm-readobj produced no Import sections for '${modulePath}'. Output was:\n${output}`,
    );
  }

  const deps: string[] = [];
  const nameRe = /^\s*Name:\s*(\S+)\s*$/m;
  for (let i = 1; i < chunks.length; i++) {
    const m = nameRe.exec(chunks[i]);
    if (!m) {
      throw new Error(
        `Could not find 'Name:' field in Import block #${i} of '${modulePath}'. Block was:\n${chunks[i]}`,
      );
    }
    deps.push(m[1]);
  }
  return deps;
}

/** Directly runs `llvm-readobj --coff-imports` and parses the output. */
export function getDllDependencies(
  modulePath: string,
  run: RunReadobj = defaultReadobj,
): string[] {
  const output = run(["--coff-imports", modulePath]);
  return parseCoffImports(output, modulePath);
}
