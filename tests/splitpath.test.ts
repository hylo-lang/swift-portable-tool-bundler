
import { splitPath } from "../src/path-utils";

describe("splitPath", () => {
  test("uses ';' on Windows", () => {
    expect(splitPath("C:\\a;C:\\b\\c;C:\\d", "windows")).toEqual([
      "C:\\a",
      "C:\\b\\c",
      "C:\\d",
    ]);
  });

  test("uses ':' on Linux", () => {
    expect(splitPath("/usr/bin:/bin:/usr/local/bin", "linux")).toEqual([
      "/usr/bin",
      "/bin",
      "/usr/local/bin",
    ]);
  });

  test("uses ':' on macOS", () => {
    expect(splitPath("/usr/bin:/bin", "darwin")).toEqual(["/usr/bin", "/bin"]);
  });

  test("filters out empty entries (e.g. trailing or doubled separators)", () => {
    expect(splitPath("/a::/b:", "linux")).toEqual(["/a", "/b"]);
    expect(splitPath("C:\\a;;C:\\b;", "windows")).toEqual(["C:\\a", "C:\\b"]);
  });

  test("returns an empty array for an empty input", () => {
    expect(splitPath("", "linux")).toEqual([]);
    expect(splitPath("", "windows")).toEqual([]);
  });
});
