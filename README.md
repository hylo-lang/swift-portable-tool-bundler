# swift-portable-tool-bundler

A GitHub Action (and Node.js library) that turns a Swift package's built
executable products into a portable, self-contained bundle: the executable plus
only the files actually needed to run it on a machine without the Swift
toolchain or the Visual C++ runtime installed.

The intended workflow is:

1. `swift build -c release --product my-tool`
2. Run this action specifying the product name(s); it parses the package
   description, resolves the executable targets, and produces an output
   directory containing:
   - The named executable(s).
   - Every SwiftPM resource bundle (`*.resources` and `*.bundle` directories
     are copied).
   - The transitive closure of allow-listed runtime dynamic libraries
     (Swift runtime, Foundation, libdispatch, and the MSVC runtime on
     Windows) are copied. (Anything else (system libraries, SwiftPM build metadata,
     import libraries, intermediate `*.build/` dirs, `*.swiftmodule`,
     `description.json`, ...) is ignored.)
3. Archive / ship the output directory however you like (`tar --zstd`,
   `zip`, etc.).

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `products` | yes | — | Newline-separated list of executable product names to bundle. |
| `source-directory` | no | `.` | Path to the Swift package root (where `Package.swift` lives). |
| `config` | no | `release` | Build configuration (`debug` or `release`). |
| `output-directory` | yes | — | Where to place the portable bundle. Created if it does not exist. |

## Outputs

| Output | Description |
|---|---|
| `bundlePath` | Absolute path to the bundle root. |
| `executablePaths` | Newline-separated list of absolute paths to bundled executables. |

## Requirements

- Node.js 24 runner (the default for modern GitHub Actions).
- **Windows**: `llvm-readobj` must be on `PATH`. It ships with the Swift
  toolchain, so any action that puts Swift on `PATH`
  (e.g. [`SwiftyLab/setup-swift`](https://github.com/SwiftyLab/setup-swift))
  is sufficient.
- **Linux**: `ldd` must be on `PATH` (standard on every distro).
- **macOS**: no extra tools are required; the Swift runtime ships with the
  OS so no dylib bundling is performed.

## Usage

```yaml
- uses: SwiftyLab/setup-swift@latest
  with:
    swift-version: "6.2"

- name: Build
  run: swift build -c release --product my-tool
  shell: pwsh

- name: Assemble portable bundle
  uses: hylo-lang/swift-portable-tool-bundler@v1
  with:
    products: my-tool
    output-directory: ${{ runner.temp }}/my-tool-bundle

- name: Archive
  shell: pwsh
  run: tar --zstd -cf my-tool.tar.zst -C "${{ runner.temp }}/my-tool-bundle" .
```

## Static-stdlib builds

Using `swift build --static-swift-stdlib` does **not** make this action
redundant on Linux or Windows. The Swift standard library is then
linked into your executable, but the build still depends dynamically on
Foundation, ICU and the MSVC runtime, all of which the bundler still
needs to resolve and copy. The CI matrix exercises both linking modes
on every supported (OS, architecture) pair so this guarantee is tested
on every commit.

On macOS `--static-swift-stdlib` collapses the closure to nothing the
action has to copy: Foundation comes from the OS-provided framework.

## Customising the allow-list

The allow-lists in [`src/allowlist.ts`](src/allowlist.ts) enumerate the
file names the bundler is willing to copy out of the dynamic-library
closure. Anything outside the lists is treated as an OS-provided
library and skipped. If your project ships its own dylib that should
travel with the executable, the simplest options are:

- Put the library next to the binary in the build directory; both the
  Windows and Linux walkers preserve build-local files unconditionally.
- Fork this repo, extend `WINDOWS_DLL_ALLOWLIST` / `LINUX_SO_ALLOWLIST`,
  and use the fork via `uses: <your-org>/swift-portable-tool-bundler@…`.

If there is a runtime library you think the upstream allow-list should
carry by default, please [open an issue](https://github.com/hylo-lang/swift-portable-tool-bundler/issues).

## Development

```sh
npm ci
npm test          # unit tests
npm run lint      # eslint
npm run build     # tsc -> build/
npm run pack      # lint + build + ncc bundle -> dist/index.js
```

Unit tests use Jest and mock `ldd` / `llvm-readobj` / the filesystem
where useful, so the whole suite runs on every host platform. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the pre-PR checklist.

## Credits

The allow-lists and dependency-walk strategy are ported from [moreSwift/swift-bundler](https://github.com/moreSwift/swift-bundler)'s `GenericWindowsBundler.swift` and `GenericLinuxBundler.swift`. Thanks for all the work!

Unlike swift-bundler, this tool **does not rename** `*.resources` directories to `*.bundle`, so apps using SwiftPM's stock `Bundle.module` accessor on Linux and Windows continue to resolve their resource bundles.
