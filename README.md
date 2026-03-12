# Nectar

**A programming language that compiles to WebAssembly, built for the next era of web development.**

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)
![WASM](https://img.shields.io/badge/target-WebAssembly-654ff0.svg)

Nectar combines Rust's ownership model with declarative UI primitives, compiling everything to WebAssembly. No garbage collector. No virtual DOM. No JavaScript dependencies. Fine-grained signals update exactly the DOM nodes that changed — in O(1) time.

```nectar
component Counter(initial: i32) {
    let mut count: i32 = initial;

    fn increment(&mut self) {
        self.count = self.count + 1;
    }

    render {
        <div>
            <span>{self.count}</span>
            <button on:click={self.increment}>"+1"</button>
        </div>
    }
}
```

## Quick Start

```bash
git clone https://github.com/BlakeBurnette/nectar-lang.git
cd nectar-lang
cargo build --release

# Compile to WebAssembly
./target/release/nectar build hello.nectar --emit-wasm

# Start dev server with hot reload
./target/release/nectar dev --src . --port 3000
```

## What You Get

**Language features** — components, stores, routers, signals, structs, enums, traits, generics, ownership, borrowing, pattern matching, async/await

**Built-in keywords** — `page` (SEO), `form` (validation), `channel` (WebSocket), `auth`, `payment`, `upload`, `db`, `cache`, `embed`, `pdf`, `theme`, `app` (PWA), `agent` (AI)

**Standard library** — `debounce`, `throttle`, `BigDecimal`, `format`, `collections`, `url`, `mask`, `search`, `toast`, `skeleton`, `pagination`, `crypto` — all auto-included, no imports needed

**Security** — XSS structurally impossible, `secret` types, capability-based `permissions`, zero JS dependencies, no `node_modules`

**Toolchain** — compiler, formatter (`nectar fmt`), linter (`nectar lint`), test runner, dev server, package manager, LSP — one binary

**Build targets** — `--target pwa`, `--target ssg`, `--target ssr`, `--target capacitor` (iOS/Android), `--target twa` (Play Store)

## How It Works

```
  .nectar source
       ↓
  Compiler (Rust)
  ├─ Parse → AST
  ├─ Type check + borrow check
  ├─ Codegen → WAT
  └─ Binary emit → .wasm
       ↓
  Browser loads .wasm + single JS syscall file (~3 KB gzip)
       ↓
  mount() → innerHTML from WASM-built string (1 call)
  flush() → batched DOM ops from command buffer (1 call/frame)
```

Initial renders use `innerHTML` from a WASM-built HTML string. Updates write opcodes into a command buffer in linear memory — a single `flush()` call per frame executes them all. The JS layer is one file with browser API syscalls that WASM physically cannot call (DOM, WebSocket, IndexedDB, clipboard, etc.). All logic runs in WASM.

## Performance

| | React | Nectar |
|---|---|---|
| Runtime (gzip) | ~42 KB | ~2.8 KB |
| Re-render (1K items) | ~4 ms (VDOM diff) | ~0.3 ms (signal) |
| GC pauses | Yes | None (WASM linear memory) |
| Update complexity | O(n) tree walk | O(1) per binding |

## Examples

See [`examples/`](examples/) for complete working apps:

| Example | What it shows |
|---|---|
| [counter.nectar](examples/counter.nectar) | State, events, render |
| [todo.nectar](examples/todo.nectar) | Structs, enums, filtering |
| [ai-chat.nectar](examples/ai-chat.nectar) | Agent, tool, prompt |
| [pwa-app.nectar](examples/pwa-app.nectar) | Offline, push, install |
| [crypto.nectar](examples/crypto.nectar) | Hash, encrypt, sign |
| [std-lib.nectar](examples/std-lib.nectar) | Standard library usage |

[See all 39 examples →](examples/)

## Documentation

| Doc | Contents |
|---|---|
| [Getting Started](docs/getting-started.md) | Install, first app, dev server |
| [Language Reference](docs/language-reference.md) | Full syntax, types, ownership, components, stores |
| [Architecture](docs/architecture.md) | Compiler pipeline, runtime, WASM bridge |
| [Runtime API](docs/runtime-api.md) | JS syscall layer, command buffer, WASM imports |
| [Toolchain](docs/toolchain.md) | CLI commands, formatter, linter, LSP |
| [AI Integration](docs/nectar-for-ai.md) | Agents, tools, prompts, streaming |

## Comparison

[**Nectar vs React — interactive side-by-side →**](comparison/index.html)

## License

MIT — see [LICENSE](LICENSE).
