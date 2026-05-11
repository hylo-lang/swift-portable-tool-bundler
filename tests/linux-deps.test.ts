// SPDX short identifier: Apache-2.0

import { getSoDependencies, parseLdd } from "../src/linux-deps";

const SAMPLE_LDD_OUTPUT = `	linux-vdso.so.1 (0x00007ffd7af43000)
	libFoundation.so.6.2 => /usr/lib/swift/linux/libFoundation.so.6.2 (0x00007f9c12a00000)
	libswiftCore.so => /usr/lib/swift/linux/libswiftCore.so (0x00007f9c12000000)
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f9c11c00000)
	/lib64/ld-linux-x86-64.so.2 (0x00007f9c13100000)
`;

describe("parseLdd", () => {
  test("extracts (soname, path) pairs for `=>` lines only", () => {
    expect(parseLdd(SAMPLE_LDD_OUTPUT)).toEqual([
      {
        soname: "libFoundation.so.6.2",
        path: "/usr/lib/swift/linux/libFoundation.so.6.2",
      },
      {
        soname: "libswiftCore.so",
        path: "/usr/lib/swift/linux/libswiftCore.so",
      },
      { soname: "libc.so.6", path: "/lib/x86_64-linux-gnu/libc.so.6" },
    ]);
  });

  test("retains `not found` paths so callers can surface a clear error", () => {
    const out = "\tlibBroken.so => not found\n";
    expect(parseLdd(out)).toEqual([{ soname: "libBroken.so", path: "not found" }]);
  });

  test("handles empty output", () => {
    expect(parseLdd("")).toEqual([]);
  });
});

describe("getSoDependencies", () => {
  test("invokes the injected ldd runner", () => {
    const calls: string[] = [];
    const deps = getSoDependencies("/bin/hello", (m) => {
      calls.push(m);
      return SAMPLE_LDD_OUTPUT;
    });
    expect(calls).toEqual(["/bin/hello"]);
    expect(deps.map((d) => d.soname)).toContain("libswiftCore.so");
  });
});
