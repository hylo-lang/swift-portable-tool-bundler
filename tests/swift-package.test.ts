
import {
  resolveExecutableNames,
  getPackageDescription,
  getBuildBinPath,
  SwiftPackageDescription,
} from "../src/swift-package";

const EXAMPLE_DESCRIPTION: SwiftPackageDescription = {
  name: "hylo-lsp",
  products: [
    {
      name: "HyloLanguageServerCore",
      targets: ["HyloLanguageServerCore"],
      type: { library: ["automatic"] },
    },
    {
      name: "hylo-language-server",
      targets: ["hylo-language-server"],
      type: { executable: null },
    },
  ],
  targets: [
    {
      name: "hylo-language-server",
      type: "executable",
    },
    {
      name: "HyloLanguageServerCore",
      type: "library",
    },
  ],
};

describe("resolveExecutableNames()", () => {
  test("resolves an executable product to its target names", () => {
    const names = resolveExecutableNames(EXAMPLE_DESCRIPTION, [
      "hylo-language-server",
    ]);
    expect(names).toEqual(["hylo-language-server"]);
  });

  test("throws for an unknown product name", () => {
    expect(() =>
      resolveExecutableNames(EXAMPLE_DESCRIPTION, ["nonexistent"]),
    ).toThrow(/Product 'nonexistent' not found/);
  });

  test("throws for a library product", () => {
    expect(() =>
      resolveExecutableNames(EXAMPLE_DESCRIPTION, ["HyloLanguageServerCore"]),
    ).toThrow(/not an executable/);
  });

  test("de-duplicates target names across multiple products", () => {
    const desc: SwiftPackageDescription = {
      ...EXAMPLE_DESCRIPTION,
      products: [
        {
          name: "tool-a",
          targets: ["shared-target"],
          type: { executable: null },
        },
        {
          name: "tool-b",
          targets: ["shared-target", "extra"],
          type: { executable: null },
        },
      ],
    };
    const names = resolveExecutableNames(desc, ["tool-a", "tool-b"]);
    expect(names.sort()).toEqual(["extra", "shared-target"]);
  });
});

describe("getPackageDescription()", () => {
  test("parses output from the swift command runner", () => {
    const fakeRunner = () => JSON.stringify(EXAMPLE_DESCRIPTION);
    const result = getPackageDescription("/fake/dir", fakeRunner);
    expect(result.name).toBe("hylo-lsp");
    expect(result.products).toHaveLength(2);
  });

  test("throws on invalid JSON", () => {
    const fakeRunner = () => "not json at all";
    expect(() => getPackageDescription("/fake/dir", fakeRunner)).toThrow();
  });
});

describe("getBuildBinPath()", () => {
  test("trims whitespace from the output", () => {
    const fakeRunner = () => "  /path/to/build/release  \n";
    const result = getBuildBinPath("/fake/dir", "release", fakeRunner);
    expect(result).toBe("/path/to/build/release");
  });
});
