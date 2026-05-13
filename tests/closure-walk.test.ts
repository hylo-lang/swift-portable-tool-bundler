
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { walkDependencyClosure, type ResolvedDependency } from "../src/closure-walk";

function tempDir(tag: string): string {
  const id = crypto.randomBytes(6).toString("hex");
  const dir = path.join(os.tmpdir(), `sptb-cw-${tag}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("walkDependencyClosure()", () => {
  test("copies resolved dependencies into the bundle directory", () => {
    const bundleDir = tempDir("copy");
    const sourceDir = tempDir("src");
    fs.writeFileSync(path.join(sourceDir, "libA.so"), "a-contents");

    const resolve = (_entry: string): ResolvedDependency[] => [
      {
        bundleName: "libA.so",
        copySource: path.join(sourceDir, "libA.so"),
        recursionEntry: path.join(sourceDir, "libA.so"),
      },
    ];

    const copied = walkDependencyClosure(
      [path.join(bundleDir, "hello")],
      bundleDir,
      resolve,
      { swallowTransitiveErrors: false, log: () => {} },
    );

    expect(copied).toEqual([path.join(bundleDir, "libA.so")]);
    expect(fs.readFileSync(path.join(bundleDir, "libA.so"), "utf8")).toBe("a-contents");
  });

  test("deduplicates by bundleName across multiple roots", () => {
    const bundleDir = tempDir("dedup");
    const sourceDir = tempDir("src");
    fs.writeFileSync(path.join(sourceDir, "libA.so"), "a");

    let callCount = 0;
    const resolve = (_entry: string): ResolvedDependency[] => {
      callCount++;
      return [{
        bundleName: "libA.so",
        copySource: path.join(sourceDir, "libA.so"),
        recursionEntry: path.join(sourceDir, "libA.so"),
      }];
    };

    const copied = walkDependencyClosure(
      ["/fake/exe1", "/fake/exe2"],
      bundleDir,
      resolve,
      { swallowTransitiveErrors: false, log: () => {} },
    );

    // libA.so should appear only once despite two roots returning it.
    expect(copied).toEqual([path.join(bundleDir, "libA.so")]);
    // The resolver was called for both roots plus one transitive call.
    // After the first root processes libA.so and marks it visited,
    // the second root's resolve still runs but libA.so is skipped.
    expect(callCount).toBe(3);
  });

  test("skips copy when copySource is undefined (already in bundle)", () => {
    const bundleDir = tempDir("skip");
    fs.writeFileSync(path.join(bundleDir, "libA.so"), "already-there");

    const resolve = (entry: string): ResolvedDependency[] => {
      if (path.basename(entry) === "hello") {
        return [{
          bundleName: "libA.so",
          copySource: undefined,
          recursionEntry: path.join(bundleDir, "libA.so"),
        }];
      }
      return [];
    };

    const copied = walkDependencyClosure(
      [path.join(bundleDir, "hello")],
      bundleDir,
      resolve,
      { swallowTransitiveErrors: false, log: () => {} },
    );

    expect(copied).toEqual([]);
    // File should remain untouched.
    expect(fs.readFileSync(path.join(bundleDir, "libA.so"), "utf8")).toBe("already-there");
  });

  test("copies companion files alongside the main dependency", () => {
    const bundleDir = tempDir("companion");
    const sourceDir = tempDir("src");
    fs.writeFileSync(path.join(sourceDir, "libA.dll"), "dll");
    fs.writeFileSync(path.join(sourceDir, "libA.pdb"), "pdb");

    const resolve = (_entry: string): ResolvedDependency[] => [{
      bundleName: "libA.dll",
      copySource: path.join(sourceDir, "libA.dll"),
      recursionEntry: path.join(bundleDir, "libA.dll"),
      companions: [{ source: path.join(sourceDir, "libA.pdb"), destName: "libA.pdb" }],
    }];

    walkDependencyClosure(
      ["/fake/exe"],
      bundleDir,
      resolve,
      { swallowTransitiveErrors: false, log: () => {} },
    );

    expect(fs.existsSync(path.join(bundleDir, "libA.pdb"))).toBe(true);
    expect(fs.readFileSync(path.join(bundleDir, "libA.pdb"), "utf8")).toBe("pdb");
  });

  test("swallowTransitiveErrors: true skips failing transitive dependencies", () => {
    const bundleDir = tempDir("swallow");
    const sourceDir = tempDir("src");
    fs.writeFileSync(path.join(sourceDir, "libA.so"), "a");

    const resolve = (entry: string): ResolvedDependency[] => {
      if (path.basename(entry) === "hello") {
        return [{
          bundleName: "libA.so",
          copySource: path.join(sourceDir, "libA.so"),
          recursionEntry: path.join(sourceDir, "libA.so"),
        }];
      }
      throw new Error("ldd failed on non-ELF");
    };

    const logs: string[] = [];
    const copied = walkDependencyClosure(
      [path.join(bundleDir, "hello")],
      bundleDir,
      resolve,
      { swallowTransitiveErrors: true, log: (m) => logs.push(m) },
    );

    expect(copied).toEqual([path.join(bundleDir, "libA.so")]);
    expect(logs.some((m) => m.includes("Skipping"))).toBe(true);
  });

  test("swallowTransitiveErrors: true still throws on root entries", () => {
    const bundleDir = tempDir("root-throw");

    const resolve = (): ResolvedDependency[] => {
      throw new Error("ldd: command not found");
    };

    expect(() =>
      walkDependencyClosure(
        [path.join(bundleDir, "hello")],
        bundleDir,
        resolve,
        { swallowTransitiveErrors: true, log: () => {} },
      ),
    ).toThrow(/Dependency resolution failed on root entry/);
  });

  test("swallowTransitiveErrors: false propagates transitive errors", () => {
    const bundleDir = tempDir("propagate");
    const sourceDir = tempDir("src");
    fs.writeFileSync(path.join(sourceDir, "libA.so"), "a");

    const resolve = (entry: string): ResolvedDependency[] => {
      if (path.basename(entry) === "hello") {
        return [{
          bundleName: "libA.so",
          copySource: path.join(sourceDir, "libA.so"),
          recursionEntry: path.join(sourceDir, "libA.so"),
        }];
      }
      throw new Error("readobj failed");
    };

    expect(() =>
      walkDependencyClosure(
        [path.join(bundleDir, "hello")],
        bundleDir,
        resolve,
        { swallowTransitiveErrors: false, log: () => {} },
      ),
    ).toThrow(/readobj failed/);
  });

  test("terminates on cyclic dependencies", () => {
    const bundleDir = tempDir("cycle");
    const sourceDir = tempDir("src");
    fs.writeFileSync(path.join(sourceDir, "libA.so"), "a");
    fs.writeFileSync(path.join(sourceDir, "libB.so"), "b");

    let calls = 0;
    const resolve = (entry: string): ResolvedDependency[] => {
      calls++;
      if (calls > 50) throw new Error("walk did not terminate");
      const base = path.basename(entry);
      if (base === "hello" || base === "libB.so") {
        return [{
          bundleName: "libA.so",
          copySource: path.join(sourceDir, "libA.so"),
          recursionEntry: path.join(sourceDir, "libA.so"),
        }];
      }
      if (base === "libA.so") {
        return [{
          bundleName: "libB.so",
          copySource: path.join(sourceDir, "libB.so"),
          recursionEntry: path.join(sourceDir, "libB.so"),
        }];
      }
      return [];
    };

    walkDependencyClosure(
      [path.join(bundleDir, "hello")],
      bundleDir,
      resolve,
      { swallowTransitiveErrors: false, log: () => {} },
    );

    expect(calls).toBeLessThanOrEqual(10);
  });
});
