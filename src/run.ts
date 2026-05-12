// SPDX short identifier: Apache-2.0

import * as core from "@actions/core";
import { bundle, BundleOptions, BundleResult } from "./bundler";
import {
  defaultRunSwiftCommand,
  getPackageDescription,
  getBuildBinPath,
  resolveExecutableNames,
  RunSwiftCommand,
} from "./swift-package";

export interface MainOverrides extends Partial<BundleOptions> {
  /** List of executable product names to bundle. */
  products?: string[];
  /** Override `source-directory` input. */
  sourceDirectory?: string;
  /** Override `config` input. */
  config?: string;
  /** Injectable swift command runner (for testing). */
  runSwiftCommand?: RunSwiftCommand;
}

/**
 * Reads the action inputs and runs a bundle. Exposed for testing; the
 * thin `src/action.ts` bootstrap is what the compiled `dist/index.js`
 * actually invokes at runtime.
 *
 * An optional override can be supplied to inject a pre-built
 * `MainOverrides` (typically from a test) without consulting `core.getInput`.
 */
export async function main(
  overrides?: MainOverrides,
): Promise<BundleResult | undefined> {
  try {
    const products =
      overrides?.products ??
      parseNewlineSeparated(core.getInput("products", { required: true }));
    const sourceDirectory =
      overrides?.sourceDirectory ??
      (core.getInput("source-directory") || ".");
    const config =
      overrides?.config ?? (core.getInput("config") || "release");
    const outputDirectory =
      overrides?.outputDirectory ??
      core.getInput("output-directory", { required: true });

    if (products.length === 0) {
      throw new Error("No product names provided in the 'products' input.");
    }

    core.info(`source-directory: ${sourceDirectory}`);
    core.info(`config: ${config}`);
    core.info(`products: ${products.join(", ")}`);
    core.info(`output-directory: ${outputDirectory}`);

    const runCmd = overrides?.runSwiftCommand ?? defaultRunSwiftCommand;

    const description = await core.group(
      "Parsing package description",
      async () => {
        const desc = getPackageDescription(sourceDirectory, runCmd);
        core.info(`Package: ${desc.name} (${desc.products.length} products, ${desc.targets.length} targets)`);
        return desc;
      },
    );

    const executableNames =
      overrides?.executableNames ?? resolveExecutableNames(description, products);
    core.info(`Executable targets: ${executableNames.join(", ")}`);

    const buildDirectory =
      overrides?.buildDirectory ??
      getBuildBinPath(sourceDirectory, config, runCmd);
    core.info(`build-directory (resolved): ${buildDirectory}`);

    const result = await core.group("Bundling portable tool", async () => {
      return bundle({
        buildDirectory,
        outputDirectory,
        executableNames,
        platform: overrides?.platform,
        pathDirs: overrides?.pathDirs,
        runReadobj: overrides?.runReadobj,
        runLdd: overrides?.runLdd,
        log: overrides?.log ?? ((m: string) => core.info(m)),
      });
    });

    core.setOutput("bundlePath", result.bundlePath);
    core.setOutput("executablePaths", result.executablePaths.join("\n"));

    core.info(
      `Bundle ready at ${result.bundlePath} ` +
        `(${result.executablePaths.length} executable(s), ` +
        `${result.resourceBundlePaths.length} resource bundle(s), ` +
        `${result.libraryPaths.length} runtime library/libraries).`,
    );
    return result;
  } catch (err) {
    const error = err as Error;
    if (error?.stack) core.error(error.stack);
    core.setFailed(
      `swift-portable-tool-bundler failed: '${(err ?? "undefined error").toString()}'`,
    );
    return undefined;
  }
}

/** Splits a newline-separated input into trimmed, non-empty strings. */
function parseNewlineSeparated(input: string): string[] {
  return input
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
