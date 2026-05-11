# Examples

This directory holds a minimal Swift package the integration-test job
in `.github/workflows/ci.yml` builds against the action.

## `hello/`

A single-target `executableTarget` that exercises three pieces of the
Swift runtime so the bundler has to do real work on every host:

- **Foundation** (`ISO8601DateFormatter`) → forces `libFoundation.{so,dll}`
  or the system `Foundation.framework` to show up in the closure.
- **Swift concurrency** (`Task.detached`) → forces
  `libswift_Concurrency.{so,dll}` on Linux/Windows.
- **Standard library `print(_:)`** → trivial; included for sanity.

Build it directly with:

```sh
swift build -c release --product hello                       # dynamic stdlib
swift build -c release --product hello --static-swift-stdlib # static stdlib
```

The CI matrix runs both variants on every supported host and verifies
that the resulting bundle still runs in a sanitised environment with
no Swift toolchain on `PATH` (and with `LD_LIBRARY_PATH` /
`DYLD_*_PATH` cleared).

## Adding a new example

1. Drop a new SwiftPM package under `examples/<name>/`.
2. Extend the `bundle` and `verify` jobs in
   `.github/workflows/ci.yml` to build and verify it.
3. Document what runtime surface it exercises in this README.
