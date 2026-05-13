
import { type MockInstance } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as core from "@actions/core";
import { main } from "../src/run";

vi.mock("@actions/core");

function tempDir(tag: string): string {
  const id = crypto.randomBytes(6).toString("hex");
  const dir = path.join(os.tmpdir(), `sptb-run-${tag}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFakeElf(p: string): void {
  const buf = Buffer.alloc(16);
  buf[0] = 0x7f;
  buf[1] = 0x45;
  buf[2] = 0x4c;
  buf[3] = 0x46;
  fs.writeFileSync(p, buf);
  fs.chmodSync(p, 0o755);
}

/** Minimal package description JSON with one executable product. */
function fakePackageJson(name: string): string {
  return JSON.stringify({
    name,
    products: [
      { name, targets: [name], type: { executable: null } },
    ],
    targets: [
      { name, type: "executable" },
    ],
  });
}

describe("run.main()", () => {
  let setFailed: MockInstance;
  let setOutput: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    setFailed = vi.mocked(core.setFailed);
    setOutput = vi.mocked(core.setOutput);
    vi.mocked(core.group).mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn());
  });

  test("sets bundlePath and executablePaths outputs on success", async () => {
    const build = tempDir("ok-build");
    const out = tempDir("ok-out");
    writeFakeElf(path.join(build, "hello"));

    const result = await main({
      products: ["hello"],
      buildDirectory: build,
      outputDirectory: out,
      executableNames: ["hello"],
      platform: "linux",
      runLdd: () => "",
      runSwiftCommand: (args) => {
        if (args[0] === "package") return fakePackageJson("hello");
        if (args[0] === "build") return build + "\n";
        throw new Error(`unexpected swift args: ${args}`);
      },
      log: () => {},
    });

    expect(result).toBeDefined();
    expect(setFailed).toHaveBeenCalledTimes(0);
    expect(setOutput).toHaveBeenCalledWith("bundlePath", path.resolve(out));
    expect(setOutput).toHaveBeenCalledWith(
      "executablePaths",
      path.join(path.resolve(out), "hello"),
    );
  });

  test("calls setFailed with a clear message when build-directory does not exist", async () => {
    const out = tempDir("fail-out");
    const result = await main({
      products: ["hello"],
      buildDirectory: "/definitely/does/not/exist",
      outputDirectory: out,
      executableNames: ["hello"],
      platform: "linux",
      runSwiftCommand: (args) => {
        if (args[0] === "package") return fakePackageJson("hello");
        if (args[0] === "build") return "/definitely/does/not/exist\n";
        throw new Error(`unexpected swift args: ${args}`);
      },
    });
    expect(result).toBeUndefined();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(setFailed.mock.calls[0][0]).toMatch(/build-directory does not exist/);
  });

  test("reads inputs from core.getInput when overrides are not supplied", async () => {
    const build = tempDir("in-build");
    const out = tempDir("in-out");
    writeFakeElf(path.join(build, "hello"));

    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === "products") return "hello";
      if (name === "output-directory") return out;
      if (name === "source-directory") return ".";
      if (name === "config") return "release";
      return "";
    });

    await main({
      buildDirectory: build,
      executableNames: ["hello"],
      platform: "linux",
      runLdd: () => "",
      runSwiftCommand: (args) => {
        if (args[0] === "package") return fakePackageJson("hello");
        if (args[0] === "build") return build + "\n";
        throw new Error(`unexpected swift args: ${args}`);
      },
      log: () => {},
    });

    expect(setFailed).toHaveBeenCalledTimes(0);
    expect(setOutput).toHaveBeenCalledWith("bundlePath", path.resolve(out));
  });

  test("fails fast when no products are provided", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === "products") return "";
      if (name === "output-directory") return "/tmp/out";
      return "";
    });
    await main();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(setFailed.mock.calls[0][0]).toMatch(/No product names provided/);
  });
});
