# Arc Toolchain Reference

This document covers every command, flag, and configuration option in the Arc toolchain.

---

## Table of Contents

1. [Overview](#overview)
2. [arc build](#arc-build)
3. [arc test](#arc-test)
4. [arc fmt](#arc-fmt)
5. [arc lint](#arc-lint)
6. [arc dev](#arc-dev)
7. [arc init](#arc-init)
8. [arc add](#arc-add)
9. [arc install](#arc-install)
10. [--lsp (Language Server)](#--lsp-language-server)
11. [--ssr / --hydrate (Server-Side Rendering)](#--ssr----hydrate-server-side-rendering)
12. [Direct Compilation Mode](#direct-compilation-mode)
13. [Arc.toml Configuration](#arctoml-configuration)

---

## Overview

The `arc` command-line tool is the central entry point for compiling, testing, formatting, linting, and running Arc programs. It also includes a development server, package manager, and language server.

```
arc [COMMAND] [OPTIONS] [FILE]

Commands:
  build     Compile the project (and its dependencies)
  test      Compile and run test blocks
  fmt       Format Arc source files
  lint      Run the linter on Arc source files
  dev       Start the development server with hot reload
  init      Initialize a new Arc project
  add       Add a dependency to Arc.toml
  install   Resolve and download all dependencies

Flags:
  --lsp     Start the Language Server Protocol server
  --help    Show help information
  --version Show version information
```

---

## arc build

Compile Arc source files to WebAssembly.

### Usage

```sh
arc build <input> [OPTIONS]
```

### Arguments

| Argument | Description |
|---|---|
| `<input>` | Source file to compile (`.arc`) |

### Flags

| Flag | Description |
|---|---|
| `-o`, `--output <file>` | Output file path (default: `<input>.wat` or `<input>.wasm`) |
| `--emit-wasm` | Emit binary `.wasm` instead of `.wat` text format |
| `--ssr` | Emit SSR (server-side rendering) JavaScript module |
| `--hydrate` | Emit client hydration bundle |
| `--no-check` | Skip borrow checker and type checker |
| `-O`, `--optimize <level>` | Optimization level: 0, 1, or 2 (default: 0) |

### Optimization Levels

| Level | Description | Passes |
|---|---|---|
| `-O0` | No optimizations (default) | None |
| `-O1` | Basic optimizations | Constant folding + Dead code elimination |
| `-O2` | Full optimizations | All of `-O1` + Tree shaking + WASM-level peephole optimization |

### Output Formats

| Format | Flag | Extension | Description |
|---|---|---|---|
| WAT | (default) | `.wat` | WebAssembly Text Format -- human-readable, useful for debugging |
| WASM | `--emit-wasm` | `.wasm` | Binary WebAssembly -- production-ready, smaller size |
| SSR | `--ssr` | `.ssr.js` | JavaScript module for server-side rendering |
| Hydrate | `--hydrate` | `.hydrate.wat` | Client-side hydration bundle |

### Examples

```sh
# Basic compilation to WAT
arc build app.arc

# Compile to binary WASM with full optimization
arc build app.arc --emit-wasm -O2

# Compile with custom output path
arc build src/main.arc -o dist/app.wasm --emit-wasm

# Server-side rendering
arc build app.arc --ssr

# Client hydration bundle
arc build app.arc --hydrate

# Skip checks for faster iteration
arc build app.arc --no-check
```

### Compilation Pipeline

When you run `arc build`, the compiler performs these steps in order:

1. **Dependency resolution** -- resolves `Arc.toml` dependencies (if present)
2. **Lexing** -- tokenizes the source file
3. **Parsing** -- builds an AST with error recovery
4. **Module loading** -- resolves and loads `mod` declarations
5. **Borrow checking** -- validates ownership rules (unless `--no-check`)
6. **Type checking** -- Hindley-Milner type inference (unless `--no-check`)
7. **Exhaustiveness checking** -- warns about non-exhaustive match patterns
8. **Optimization** -- runs enabled optimization passes
9. **Code generation** -- emits WAT, WASM, SSR JS, or hydration bundle

---

## arc test

Compile and run test blocks defined with the `test` keyword.

### Usage

```sh
arc test <input> [OPTIONS]
```

### Arguments

| Argument | Description |
|---|---|
| `<input>` | Source file containing tests (`.arc`) |

### Flags

| Flag | Description |
|---|---|
| `--filter <pattern>` | Only run tests whose name contains `<pattern>` |

### Test Discovery

The test runner finds all top-level `test "name" { ... }` blocks in the specified file. Tests are validated through the full compilation pipeline (lex, parse, borrow check, type check, codegen).

### Test Output

```
running 3 tests
  test addition works ... ok
  test string concat ... ok
  test user creation ... ok

test result: ok. 3 passed; 0 failed
```

### Filtering Tests

```sh
# Run only tests containing "user" in their name
arc test tests.arc --filter "user"
```

### Examples

```sh
arc test tests.arc
arc test tests.arc --filter "auth"
```

---

## arc fmt

Format Arc source files according to canonical style.

### Usage

```sh
arc fmt [OPTIONS] [<input>]
```

### Flags

| Flag | Description |
|---|---|
| `<input>` | Source file to format (`.arc`) |
| `--check` | Check formatting without writing changes. Exits with code 1 if reformatting is needed |
| `--stdin` | Read source from stdin instead of a file (output goes to stdout) |

### Formatting Rules

The formatter applies these canonical style rules:

- **Indentation**: 4 spaces
- **Braces**: opening brace on the same line as the declaration
- **Trailing commas**: added after the last item in lists
- **Line length**: long expressions are wrapped at reasonable widths
- **Blank lines**: one blank line between top-level items
- **Semicolons**: consistent semicolon placement for statements

### Editor Integration

**VS Code**: Install the Arc extension (which uses `--lsp`) for format-on-save, or configure `arc fmt --stdin` as an external formatter.

**Neovim**: Configure in your `init.lua`:

```lua
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*.arc",
  callback = function()
    vim.cmd("silent !arc fmt " .. vim.fn.expand("%"))
    vim.cmd("edit")
  end,
})
```

### CI Integration

Use `--check` in continuous integration to verify formatting:

```sh
arc fmt --check src/main.arc || (echo "Run 'arc fmt' to fix formatting" && exit 1)
```

### Examples

```sh
# Format a file in place
arc fmt app.arc

# Check without modifying
arc fmt --check app.arc

# Format from stdin (e.g., pipe from another command)
cat app.arc | arc fmt --stdin
```

---

## arc lint

Run static analysis on Arc source files.

### Usage

```sh
arc lint <input> [OPTIONS]
```

### Flags

| Flag | Description |
|---|---|
| `<input>` | Source file to lint (`.arc`) |
| `--fix` | Attempt to auto-fix warnings (where supported) |

### Lint Rules

The linter checks for 10 rules, all enabled by default:

#### 1. `unused-variable` (Warning)

Detects variables that are declared but never used. Prefix with `_` to suppress.

```arc
// Warning: variable `x` is declared but never used
let x = 42;

// OK: prefixed with underscore
let _x = 42;
```

#### 2. `unused-function` (Warning)

Detects private functions that are defined but never called.

```arc
// Warning: function `helper` is defined but never called
fn helper() { }
```

#### 3. `unused-import` (Warning)

Detects imported names that are never referenced in the file.

```arc
// Warning: imported name `utils` is never used
use std::utils;
```

#### 4. `mutable-not-mutated` (Warning)

Detects variables declared as `mut` but never assigned to after declaration.

```arc
// Warning: variable `count` is declared as `mut` but is never mutated
let mut count = 0;
println(count);  // only read, never written
```

#### 5. `empty-block` (Warning)

Detects functions, if blocks, or else blocks with empty bodies.

```arc
// Warning: function `todo` has an empty body
fn todo() { }

// Warning: if block has an empty body
if condition { }
```

#### 6. `snake-case-functions` (Warning)

Functions and methods should use `snake_case` naming.

```arc
// Warning: function `myFunction` should use snake_case naming
fn myFunction() { }

// OK
fn my_function() { }
```

#### 7. `pascal-case-types` (Warning)

Types (structs, enums, components, stores, traits) should use `PascalCase` naming.

```arc
// Warning: struct `my_struct` should use PascalCase naming
struct my_struct { }

// OK
struct MyStruct { }
```

#### 8. `unreachable-code` (Warning)

Detects code after a `return` statement in the same block.

```arc
fn example() -> i32 {
    return 42;
    let x = 10;  // Warning: unreachable code after return statement
}
```

#### 9. `single-match` (Info)

Suggests using `if let` when a `match` has only one non-wildcard arm.

```arc
// Info: this match has a single non-wildcard arm; consider using `if let`
match value {
    Some(x) => use(x),
    _ => {},
}
```

#### 10. `redundant-clone` (Info)

Flags `.clone()` calls that may be unnecessary if the source variable is not used afterwards.

```arc
// Info: `data.clone()` may be redundant -- consider moving instead
let copy = data.clone();
```

### Output Format

Lint warnings follow this format:

```
<file>:<line>:<column>: <severity> [<rule>] <message>
```

Example:

```
app.arc:12:5: warning [unused-variable] variable `x` is declared but never used
app.arc:20:1: warning [snake-case-functions] function `myHandler` should use snake_case naming
```

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | No warnings or errors |
| 1 | One or more warnings or errors found |

### Examples

```sh
# Lint a file
arc lint app.arc

# Lint with auto-fix
arc lint app.arc --fix
```

---

## arc dev

Start a development server with hot reload.

### Usage

```sh
arc dev [OPTIONS]
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--src <dir>` | `.` | Source directory to watch |
| `--build-dir <dir>` | `./build` | Build output directory |
| `-p`, `--port <port>` | `3000` | Port to serve on |

### How It Works

The dev server:

1. **Starts an HTTP server** on the specified port, serving the build directory
2. **Watches `.arc` files** in the source directory using filesystem polling
3. **Recompiles on change** when a source file is modified
4. **Notifies the browser** via WebSocket to hot-reload the updated WASM module

### WebSocket Protocol

The dev server communicates with the browser runtime using a simple WebSocket protocol:

- **Server to Client**: `"reload"` -- signals that the WASM module has been recompiled and should be reloaded
- The client runtime reconnects automatically if the WebSocket connection drops

### Examples

```sh
# Start with defaults (port 3000, watch current directory)
arc dev

# Custom port and source directory
arc dev --src src --port 8080

# Custom build directory
arc dev --build-dir dist --port 4000
```

---

## arc init

Initialize a new Arc project by creating an `Arc.toml` manifest.

### Usage

```sh
arc init [OPTIONS]
```

### Flags

| Flag | Description |
|---|---|
| `--name <name>` | Project name (defaults to the current directory name) |

### Generated File

`arc init` creates an `Arc.toml` file in the current directory:

```toml
[package]
name = "my-project"
version = "0.1.0"

[dependencies]
```

If an `Arc.toml` already exists, the command fails with an error.

### Example

```sh
mkdir my-app
cd my-app
arc init --name my-app
```

---

## arc add

Add a dependency to `Arc.toml`.

### Usage

```sh
arc add <package> [OPTIONS]
```

### Arguments

| Argument | Description |
|---|---|
| `<package>` | Package name to add |

### Flags

| Flag | Default | Description |
|---|---|---|
| `--version <req>` | `*` (latest) | Version requirement (e.g., `^1.0`, `~2.3`, `=1.2.3`) |
| `--path <dir>` | (none) | Local path dependency |
| `--features <list>` | (none) | Comma-separated list of features to enable |

### Dependency Formats

**Simple version dependency**:

```sh
arc add my-lib --version "^1.0"
```

Adds to `Arc.toml`:

```toml
[dependencies]
my-lib = "^1.0"
```

**Detailed dependency with features**:

```sh
arc add ui-kit --version "^2.0" --features "animations,themes"
```

Adds to `Arc.toml`:

```toml
[dependencies.ui-kit]
version = "^2.0"
features = ["animations", "themes"]
```

**Local path dependency**:

```sh
arc add shared-lib --path "../shared-lib"
```

Adds to `Arc.toml`:

```toml
[dependencies.shared-lib]
path = "../shared-lib"
```

---

## arc install

Resolve and download all dependencies declared in `Arc.toml`.

### Usage

```sh
arc install
```

### Behavior

1. Reads `Arc.toml` from the current directory
2. Resolves the dependency graph (fetching version metadata from the registry)
3. Downloads packages to the local cache
4. Writes `Arc.lock` with pinned versions and checksums

If no `Arc.toml` exists or there are no dependencies, the command succeeds silently.

### Output

```
resolved 3 dependencies
  http-client v1.2.0
  json-parser v0.8.3
  ui-components v2.1.0
```

### Arc.lock

The lockfile (`Arc.lock`) pins exact versions for reproducible builds:

```toml
version = 1

[[packages]]
name = "http-client"
version = "1.2.0"
source = "registry+~/.arc/cache/http-client-1.2.0"
```

Commit `Arc.lock` to version control for reproducible builds.

---

## --lsp (Language Server)

Start the Language Server Protocol (LSP) server for editor integration.

### Usage

```sh
arc --lsp
```

### LSP Capabilities

The Arc language server provides:

- **Diagnostics** -- real-time error and warning reporting as you type
- **Go to Definition** -- jump to the definition of functions, types, and variables
- **Hover Information** -- type information and documentation on hover
- **Completion** -- context-aware code completion for keywords, types, and identifiers
- **Formatting** -- document formatting using the built-in formatter

### VS Code Setup

Install the Arc VS Code extension, or configure manually in `.vscode/settings.json`:

```json
{
  "arc.serverPath": "/path/to/arc",
  "arc.serverArgs": ["--lsp"]
}
```

### Neovim Setup (nvim-lspconfig)

```lua
local lspconfig = require('lspconfig')

lspconfig.arc = {
  default_config = {
    cmd = { 'arc', '--lsp' },
    filetypes = { 'arc' },
    root_dir = lspconfig.util.root_pattern('Arc.toml', '.git'),
  },
}

lspconfig.arc.setup({})
```

### Other Editors

Any editor supporting LSP can use Arc's language server. Point the editor's LSP client to `arc --lsp` as the server command.

---

## --ssr / --hydrate (Server-Side Rendering)

Arc supports server-side rendering (SSR) with client-side hydration for fast initial page loads.

### SSR Workflow

**Step 1: Generate the SSR bundle**

```sh
arc build app.arc --ssr
```

This produces `app.ssr.js`, a JavaScript module that renders your components to HTML strings on the server.

**Step 2: Generate the hydration bundle**

```sh
arc build app.arc --hydrate
```

This produces `app.hydrate.wat` (or `.wasm` with `--emit-wasm`), a lightweight client bundle that attaches event handlers and reactivity to the server-rendered HTML without re-rendering.

**Step 3: Serve from your backend**

```javascript
// Node.js example
const { render } = require('./app.ssr.js');
const html = render({ props: { /* ... */ } });

res.send(`
<!DOCTYPE html>
<html>
<body>
  <div id="app">${html}</div>
  <script src="arc-runtime.js"></script>
  <script>
    const runtime = new ArcRuntime();
    runtime.mount('app.hydrate.wasm', document.getElementById('app'));
  </script>
</body>
</html>
`);
```

### Benefits

- **Faster First Paint** -- users see content immediately from the server-rendered HTML
- **SEO Friendly** -- search engines can index the server-rendered content
- **Smaller Client Bundle** -- the hydration bundle skips initial DOM creation

---

## Direct Compilation Mode

For quick one-off compilations, you can pass a file directly to `arc` without a subcommand:

```sh
arc app.arc [OPTIONS]
```

This is equivalent to `arc build app.arc` but also supports debug flags:

| Flag | Description |
|---|---|
| `--emit-tokens` | Print the token stream and exit (for debugging the lexer) |
| `--emit-ast` | Print the AST and exit (for debugging the parser) |
| `--emit-wasm` | Emit binary `.wasm` |
| `--ssr` | Emit SSR JavaScript module |
| `--hydrate` | Emit hydration bundle |
| `--no-check` | Skip borrow checker and type checker |
| `-O <level>` | Optimization level |
| `-o <file>` | Output file path |

### Examples

```sh
# Debug: see all tokens
arc app.arc --emit-tokens

# Debug: see the full AST
arc app.arc --emit-ast

# Quick compile
arc app.arc --emit-wasm -O2 -o dist/app.wasm
```

---

## Arc.toml Configuration

`Arc.toml` is the project manifest, similar to `Cargo.toml` or `package.json`.

### Structure

```toml
[package]
name = "my-app"
version = "0.1.0"

[dependencies]
http-client = "^1.0"
json-parser = "~0.8"

[dependencies.ui-kit]
version = "^2.0"
features = ["animations", "themes"]

[dependencies.shared-lib]
path = "../shared-lib"
```

### Package Section

| Field | Type | Description |
|---|---|---|
| `name` | String | Project name |
| `version` | String | Project version (semver) |

### Dependencies Section

Dependencies can be specified in two forms:

**Simple**: just a version string.

```toml
[dependencies]
my-lib = "^1.0"
```

**Detailed**: version, features, path, or registry URL.

```toml
[dependencies.my-lib]
version = "^2.0"
features = ["feature-a", "feature-b"]
path = "../my-lib"             # local path (optional)
registry_url = "https://..."   # custom registry (optional)
```

### Version Requirements

| Syntax | Meaning |
|---|---|
| `"^1.0"` | Compatible with 1.0 (>=1.0.0, <2.0.0) |
| `"~1.2"` | Approximately 1.2 (>=1.2.0, <1.3.0) |
| `"=1.2.3"` | Exactly 1.2.3 |
| `"*"` | Any version (latest) |
