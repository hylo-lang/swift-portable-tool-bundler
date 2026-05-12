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
