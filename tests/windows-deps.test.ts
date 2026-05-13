
import { getDllDependencies, parseCoffImports } from "../src/dependencies-windows";

const SAMPLE_COFF_IMPORTS = `File: hello.exe
Format: COFF-x86-64
Arch: x86_64
AddressSize: 64bit
Import {
  Name: KERNEL32.dll
  ImportLookupTableRVA: 0x2000
  ImportAddressTableRVA: 0x3000
}
Import {
  Name: swiftCore.dll
  ImportLookupTableRVA: 0x2100
  ImportAddressTableRVA: 0x3100
}
Import {
  Name: Foundation.dll
  ImportLookupTableRVA: 0x2200
  ImportAddressTableRVA: 0x3200
}
`;

describe("parseCoffImports", () => {
  test("extracts all imported DLL names in order", () => {
    expect(parseCoffImports(SAMPLE_COFF_IMPORTS, "hello.exe")).toEqual([
      "KERNEL32.dll",
      "swiftCore.dll",
      "Foundation.dll",
    ]);
  });

  test("throws when there are no Import sections", () => {
    expect(() => parseCoffImports("unrelated text", "bad.exe")).toThrow(
      /no Import sections/i,
    );
  });

  test("throws when a section is missing a Name field", () => {
    const bad = "Import {\n  ImportLookupTableRVA: 0x0\n}\n";
    expect(() => parseCoffImports(bad, "bad.exe")).toThrow(
      /Could not find 'Name:'/,
    );
  });
});

describe("getDllDependencies", () => {
  test("invokes the injected readobj runner with --coff-imports", () => {
    const calls: string[][] = [];
    const ds = getDllDependencies("C:\\path\\hello.exe", (args) => {
      calls.push(args);
      return SAMPLE_COFF_IMPORTS;
    });
    expect(calls).toEqual([["--coff-imports", "C:\\path\\hello.exe"]]);
    expect(ds).toContain("swiftCore.dll");
  });
});
