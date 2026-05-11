// SPDX short identifier: Apache-2.0

import {
  isAllowedLinuxSo,
  isAllowedWindowsDll,
  WINDOWS_DLL_ALLOWLIST,
  LINUX_SO_ALLOWLIST,
} from "../src/allowlist";

describe("Windows DLL allow-list", () => {
  test("matches case-insensitively", () => {
    expect(isAllowedWindowsDll("swiftCore.dll")).toBe(true);
    expect(isAllowedWindowsDll("SWIFTCORE.DLL")).toBe(true);
    expect(isAllowedWindowsDll("swiftcore.dll")).toBe(true);
  });

  test("rejects system DLLs", () => {
    expect(isAllowedWindowsDll("KERNEL32.dll")).toBe(false);
    expect(isAllowedWindowsDll("api-ms-win-core-xyz.dll")).toBe(false);
    expect(isAllowedWindowsDll("ntdll.dll")).toBe(false);
  });

  test("covers Swift + Foundation + MSVC runtime DLLs", () => {
    for (const dll of [
      "swiftCore.dll",
      "swiftDispatch.dll",
      "Foundation.dll",
      "FoundationEssentials.dll",
      "vcruntime140.dll",
      "msvcp140.dll",
      "dispatch.dll",
    ]) {
      expect(isAllowedWindowsDll(dll)).toBe(true);
    }
  });

  test("allow-list entries all end in .dll", () => {
    for (const name of WINDOWS_DLL_ALLOWLIST) {
      expect(name.toLowerCase().endsWith(".dll")).toBe(true);
    }
  });
});

describe("Linux SO allow-list", () => {
  test("strips .so version suffix", () => {
    expect(isAllowedLinuxSo("libFoundation.so.6.2")).toBe(true);
    expect(isAllowedLinuxSo("libFoundation.so")).toBe(true);
    expect(isAllowedLinuxSo("libFoundation.so.1")).toBe(true);
  });

  test("rejects system libraries", () => {
    expect(isAllowedLinuxSo("libc.so.6")).toBe(false);
    expect(isAllowedLinuxSo("libpthread.so.0")).toBe(false);
    expect(isAllowedLinuxSo("ld-linux-x86-64.so.2")).toBe(false);
  });

  test("covers Swift + Foundation + ICU", () => {
    for (const so of [
      "libswiftCore.so",
      "libFoundation.so",
      "libdispatch.so",
      "libicudata.so.74",
      "libicuuc.so",
    ]) {
      expect(isAllowedLinuxSo(so)).toBe(true);
    }
  });

  test("allow-list entries do not include file extensions", () => {
    for (const name of LINUX_SO_ALLOWLIST) {
      expect(name.endsWith(".so")).toBe(false);
    }
  });
});
