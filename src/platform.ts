
/** A supported operating-system family. */
export type Platform = "linux" | "windows" | "darwin";

/** Returns the `Platform` corresponding to the running Node.js process. */
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
