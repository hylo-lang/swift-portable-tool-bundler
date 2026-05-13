# Contributing

Thanks for your interest in improving `swift-portable-tool-bundler`.

## Local development

```sh
npm ci          # install dev + runtime dependencies
npm test        # jest, ~30s
npm run lint    # eslint
npm run build   # tsc -> build/
npm run pack    # lint + build + ncc bundle -> dist/index.js
```

## Pre-PR checklist

1. `npm test` passes locally.
2. `npm run lint` is clean.
3. **`npm run pack` has been run and `dist/index.js` is committed.** CI
   enforces this with the `check-dist` job; PRs that forget will fail.
4. New behaviour is covered by a test in `tests/`. The closure-walk and
   filesystem-copy paths are easy to break subtly, so prefer adding a
   regression test that fakes `ldd` / `llvm-readobj` over manual
   smoke-testing.

## Code style

- TypeScript strict mode; no `any` unless commented.
- ESLint (`eslint.config.js`) is the source of truth.
- 2-space indent, LF line endings (see `.editorconfig`).
- File-level doc-comments explain *why*; inline comments explain
  non-obvious *what* and *how*.

## Commit messages

A short subject (≤72 chars) and a body that explains the *reason* for
the change. CI does not enforce a specific format.

## Releases

Tag a new release with `git tag -a vX.Y.Z -m "..."` and push the tag.
The floating `vX` major-version tag should be moved with each release
so users pinning `@v1` keep getting fixes:

```sh
git tag -fa v1 -m "Move v1 to vX.Y.Z"
git push --force origin v1
```

Releases must include a freshly-built `dist/index.js` (already enforced
by `check-dist`).
