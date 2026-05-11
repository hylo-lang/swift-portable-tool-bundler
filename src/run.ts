// SPDX short identifier: Apache-2.0

import * as core from "@actions/core";
import { bundle, BundleOptions, BundleResult } from "./bundler";

/**
 * Reads the action inputs and runs a bundle. Exposed for testing; the
 * thin `src/action.ts` bootstrap is what the compiled `dist/index.js`
 * actually invokes at runtime.
 *
 * An optional override can be supplied to inject a pre-built
 * `BundleOptions` (typically from a test) without consulting `core.getInput`.
 */
export async function main(
  overrides?: Partial<BundleOptions>,
): Promise<BundleResult | undefined> {
  try {
    const buildFolder =
      overrides?.buildFolder ??
      core.getInput("build-folder", { required: true });
    const outputDirectory =
      overrides?.outputDirectory ??
      core.getInput("output-directory", { required: true });

    core.info(`build-folder: ${buildFolder}`);
    core.info(`output-directory: ${outputDirectory}`);

    const result = await core.group("Bundling portable tool", async () => {
      return bundle({
        ...overrides,
        buildFolder,
        outputDirectory,
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
