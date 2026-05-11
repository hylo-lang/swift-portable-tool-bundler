// SPDX short identifier: Apache-2.0

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as core from "@actions/core";
import { main } from "../src/run";

jest.setTimeout(30 * 1000);

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

describe("run.main()", () => {
  let setFailed: jest.SpyInstance;
  let setOutput: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    setFailed = jest.spyOn(core, "setFailed").mockImplementation(() => {});
    setOutput = jest.spyOn(core, "setOutput").mockImplementation(() => {});
    jest.spyOn(core, "info").mockImplementation(() => {});
    jest.spyOn(core, "error").mockImplementation(() => {});
    jest
      .spyOn(core, "group")
      .mockImplementation(async (_name: string, fn: any) => fn());
  });

  test("sets bundlePath and executablePaths outputs on success", async () => {
    const build = tempDir("ok-build");
    const out = tempDir("ok-out");
    writeFakeElf(path.join(build, "hello"));

    const result = await main({
      buildFolder: build,
      outputDirectory: out,
      platform: "linux",
      runLdd: () => "",
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

  test("calls setFailed with a clear message when build-folder does not exist", async () => {
    const out = tempDir("fail-out");
    const result = await main({
      buildFolder: "/definitely/does/not/exist",
      outputDirectory: out,
      platform: "linux",
    });
    expect(result).toBeUndefined();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(setFailed.mock.calls[0][0]).toMatch(/build-folder does not exist/);
  });

  test("reads inputs from core.getInput when overrides are not supplied", async () => {
    const build = tempDir("in-build");
    const out = tempDir("in-out");
    writeFakeElf(path.join(build, "hello"));

    const getInput = jest
      .spyOn(core, "getInput")
      .mockImplementation((name: string) => {
        if (name === "build-folder") return build;
        if (name === "output-directory") return out;
        return "";
      });

    await main({
      platform: "linux",
      runLdd: () => "",
      log: () => {},
    });

    expect(setFailed).toHaveBeenCalledTimes(0);
    expect(setOutput).toHaveBeenCalledWith("bundlePath", path.resolve(out));
    getInput.mockRestore();
  });

  test("fails fast when the required 'build-folder' input is absent", async () => {
    const getInput = jest
      .spyOn(core, "getInput")
      .mockImplementation(() => "");
    await main();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(setFailed.mock.calls[0][0]).toMatch(/build-folder/);
    getInput.mockRestore();
  });
});
