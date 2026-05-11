// SPDX short identifier: Apache-2.0

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { bundle } from "../src/bundler";

jest.setTimeout(30 * 1000);

function tempDir(tag: string): string {
  const id = crypto.randomBytes(6).toString("hex");
  const dir = path.join(os.tmpdir(), `sptb-${tag}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** ELF magic + 12 zero bytes so the magic-number sniff picks it up. */
function writeFakeElf(p: string): void {
  const buf = Buffer.alloc(16);
  buf[0] = 0x7f;
  buf[1] = 0x45; // 'E'
  buf[2] = 0x4c; // 'L'
  buf[3] = 0x46; // 'F'
  fs.writeFileSync(p, buf);
  fs.chmodSync(p, 0o755);
}

/** PE magic (MZ) so the sniff treats the file as a Windows executable. */
function writeFakePe(p: string): void {
  const buf = Buffer.alloc(64);
  buf[0] = 0x4d;
  buf[1] = 0x5a;
  fs.writeFileSync(p, buf);
}

describe("bundle()", () => {
  test("errors out when build-directory is missing", () => {
    expect(() =>
      bundle({
        buildDirectory: "/definitely/does/not/exist",
        outputDirectory: tempDir("missing-out"),
        platform: "linux",
      }),
    ).toThrow(/build-directory does not exist/);
  });

  test("errors out when build-directory has no executables", () => {
    const build = tempDir("empty-build");
    const out = tempDir("empty-out");
    fs.writeFileSync(path.join(build, "README.txt"), "hello");
    expect(() =>
      bundle({ buildDirectory: build, outputDirectory: out, platform: "linux" }),
    ).toThrow(/No executables found/);
  });

  test("copies resource bundles with names preserved (.resources and .bundle)", () => {
    const build = tempDir("res-build");
    const out = tempDir("res-out");

    writeFakeElf(path.join(build, "hello"));

    fs.mkdirSync(path.join(build, "Hylo_StandardLibrary.resources"));
    fs.writeFileSync(
      path.join(build, "Hylo_StandardLibrary.resources", "hylo.json"),
      "{}",
    );

    fs.mkdirSync(path.join(build, "Other_Module.bundle"));
    fs.writeFileSync(
      path.join(build, "Other_Module.bundle", "data.txt"),
      "x",
    );

    // Noise that must not be copied.
    fs.mkdirSync(path.join(build, "hello.build"));
    fs.writeFileSync(path.join(build, "hello.build", "junk.o"), "o");
    fs.writeFileSync(path.join(build, "description.json"), "{}");

    const result = bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: () => "", // no dynamic deps
      log: () => {},
    });

    expect(result.executablePaths.map((p) => path.basename(p))).toEqual([
      "hello",
    ]);
    expect(
      result.resourceBundlePaths.map((p) => path.basename(p)).sort(),
    ).toEqual(["Hylo_StandardLibrary.resources", "Other_Module.bundle"]);

    expect(
      fs.existsSync(
        path.join(out, "Hylo_StandardLibrary.resources", "hylo.json"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(out, "Other_Module.bundle", "data.txt")),
    ).toBe(true);

    // Verify noise was NOT copied.
    expect(fs.existsSync(path.join(out, "hello.build"))).toBe(false);
    expect(fs.existsSync(path.join(out, "description.json"))).toBe(false);
    expect(result.libraryPaths).toEqual([]);
  });

  test("creates the output directory when missing", () => {
    const build = tempDir("mk-build");
    const out = path.join(tempDir("mk-root"), "nested", "bundle");
    writeFakeElf(path.join(build, "hello"));
    expect(fs.existsSync(out)).toBe(false);
    bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: () => "",
      log: () => {},
    });
    expect(fs.existsSync(out)).toBe(true);
  });

  test("ignores non-executable extensionless files (magic-number sniff)", () => {
    const build = tempDir("sniff-build");
    const out = tempDir("sniff-out");
    writeFakeElf(path.join(build, "hello"));
    fs.writeFileSync(path.join(build, "README"), "not an ELF");
    const result = bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: () => "",
      log: () => {},
    });
    expect(result.executablePaths.map((p) => path.basename(p))).toEqual([
      "hello",
    ]);
    expect(fs.existsSync(path.join(out, "README"))).toBe(false);
  });

  test("Linux: bundles allow-listed SOs from ldd output", () => {
    const build = tempDir("linux-build");
    const out = tempDir("linux-out");

    writeFakeElf(path.join(build, "hello"));

    // Fake system-provided Swift runtime library next to a real path.
    const fakeSystemRoot = tempDir("linux-system");
    const systemLib = path.join(fakeSystemRoot, "libswiftCore.so");
    fs.writeFileSync(systemLib, "fake-so-contents");

    const result = bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: () =>
        [
          "\tlinux-vdso.so.1 (0x00007ffd7af43000)",
          `\tlibswiftCore.so => ${systemLib} (0x00007f9c12000000)`,
          "\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f9c11c00000)",
          "",
        ].join("\n"),
      log: () => {},
    });

    expect(result.libraryPaths.map((p) => path.basename(p))).toEqual([
      "libswiftCore.so",
    ]);
    expect(fs.existsSync(path.join(out, "libswiftCore.so"))).toBe(true);
    expect(fs.existsSync(path.join(out, "libc.so.6"))).toBe(false);
  });

  test("Linux: closure walk uses the toolchain source path so $ORIGIN rpath stays valid", () => {
    // Regression test for the bug where we recursed on the bundled copy
    // of a library, after which `ldd` could not find sibling deps that
    // had not yet been copied into the bundle.
    const build = tempDir("rpath-build");
    const out = tempDir("rpath-out");
    const toolchain = tempDir("rpath-tc");

    writeFakeElf(path.join(build, "hello"));
    fs.writeFileSync(path.join(toolchain, "libswiftCore.so"), "fake");
    fs.writeFileSync(path.join(toolchain, "libdispatch.so"), "fake");

    const lddInputs: string[] = [];
    const result = bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: (modulePath) => {
        lddInputs.push(modulePath);
        // Use path.basename rather than literal "/hello" suffix matching
        // so the test works on Windows hosts (where path.join uses "\").
        const base = path.basename(modulePath);
        if (base === "hello") {
          return `\tlibswiftCore.so => ${path.join(toolchain, "libswiftCore.so")} (0x0)\n`;
        }
        if (path.resolve(modulePath) === path.resolve(toolchain, "libswiftCore.so")) {
          return `\tlibdispatch.so => ${path.join(toolchain, "libdispatch.so")} (0x0)\n`;
        }
        if (path.resolve(modulePath) === path.resolve(toolchain, "libdispatch.so")) {
          return "";
        }
        throw new Error(`unexpected ldd target: ${modulePath}`);
      },
      log: () => {},
    });

    expect(result.libraryPaths.map((p) => path.basename(p)).sort()).toEqual([
      "libdispatch.so",
      "libswiftCore.so",
    ]);
    // The walk must have reached the toolchain copy of libswiftCore.so,
    // not the bundle copy, so its $ORIGIN-rooted deps resolve.
    expect(lddInputs).toContain(path.join(toolchain, "libswiftCore.so"));
    expect(lddInputs).not.toContain(path.join(out, "libswiftCore.so"));
  });

  test("Linux: copies the realpath target when the SO is reached through a symlink", () => {
    // Toolchains commonly ship `libFoo.so -> libFoo.so.6` versioned
    // symlinks. The bundle must contain the actual file contents, not
    // a dangling absolute symlink to the toolchain.
    const build = tempDir("symlink-build");
    const out = tempDir("symlink-out");
    const toolchain = tempDir("symlink-tc");

    writeFakeElf(path.join(build, "hello"));
    const real = path.join(toolchain, "libswiftCore.so.6.2");
    fs.writeFileSync(real, "real-contents");
    const link = path.join(toolchain, "libswiftCore.so");
    fs.symlinkSync(real, link);

    bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: (modulePath) => {
        if (path.basename(modulePath) === "hello") {
          return `\tlibswiftCore.so => ${link} (0x0)\n`;
        }
        return "";
      },
      log: () => {},
    });

    const bundled = path.join(out, "libswiftCore.so");
    expect(fs.existsSync(bundled)).toBe(true);
    expect(fs.lstatSync(bundled).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(bundled, "utf8")).toBe("real-contents");
  });

  test("Linux: terminates on cyclic SO dependencies", () => {
    // Pathological but possible: A imports B, B imports A. The walk must
    // de-dup by SONAME and not blow the stack.
    const build = tempDir("cycle-build");
    const out = tempDir("cycle-out");
    const toolchain = tempDir("cycle-tc");

    writeFakeElf(path.join(build, "hello"));
    fs.writeFileSync(path.join(toolchain, "libswiftCore.so"), "a");
    fs.writeFileSync(path.join(toolchain, "libdispatch.so"), "b");

    let calls = 0;
    bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: (modulePath) => {
        calls++;
        if (calls > 50) throw new Error("walk did not terminate");
        const base = path.basename(modulePath);
        if (base === "hello") {
          return `\tlibswiftCore.so => ${path.join(toolchain, "libswiftCore.so")} (0x0)\n`;
        }
        if (base === "libswiftCore.so") {
          return `\tlibdispatch.so => ${path.join(toolchain, "libdispatch.so")} (0x0)\n`;
        }
        if (base === "libdispatch.so") {
          // Cycle back into libswiftCore.so.
          return `\tlibswiftCore.so => ${path.join(toolchain, "libswiftCore.so")} (0x0)\n`;
        }
        return "";
      },
      log: () => {},
    });

    expect(calls).toBeLessThanOrEqual(10);
  });

  test("Linux: errors out when ldd itself fails on the root executable", () => {
    const build = tempDir("ldd-fail-build");
    const out = tempDir("ldd-fail-out");
    writeFakeElf(path.join(build, "hello"));
    expect(() =>
      bundle({
        buildDirectory: build,
        outputDirectory: out,
        platform: "linux",
        runLdd: () => {
          throw new Error("ldd: command not found");
        },
        log: () => {},
      }),
    ).toThrow(/ldd failed on root executable/);
  });

  test("Linux: errors out when an allow-listed SO is 'not found'", () => {
    const build = tempDir("linux-nf-build");
    const out = tempDir("linux-nf-out");
    writeFakeElf(path.join(build, "hello"));
    expect(() =>
      bundle({
        buildDirectory: build,
        outputDirectory: out,
        platform: "linux",
        runLdd: () => "\tlibswiftCore.so => not found\n",
        log: () => {},
      }),
    ).toThrow(/could not resolve allow-listed library 'libswiftCore\.so'/);
  });

  test("Windows: bundles allow-listed DLLs from llvm-readobj output", () => {
    const build = tempDir("win-build");
    const out = tempDir("win-out");
    const systemDir = tempDir("win-system");

    writeFakePe(path.join(build, "hello.exe"));
    // Fake a system-provided Swift DLL on PATH.
    fs.writeFileSync(
      path.join(systemDir, "swiftCore.dll"),
      Buffer.from([0x4d, 0x5a]),
    );

    // After `copyExecutables`, the closure walk targets the exe inside the
    // bundle, not the source in the build directory.
    const readobjOutputs: Record<string, string> = {
      [path.join(out, "hello.exe")]: [
        "Import {",
        "  Name: KERNEL32.dll",
        "}",
        "Import {",
        "  Name: swiftCore.dll",
        "}",
        "",
      ].join("\n"),
      [path.join(out, "swiftCore.dll")]: "Import {\n  Name: KERNEL32.dll\n}\n",
    };

    const seenInputs: string[] = [];
    const result = bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "windows",
      pathDirs: [systemDir],
      runReadobj: (args) => {
        const modulePath = args[1];
        seenInputs.push(modulePath);
        const canonical = path.resolve(modulePath);
        for (const [key, value] of Object.entries(readobjOutputs)) {
          if (path.resolve(key) === canonical) return value;
        }
        throw new Error(`unexpected readobj target: ${modulePath}`);
      },
      log: () => {},
    });

    expect(result.libraryPaths.map((p) => path.basename(p))).toEqual([
      "swiftCore.dll",
    ]);
    expect(fs.existsSync(path.join(out, "swiftCore.dll"))).toBe(true);
    expect(seenInputs.length).toBeGreaterThanOrEqual(2); // walked the closure
  });

  test("Windows: throws when an allow-listed DLL is not on PATH", () => {
    const build = tempDir("win-nf-build");
    const out = tempDir("win-nf-out");
    writeFakePe(path.join(build, "hello.exe"));
    expect(() =>
      bundle({
        buildDirectory: build,
        outputDirectory: out,
        platform: "windows",
        pathDirs: [],
        runReadobj: () => "Import {\n  Name: swiftCore.dll\n}\n",
        log: () => {},
      }),
    ).toThrow(/Could not locate allow-listed DLL 'swiftCore\.dll'/);
  });

  test("macOS: copies executable and resource bundles; never invokes a dylib tool", () => {
    const build = tempDir("mac-build");
    const out = tempDir("mac-out");

    // Mach-O magic (MH_MAGIC_64).
    const buf = Buffer.alloc(16);
    buf.writeUInt32LE(0xfeedfacf, 0);
    fs.writeFileSync(path.join(build, "hello"), buf);
    fs.chmodSync(path.join(build, "hello"), 0o755);

    fs.mkdirSync(path.join(build, "Hylo_StandardLibrary.bundle"));
    fs.writeFileSync(
      path.join(build, "Hylo_StandardLibrary.bundle", "data.txt"),
      "x",
    );

    const result = bundle({
      buildDirectory: build,
      outputDirectory: out,
      platform: "darwin",
      runLdd: () => {
        throw new Error("ldd must not be invoked on darwin");
      },
      runReadobj: () => {
        throw new Error("llvm-readobj must not be invoked on darwin");
      },
      log: () => {},
    });

    expect(result.executablePaths.map((p) => path.basename(p))).toEqual([
      "hello",
    ]);
    expect(
      result.resourceBundlePaths.map((p) => path.basename(p)),
    ).toEqual(["Hylo_StandardLibrary.bundle"]);
    expect(result.libraryPaths).toEqual([]);
  });
});
