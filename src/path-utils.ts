import { type Platform } from "./platform";

/** Splits an OS-style PATH list using the separator appropriate for `platform`. */
export function splitPath(p: string, platform: Platform): string[] {
  const sep = platform === "windows" ? ";" : ":";
  return p.split(sep).filter((s) => s.length > 0);
}
