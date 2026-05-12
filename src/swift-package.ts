// SPDX short identifier: Apache-2.0
//
// Helpers for invoking SwiftPM commands and parsing package descriptions.

import { execFileSync } from "child_process";

// ---------------------------------------------------------------------------
// Types — subset of `swift package describe --type json`
// ---------------------------------------------------------------------------

export interface SwiftProductType {
  executable?: null;
  library?: string[];
}

export interface SwiftProduct {
  name: string;
  targets: string[];
  type: SwiftProductType;
}

export interface SwiftTarget {
  name: string;
  type: string;
}

export interface SwiftPackageDescription {
  name: string;
  products: SwiftProduct[];
  targets: SwiftTarget[];
}

// ---------------------------------------------------------------------------
// Command runners (injectable for testing)
// ---------------------------------------------------------------------------

export type RunSwiftCommand = (args: string[], cwd: string) => string;

export const defaultRunSwiftCommand: RunSwiftCommand = (args, cwd) =>
  execFileSync("swift", args, {
    encoding: "utf8",
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs `swift package describe --type json` in `sourceDir` and returns the
 * parsed package description.
 */
export function getPackageDescription(
  sourceDir: string,
  run: RunSwiftCommand = defaultRunSwiftCommand,
): SwiftPackageDescription {
  const output = run(["package", "describe", "--type", "json"], sourceDir);
  return JSON.parse(output) as SwiftPackageDescription;
}

/**
 * Runs `swift build --show-bin-path -c <config>` in `sourceDir` and returns
 * the trimmed absolute path to the build products directory.
 */
export function getBuildBinPath(
  sourceDir: string,
  config: string,
  run: RunSwiftCommand = defaultRunSwiftCommand,
): string {
  const output = run(["build", "--show-bin-path", "-c", config], sourceDir);
  return output.trim();
}

/**
 * Given a package description and a list of product names, resolves the
 * executable target names for those products. Throws if a product is not
 * found or is not an executable.
 *
 * Returns de-duplicated target names (the file names of the built
 * executables in the build directory).
 */
export function resolveExecutableNames(
  description: SwiftPackageDescription,
  productNames: string[],
): string[] {
  const targetNames = new Set<string>();

  for (const name of productNames) {
    const product = description.products.find((p) => p.name === name);
    if (!product) {
      throw new Error(
        `Product '${name}' not found in package '${description.name}'. ` +
          `Available products: ${description.products.map((p) => p.name).join(", ")}.`,
      );
    }
    if (!("executable" in product.type)) {
      throw new Error(
        `Product '${name}' is not an executable (type: ${JSON.stringify(product.type)}).`,
      );
    }
    for (const t of product.targets) {
      targetNames.add(t);
    }
  }

  return [...targetNames];
}
