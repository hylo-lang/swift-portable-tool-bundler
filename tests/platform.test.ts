// SPDX short identifier: Apache-2.0

import { looksLikeExecutable } from "../src/platform";

describe("looksLikeExecutable", () => {
  test("Windows: only `.exe` files", () => {
    expect(looksLikeExecutable("hello.exe", "windows")).toBe(true);
    expect(looksLikeExecutable("HELLO.EXE", "windows")).toBe(true);
    expect(looksLikeExecutable("hello", "windows")).toBe(false);
    expect(looksLikeExecutable("hello.dll", "windows")).toBe(false);
  });

  test("Linux: extensionless names only", () => {
    expect(looksLikeExecutable("hello", "linux")).toBe(true);
    expect(looksLikeExecutable("hello-tool", "linux")).toBe(true);
    expect(looksLikeExecutable("hello.sh", "linux")).toBe(false);
    expect(looksLikeExecutable("libFoo.so", "linux")).toBe(false);
    expect(looksLikeExecutable("libFoo.so.1", "linux")).toBe(false);
    expect(looksLikeExecutable("libFoo.a", "linux")).toBe(false);
  });

  test("macOS: extensionless names only (no .dylib/.a)", () => {
    expect(looksLikeExecutable("hello", "darwin")).toBe(true);
    expect(looksLikeExecutable("libFoo.dylib", "darwin")).toBe(false);
    expect(looksLikeExecutable("libFoo.a", "darwin")).toBe(false);
  });
});
