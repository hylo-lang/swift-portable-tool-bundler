// SPDX short identifier: Apache-2.0

export type Platform = "linux" | "windows" | "darwin";

export function currentPlatform(): Platform {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    case "darwin":
      return "darwin";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Returns true if the given file name looks like an executable on the given
 * platform. Used to auto-discover the set of entry points whose dynamic
 * library closure must be bundled.
 *
 * - Windows: `*.exe`
 * - Linux/macOS: anything without an extension, and not a known library
 *   suffix (`.so*`, `.dylib`, `.a`).
 *
 * The caller is expected to have confirmed that the path is a regular file.
 */
export function looksLikeExecutable(
  fileName: string,
  platform: Platform,
): boolean {
  if (platform === "windows") {
    return fileName.toLowerCase().endsWith(".exe");
  }
  if (/\.(so(\.\d+)*|dylib|a)$/.test(fileName)) return false;
  return !fileName.includes(".");
}
