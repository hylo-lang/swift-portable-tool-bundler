# Coding Guidelines

Our conventions are inspired by the [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/), adapted for TypeScript/Node.js development. This document describes project-specific guidelines not already enforced by ESLint or `tsconfig.json`.

## Documentation

Documentation enables local reasoning - it's a shortcut for understanding so readers can avoid looking up implementation or usages to infer meaning.

- Every exported declaration must have a TSDoc comment that describes its contract.
  - Start with a summary sentence fragment.
    - Describe what a function does and what it returns.
    - Describe what a type, interface, or constant is.
    - Separate the fragment from any additional documentation with a blank line and end it with a period.

  - Preconditions, postconditions, and invariants obviously implied by the summary need not be explicitly documented.

  - Declarations that implement an interface requirement are exempted when nothing useful can be added to the documentation of the interface member itself.

- Document the performance of every operation that doesn't execute in constant time and space, unless it's obvious from the summary.
- Test cases need not be documented, but should have a descriptive test name.

- Phrasing conventions:
  - Omit needless words: don't repeat the receiver's type, don't write `the`, `given`, `of this` when context makes these obvious.
  - Use `iff` instead of `if` where applicable.
  - Use `` `true` iff ...`` rather than `Whether ...`
  - Use `<...>, if any.` for optional values where the absence reason is obvious. Otherwise: `<...> if <condition>, undefined otherwise.`
  - Document preconditions with `@throws` or a `- Requires:` note in the description. If multiple preconditions apply, use a markdown list.
- For types and interfaces, the summary should say what the type *is*. For functions, it should say what they *do* (e.g. returns, resolves, yields ...).
- Describe if there is a significance in the element order of an array.

## Contracts

- Create the strictest contracts possible.
- Preconditions and postconditions are relationships between components - think in terms of what the caller must provide and what the callee guarantees in return.
- Contract evolution: you may safely weaken preconditions and strengthen postconditions. The reverse breaks clients, so you must inspect all call sites before introducing the change.
- When a contract seems too strict to use correctly without accidentally breaking preconditions, you can either relax the preconditions (e.g. `demandModule(name)` - gets or creates the module if it doesn't exist yet) or report an error/return undefined (e.g. `myMap.get(key)` - returns undefined if key is not found).

## Errors

When a contract seems too strict to use correctly without accidentally breaking preconditions, you can either relax the preconditions or return `undefined`.

Don't swallow errors silently, make sure they reach the user in the appropriate way.

## Type Safety

- When using a type assertion (`as`), a non-null assertion (`!`), or `any`, include a comment that justifies the need and explains why it's guaranteed to be correct. Avoid type assertions as much as possible.
- Never use `any`.

## Algorithms

- Prefer named algorithms over inline loops. A loop is a mechanism; a named function is a statement of intent.
- When a suitable utility doesn't exist, create one as a standalone function or as a method on a purpose-built class rather than inlining the logic at the call site.
- Structure data so efficient algorithms become possible (e.g. storing something in a sorted array for binary search, or storing in a `Map`/`Set` for O(1) lookup).

## Types

- Use TypeScript's type system to encode invariants. If a value can only be valid in certain states, make invalid states unrepresentable (discriminated unions, branded types, `readonly`, no unnecessary optionals).
- Prefer immutable data (`readonly` properties, `ReadonlyArray`, `as const`) and functional-style transformations when possible.
- Avoid classes unless you need encapsulated mutable state or integration with frameworks that require them. Prefer plain objects + functions.

## Naming and API design

- Name mutating functions with imperative verb phrases; name pure/query functions with nouns or adjectives describing the result.
- No abbreviations in APIs unless universally known (e.g. `URL`, `ID`, `IO`).
- Don't include the type in a binding's name. The binding name should describe the role of the value. If nothing else, a single-letter variable name can be fine in small scopes.
- If the type is too weak, a qualified name can help (e.g. `outputDirectory: string`), but prefer making the type more strict to capture the invariants (e.g. using a branded `DirectoryPath`/`FilePath` type).
- When naming a collection of objects, use plural form: `files`, `xs`, `ms`.
- Prefer descriptive parameter names over generic ones like `value` or `data`.
- Minimize the exported surface area. Keep helpers and internal types unexported (`not exported` is the default; explicitly `export` only what consumers need). Exposing previously internal details should be discussed during reviews.

## Testing

- All new code should be covered by tests.
- Tests should exercise the contract: verify postconditions under valid preconditions.
- Use descriptive test names that state the scenario and expected outcome.
- Prefer `vitest` conventions: `describe` blocks for grouping, `it`/`test` for individual cases.

## Formatting

- Indent with 2 spaces.
- Use LF line endings (see `.editorconfig`).
- Use a 100-column line limit as a soft guide.
- Prefer `const` over `let`; never use `var`.
- Use `// MARK:` or to organize sections.
- Prefer splitting files into smaller, focused files.
- Avoid deeply nested callbacks; prefer `async`/`await` over `.then()` chains.
- Prefer early returns over deeply nested conditionals.
- Use `===` and `!==` over `==` and `!=`.

## File names

All TypeScript source files end with the extension `.ts`.

- Use `kebab-case` for file names.
- In general, a file is named after the main concept it implements.
- Avoid defining many unrelated exports in the same file unless they are tightly coupled and small.

## Project-specific conventions

- Use the term `kind` exclusively to refer to the kind of a type.
- TypeScript strict mode is always enabled; do not weaken `tsconfig.json` strictness flags.
- ESLint (`eslint.config.mjs`) is the source of truth for mechanical style; these guidelines cover intent and design that linters cannot enforce.
