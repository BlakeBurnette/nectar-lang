# Arc

A first-class programming language that compiles to WebAssembly. Arc combines Rust's ownership model with React-like declarative UI — delivering near-native web performance with zero garbage collection.

## Features

**Language**
- Ownership & borrowing (no GC) with lifetime annotations
- Fine-grained reactivity via signals (O(1) DOM updates)
- First-class components, stores, agents, and routers
- Traits, generics, closures, pattern destructuring
- `?` error propagation, exhaustive match checking
- String interpolation (`f"hello {name}"`)
- Iterator protocol (`.map().filter().collect()`)
- Concurrency via Web Workers (`spawn`, `channel`, `parallel`)

**AI-Native**
- `agent` keyword with system prompts and tool definitions
- `prompt` template literals with interpolation
- Streaming LLM responses as first-class language construct

**Web Platform**
- Scoped CSS with `style` blocks
- Client-side routing with guards
- Two-way form binding (`bind:value={signal}`)
- Accessibility (ARIA attributes, focus management, screen reader)
- Declarative animations via Web Animations API
- SSR with hydration
- Web API bindings (localStorage, clipboard, timers, etc.)

**Toolchain**
- `arc build` — compile `.arc` to `.wasm`
- `arc test` — built-in test framework with `assert`/`assert_eq`
- `arc fmt` — code formatter
- `arc lint` — static analysis (10 rules)
- `arc dev` — dev server with hot reload
- `arc init` / `arc add` / `arc install` — package manager
- LSP server for editor integration (`--lsp`)
- Optimizing compiler (`-O2`: constant folding, DCE, tree shaking)

## Quick Start

```bash
# Build the compiler
cargo build --release

# Compile an Arc program
./target/release/arc build examples/counter.arc

# Run tests
./target/release/arc test examples/counter.arc

# Start dev server
./target/release/arc dev --src ./examples
```

## Example

```arc
component Counter(initial: i32) {
    signal count: i32 = initial;

    fn increment(&mut self) {
        self.count = self.count + 1;
    }

    style {
        .counter {
            font-size: "24px";
            padding: "16px";
        }
    }

    render {
        <div class="counter">
            <p>{f"Count: {self.count}"}</p>
            <button on:click={self.increment}>
                "Increment"
            </button>
        </div>
    }
}

store AppStore {
    signal count: i32 = 0;

    action increment(&mut self) {
        self.count = self.count + 1;
    }

    computed double_count(&self) -> i32 {
        self.count * 2
    }

    effect on_count_change(&self) {
        println(self.count);
    }
}

agent Assistant {
    prompt system = "You are a helpful assistant.";

    tool search(query: String) -> String {
        return SearchService::search(query);
    }

    render {
        <div>
            <ChatMessages messages={self.messages} />
            <input on:submit={self.send} />
        </div>
    }
}
```

## Architecture

```
Source (.arc) → Lexer → Parser → Borrow Check → Type Check → Optimize → Codegen → .wasm
                                    ↓               ↓           ↓
                              Lifetime check   HM inference   Const fold
                              Move semantics   Trait bounds   DCE / Tree shake
```

The compiler (`compiler/src/`) is written in Rust. The runtime bridge (`runtime/`) provides the JavaScript host functions that WASM imports for DOM manipulation, signals, HTTP, Web Workers, and AI interaction.

## License

MIT
