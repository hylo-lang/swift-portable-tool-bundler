# Security policy

## Supported versions

Only the latest tagged release of `swift-portable-tool-bundler` receives
security fixes. Pin a major version (e.g. `@v1`) in your workflows to
pick up patch releases automatically.

## Reporting a vulnerability

Please **do not** file a public issue for security problems. Instead use
GitHub's private vulnerability reporting:

<https://github.com/hylo-lang/swift-portable-tool-bundler/security/advisories/new>

We aim to acknowledge reports within 5 business days and to publish a
fix within 30 days for confirmed issues.

## Threat model in scope

This action shells out to `llvm-readobj` and `ldd` and copies files
based on their output. Reports are in scope when an attacker who
controls a Swift build directory or tampered toolchain binaries can:

- cause arbitrary file writes outside `output-directory`,
- exfiltrate environment variables or repo contents,
- or smuggle a malicious DLL/SO past the allow-list and into the bundle.

Reports are out of scope when the host toolchain itself is compromised:
this action trusts the binaries the toolchain produces.
