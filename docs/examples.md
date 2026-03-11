# Arc Examples Guide

This document walks through each example program in the `examples/` directory, explaining the concepts demonstrated and how they fit together.

---

## Table of Contents

1. [hello.arc -- Hello World](#helloarc----hello-world)
2. [counter.arc -- Stateful Counter](#counterarc----stateful-counter)
3. [todo.arc -- Todo Application](#todoarc----todo-application)
4. [api.arc -- API Communication](#apiarc----api-communication)
5. [store.arc -- Global State Management](#storearc----global-state-management)
6. [app.arc -- Routed Application with Styles](#apparc----routed-application-with-styles)
7. [ai-chat.arc -- AI Chat Interface](#ai-chatarc----ai-chat-interface)

---

## hello.arc -- Hello World

**Concepts**: components, props, render templates

```arc
component Hello(name: String) {
    render {
        <div>
            <h1>"Hello from Arc!"</h1>
            <p>{name}</p>
        </div>
    }
}
```

This is the simplest possible Arc program. It demonstrates:

- **Component declaration**: `component Hello(...)` defines a reusable UI building block. The component name must be PascalCase.
- **Props**: `name: String` declares a property that the parent passes in when using `<Hello name="World" />`.
- **Render block**: Every component must have a `render { ... }` block that describes its DOM output.
- **Template syntax**: Arc uses a JSX-like syntax. Static text is written in double quotes (`"Hello from Arc!"`), and dynamic expressions are wrapped in curly braces (`{name}`).

**To compile and run:**

```sh
arc build examples/hello.arc --emit-wasm
```

---

## counter.arc -- Stateful Counter

**Concepts**: mutable state, methods, event handlers, ownership

```arc
component Counter(initial: i32) {
    let mut count: i32 = initial;

    fn increment(&mut self) {
        self.count = self.count + 1;
    }

    fn decrement(&mut self) {
        self.count = self.count - 1;
    }

    render {
        <div>
            <h2>"Counter"</h2>
            <span>{self.count}</span>
            <button on:click={self.increment}>"+1"</button>
            <button on:click={self.decrement}>"-1"</button>
        </div>
    }
}
```

This example introduces interactivity:

- **Mutable state**: `let mut count: i32 = initial;` declares a state variable that can change over time. The initial value comes from the `initial` prop.
- **Methods**: `fn increment(&mut self)` and `fn decrement(&mut self)` are component methods. They take `&mut self` (a mutable borrow of the component) because they modify `self.count`.
- **Event handlers**: `on:click={self.increment}` binds the button's click event to the method. Arc's reactivity system ensures that when `self.count` changes, only the `<span>` displaying the count is updated in the DOM -- no virtual DOM diffing is needed.
- **Ownership**: The `&mut self` parameter signals that these methods borrow the component mutably. Arc's borrow checker ensures you cannot hold other borrows while calling these methods.

---

## todo.arc -- Todo Application

**Concepts**: structs, enums, ownership, collections, pattern matching, closures

This is a more complete application demonstrating data modeling and business logic.

### Data Model

```arc
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
```

- **Structs** define product types -- `Todo` groups an ID, text, and completion status.
- **Enums** define sum types -- `Filter` can be one of three variants.

### Component State

```arc
component TodoApp() {
    let mut todos: [Todo] = [];
    let mut next_id: u32 = 0;
    let mut filter: Filter = Filter::All;
```

The component maintains three pieces of state:
- A dynamic array of `Todo` items
- An auto-incrementing ID counter
- The current filter selection

### Adding Todos

```arc
    fn add_todo(&mut self, text: String) {
        let todo = Todo {
            id: self.next_id,
            text: text,
            done: false,
        };
        self.next_id = self.next_id + 1;
        self.todos.push(todo);
    }
```

Key ownership concept: when `todo` is pushed into `self.todos`, ownership is **moved**. The local variable `todo` is no longer accessible after the push. This is how Arc prevents use-after-free bugs at compile time.

### Toggling Completion

```arc
    fn toggle(&mut self, id: u32) {
        for todo in &mut self.todos {
            if todo.id == id {
                todo.done = !todo.done;
            }
        }
    }
```

The `&mut self.todos` borrows the array mutably, giving each `todo` in the loop a mutable reference. This allows in-place modification without cloning.

### Filtering with Pattern Matching

```arc
    fn visible_todos(&self) -> [&Todo] {
        match self.filter {
            Filter::All => &self.todos,
            Filter::Active => self.todos.iter().filter(fn(t: &Todo) -> bool { !t.done }),
            Filter::Completed => self.todos.iter().filter(fn(t: &Todo) -> bool { t.done }),
        }
    }
```

- **Pattern matching**: `match` exhaustively handles all `Filter` variants.
- **Borrowing**: `&self` means this is a read-only method. The return type `[&Todo]` returns borrowed references, not copies.
- **Closures**: `fn(t: &Todo) -> bool { !t.done }` is a typed closure used as a filter predicate.

---

## api.arc -- API Communication

**Concepts**: stores, async actions, HTTP fetch, error handling, computed values

This example shows how to build a data-driven application that communicates with a REST API.

### Data Types

```arc
struct Post {
    id: u32,
    title: String,
    body: String,
    user_id: u32,
}

struct ApiError {
    status: u32,
    message: String,
}
```

### Store with Async Actions

```arc
store PostService {
    signal posts: [Post] = [];
    signal loading: bool = false;
    signal error: Option<ApiError> = None;
```

The store uses three signals to track loading state, data, and errors. Any component reading these signals will automatically re-render when they change.

### GET Request

```arc
    async action fetch_posts(&mut self) {
        self.loading = true;
        self.error = None;

        let response = await fetch("https://jsonplaceholder.typicode.com/posts");

        if response.status == 200 {
            self.posts = response.json();
        } else {
            self.error = Some(ApiError {
                status: response.status,
                message: "Failed to fetch posts",
            });
        }
        self.loading = false;
    }
```

- **`async action`** declares an asynchronous store action.
- **`await fetch(...)`** makes an HTTP GET request and waits for the response.
- **`response.json()`** parses the response body as JSON into the typed `[Post]` array.
- **Error handling** uses `Option<ApiError>` to represent the presence or absence of an error.

### POST Request with Body

```arc
    async action create_post(&mut self, title: String, body: String) {
        self.loading = true;

        let response = await fetch("https://jsonplaceholder.typicode.com/posts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: format("{\"title\": \"{}\", \"body\": \"{}\", \"userId\": 1}", title, body),
        });
```

The second argument to `fetch` is an options object with `method`, `headers`, and `body` fields.

### Computed Values

```arc
    computed post_count(&self) -> u32 {
        self.posts.len()
    }
```

Computed values are derived from signals and cached. `post_count` automatically updates whenever `self.posts` changes.

### Using the Store from a Component

```arc
component PostList() {
    render {
        <div>
            {if PostService::get_loading() {
                <div>"Loading..."</div>
            }}

            {for post in PostService::get_posts() {
                <li>
                    <h3>{post.title}</h3>
                    <button on:click={PostService::delete_post(post.id)}>"Delete"</button>
                </li>
            }}

            <p>{format("Total: {} posts", PostService::post_count())}</p>
        </div>
    }
}
```

Components access store state via `StoreName::get_field()` and dispatch actions via `StoreName::action_name(args)`. The reactive system ensures the UI stays in sync.

---

## store.arc -- Global State Management

**Concepts**: Flux/Redux pattern, multiple stores, auth flow, effects

This example demonstrates more advanced store patterns.

### Auth Store with Multiple States

```arc
enum AuthStatus {
    LoggedOut,
    Loading,
    LoggedIn(User),
    Error(String),
}

store AuthStore {
    signal status: AuthStatus = AuthStatus::LoggedOut;
    signal token: String = "";
```

The auth status is modeled as an enum with four states. This is more robust than using separate boolean flags.

### Async Login Flow

```arc
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
```

The login action transitions through `Loading` to either `LoggedIn` or `Error`, and the UI reactively updates at each step.

### Computed Values

```arc
    computed is_logged_in(&self) -> bool {
        match self.status {
            AuthStatus::LoggedIn(_) => true,
            _ => false,
        }
    }
```

This computed value can be used as a route guard or in conditional rendering. It only recomputes when `self.status` changes.

### Effects (Side Effects)

```arc
    effect on_auth_change(&self) {
        match self.status {
            AuthStatus::LoggedIn(user) => {
                println(format("User logged in: {}", user.name));
            }
            AuthStatus::Error(msg) => {
                println(format("Auth error: {}", msg));
            }
            _ => {}
        }
    }
```

Effects run automatically whenever their signal dependencies change. They are used for side effects like logging, analytics, or syncing with external systems.

### Multiple Stores

The example also defines a `CounterStore` to show that applications can have multiple independent stores:

```arc
store CounterStore {
    signal count: i32 = 0;
    signal step: i32 = 1;

    action increment(&mut self) {
        self.count = self.count + self.step;
    }

    computed double_count(&self) -> i32 {
        self.count * 2
    }
}
```

Components can read from and dispatch to any number of stores simultaneously.

---

## app.arc -- Routed Application with Styles

**Concepts**: router definition, parameterized routes, guards, scoped CSS, Link navigation, programmatic navigation

This is the most architecturally complete example, showing how to build a multi-page application.

### Store for Route Guards

```arc
store AuthStore {
    signal is_logged_in: bool = false;
    signal username: String = "";

    action login(&mut self, user: String) {
        self.is_logged_in = true;
        self.username = user;
    }
}
```

### Scoped Styles

Each component declares its own CSS that is automatically scoped:

```arc
component NavBar() {
    style {
        .navbar {
            display: "flex";
            gap: "16px";
            padding: "12px 24px";
            background: "#1e293b";
            color: "white";
        }
        .navbar a {
            color: "#93c5fd";
            text-decoration: "none";
        }
    }

    render {
        <nav class="navbar">
            <Link to="/">"Home"</Link>
            <Link to="/about">"About"</Link>
        </nav>
    }
}
```

Key style features:
- Styles are declared inside `style { ... }` blocks within the component
- CSS properties are written as `property: "value";` pairs
- Selectors can be nested (`.navbar a`)
- All styles are automatically scoped so they never affect other components
- The runtime generates unique scope attributes and prefixes selectors

### Link Navigation

`<Link to="/path">` creates client-side navigation links that update the URL and mount the corresponding component without a full page reload:

```arc
<Link to="/">"Home"</Link>
<Link to="/about">"About"</Link>
<Link to="/user/42">"Profile"</Link>
```

### Parameterized Routes

Components can receive route parameters as props:

```arc
component UserProfile(id: String) {
    signal user_name: String = "Loading...";

    render {
        <div class="profile">
            <h2>{self.user_name}</h2>
            <span>{format("User ID: {}", self.id)}</span>
        </div>
    }
}
```

The `id` parameter is extracted from the URL pattern `/user/:id`.

### Programmatic Navigation

Components can navigate programmatically using the `navigate()` function:

```arc
component NotFound() {
    fn go_home(&self) {
        navigate("/");
    }

    render {
        <div>
            <h1>"404"</h1>
            <button on:click={self.go_home}>"Go Home"</button>
        </div>
    }
}
```

### Router Definition

The router maps URL patterns to components:

```arc
router AppRouter {
    route "/" => Home,
    route "/about" => About,
    route "/user/:id" => UserProfile,
    route "/admin/*" => AdminPanel guard { AuthStore::is_logged_in() },
    fallback => NotFound,
}
```

Key routing features:
- **Static routes**: `"/"`, `"/about"` -- exact matches
- **Parameterized routes**: `"/user/:id"` -- captures `id` from the URL
- **Wildcard routes**: `"/admin/*"` -- matches any sub-path under `/admin/`
- **Guards**: `guard { AuthStore::is_logged_in() }` -- the route is only accessible when the guard expression evaluates to `true`
- **Fallback**: `fallback => NotFound` -- rendered when no route matches (404 page)

---

## ai-chat.arc -- AI Chat Interface

**Concepts**: agents, system prompts, tool definitions, streaming, reactive UI

This example demonstrates Arc's first-class AI interaction primitives.

### Agent Declaration

```arc
agent ChatBot {
    prompt system = "You are a helpful coding assistant.";

    signal messages: [Message] = [];
    signal input: String = "";
    signal streaming: bool = false;
```

The `agent` keyword defines a special component type that wraps LLM interaction. It combines:
- A system prompt
- Reactive state (signals)
- Tool definitions
- Methods
- A render block

### Tool Definitions

```arc
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

    tool get_weather(city: String) -> String {
        let result = await fetch(format("https://api.example.com/weather?city={}", city));
        return result.json().forecast;
    }
```

Tools are functions that the AI model can call during a conversation. They have:
- **Typed parameters** (used to generate JSON schemas for the AI)
- **Return types** (the result is fed back to the AI)
- **Async bodies** that can make HTTP requests or perform computation

When the AI decides to call a tool, the runtime:
1. Parses the tool call from the streaming response
2. Dispatches to the corresponding WASM-exported function
3. Sends the result back to the AI for continued reasoning

### Streaming Chat

```arc
    fn send(&mut self) {
        let msg = Message { role: "user", content: self.input };
        self.messages.push(msg);
        self.input = "";
        self.streaming = true;

        ai::chat_stream(self.messages, self.tools);
    }
```

`ai::chat_stream` initiates a streaming completion. Tokens arrive one at a time, and the UI updates reactively:

```arc
    fn on_stream_token(&mut self, token: String) {
        let last = self.messages.len() - 1;
        if self.messages[last].role == "assistant" {
            self.messages[last].content = self.messages[last].content + token;
        } else {
            self.messages.push(Message { role: "assistant", content: token });
        }
    }
```

Each incoming token triggers a signal update, which triggers a DOM update, giving the user a real-time streaming experience.

### Reactive Chat UI

```arc
    render {
        <div class="chat">
            <div class="messages">
                {for msg in self.messages {
                    <div class={msg.role}>
                        <span class="role-label">{msg.role}</span>
                        <div class="content">{msg.content}</div>
                    </div>
                }}
                {if self.streaming {
                    <div class="typing">
                        <span class="dot">"."</span>
                        <span class="dot">"."</span>
                        <span class="dot">"."</span>
                    </div>
                }}
            </div>
            <div class="input-area">
                <input value={self.input} placeholder="Ask me anything..." on:submit={self.send} />
                <button on:click={self.clear_history}>"Clear"</button>
            </div>
        </div>
    }
```

The template demonstrates:
- **List rendering** with `for msg in self.messages`
- **Dynamic classes** with `class={msg.role}`
- **Conditional rendering** with `if self.streaming`
- **Event binding** on both the input (`on:submit`) and button (`on:click`)

The entire chat interface is reactive. When a new message is added or a streaming token appends content, only the affected DOM nodes update.

---

## Running the Examples

All examples can be compiled from the repository root:

```sh
# Compile to WAT (human-readable)
arc build examples/hello.arc

# Compile to binary WASM
arc build examples/counter.arc --emit-wasm

# Compile with optimizations
arc build examples/app.arc --emit-wasm -O2

# Start the dev server for interactive development
arc dev --src examples --port 3000
```

For the AI chat example, you will need an LLM API endpoint at `/api/chat` that accepts OpenAI-compatible requests. The runtime handles the streaming protocol automatically.
