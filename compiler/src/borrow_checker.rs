use std::collections::HashMap;
use std::fmt;

use crate::ast::*;
use crate::token::Span;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct BorrowError {
    pub kind: BorrowErrorKind,
    pub span: Span,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BorrowErrorKind {
    UseAfterMove,
    DoubleMutBorrow,
    MutBorrowWhileImmBorrowed,
    ImmBorrowWhileMutBorrowed,
    BorrowOutlivesScope,
    AssignWhileBorrowed,
    LifetimeViolation,
    MissingLifetimeAnnotation,
}

impl fmt::Display for BorrowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[borrow error] line {}:{}: {}",
            self.span.line, self.span.col, self.message
        )
    }
}

// ---------------------------------------------------------------------------
// Ownership / borrow state tracked per variable
// ---------------------------------------------------------------------------

/// The current ownership state of a single variable binding.
#[derive(Debug, Clone, PartialEq)]
enum VarState {
    /// The variable owns its value and it has not been moved or borrowed.
    Owned,
    /// The value has been moved to another binding. `moved_to` is a
    /// human-readable description used in diagnostics.
    Moved { moved_to: String },
    /// The variable is currently borrowed immutably `count` times.
    Borrowed { count: usize },
    /// The variable is currently mutably borrowed.
    MutBorrowed,
}

/// Metadata about a live borrow that must be invalidated when the borrowing
/// variable goes out of scope.
#[derive(Debug, Clone)]
struct BorrowInfo {
    /// The variable that was borrowed.
    source_var: String,
    /// Whether the borrow is mutable.
    mutable: bool,
    /// The scope depth at which the borrow was created.
    scope_depth: usize,
    /// Optional named lifetime for this borrow (e.g., `'a`).
    lifetime: Option<String>,
}

// ---------------------------------------------------------------------------
// Scope / environment
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct Scope {
    /// Variables introduced in this scope.
    bindings: Vec<String>,
    /// For each variable introduced as a borrow in this scope, record the
    /// borrow so it can be released when the scope exits.
    borrows: Vec<(String, BorrowInfo)>,
    /// Optional lifetime label for this scope (e.g., `'a`).
    lifetime: Option<String>,
}

struct Env {
    /// Variable -> current state.
    vars: HashMap<String, VarState>,
    /// Stack of scopes (outermost first).
    scopes: Vec<Scope>,
    /// Lookup table: borrowing variable name -> borrow metadata.
    borrow_map: HashMap<String, BorrowInfo>,
}

impl Env {
    fn new() -> Self {
        Self {
            vars: HashMap::new(),
            scopes: vec![Scope {
                bindings: Vec::new(),
                borrows: Vec::new(),
                lifetime: None,
            }],
            borrow_map: HashMap::new(),
        }
    }

    fn depth(&self) -> usize {
        self.scopes.len()
    }

    fn push_scope(&mut self) {
        self.scopes.push(Scope {
            bindings: Vec::new(),
            borrows: Vec::new(),
            lifetime: None,
        });
    }

    fn push_scope_with_lifetime(&mut self, lifetime: String) {
        self.scopes.push(Scope {
            bindings: Vec::new(),
            borrows: Vec::new(),
            lifetime: Some(lifetime),
        });
    }

    /// Find the scope depth that owns the given named lifetime.
    /// Returns None if the lifetime is not found (or is `'static`).
    fn lifetime_scope_depth(&self, name: &str) -> Option<usize> {
        if name == "static" {
            // 'static lives for the entire program — depth 0
            return Some(0);
        }
        for (i, scope) in self.scopes.iter().enumerate() {
            if scope.lifetime.as_deref() == Some(name) {
                return Some(i);
            }
        }
        None
    }

    /// Pop the current scope, releasing all borrows created in it and removing
    /// its bindings from the variable map.
    fn pop_scope(&mut self) {
        if let Some(scope) = self.scopes.pop() {
            // Release borrows that were created in this scope.
            for (borrow_var, info) in &scope.borrows {
                self.release_borrow_on_source(&info.source_var, info.mutable);
                self.borrow_map.remove(borrow_var);
            }
            // Remove bindings introduced in this scope.
            for name in &scope.bindings {
                self.vars.remove(name);
            }
        }
    }

    fn declare(&mut self, name: &str, state: VarState) {
        self.vars.insert(name.to_string(), state);
        if let Some(scope) = self.scopes.last_mut() {
            scope.bindings.push(name.to_string());
        }
    }

    fn get(&self, name: &str) -> Option<&VarState> {
        self.vars.get(name)
    }

    fn set(&mut self, name: &str, state: VarState) {
        self.vars.insert(name.to_string(), state);
    }

    fn record_borrow(&mut self, borrow_var: &str, info: BorrowInfo) {
        self.borrow_map.insert(borrow_var.to_string(), info.clone());
        if let Some(scope) = self.scopes.last_mut() {
            scope.borrows.push((borrow_var.to_string(), info));
        }
    }

    /// Decrement the borrow count (or clear mut-borrow flag) on the *source*
    /// variable when a borrow is released.
    fn release_borrow_on_source(&mut self, source: &str, mutable: bool) {
        if let Some(state) = self.vars.get_mut(source) {
            match state {
                VarState::MutBorrowed if mutable => {
                    *state = VarState::Owned;
                }
                VarState::Borrowed { count } if !mutable => {
                    if *count <= 1 {
                        *state = VarState::Owned;
                    } else {
                        *count -= 1;
                    }
                }
                _ => {}
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

struct Checker {
    env: Env,
    errors: Vec<BorrowError>,
}

impl Checker {
    fn new() -> Self {
        Self {
            env: Env::new(),
            errors: Vec::new(),
        }
    }

    fn error(&mut self, kind: BorrowErrorKind, span: Span, message: impl Into<String>) {
        self.errors.push(BorrowError {
            kind,
            span,
            message: message.into(),
        });
    }

    // -- top-level -----------------------------------------------------------

    fn check_program(&mut self, program: &Program) {
        for item in &program.items {
            self.check_item(item);
        }
    }

    fn check_item(&mut self, item: &Item) {
        match item {
            Item::Function(f) => self.check_function(f),
            Item::Impl(imp) => {
                for method in &imp.methods {
                    self.check_function(method);
                }
            }
            Item::Component(c) => self.check_component(c),
            Item::Test(test) => {
                self.env.push_scope();
                self.check_block(&test.body);
                self.env.pop_scope();
            }
            Item::Trait(trait_def) => {
                // Check default method bodies for borrow violations.
                for method in &trait_def.methods {
                    if let Some(ref body) = method.default_body {
                        self.env.push_scope();
                        for param in &method.params {
                            let state = match &param.ownership {
                                Ownership::Borrowed => VarState::Borrowed { count: 0 },
                                Ownership::MutBorrowed => VarState::Owned,
                                Ownership::Owned => VarState::Owned,
                            };
                            self.env.declare(&param.name, state);
                        }
                        self.check_block(body);
                        self.env.pop_scope();
                    }
                }
            }
            // Structs, enums, and use-paths have no runtime behaviour to check.
            _ => {}
        }
    }

    fn check_function(&mut self, func: &Function) {
        self.env.push_scope();

        // Register named lifetimes from function signature as scope markers.
        for lt in &func.lifetimes {
            self.env.push_scope_with_lifetime(lt.clone());
        }

        // Introduce parameters as owned bindings.
        for param in &func.params {
            let state = match &param.ownership {
                Ownership::Borrowed => VarState::Borrowed { count: 0 },
                Ownership::MutBorrowed => VarState::Owned,
                Ownership::Owned => VarState::Owned,
            };
            self.env.declare(&param.name, state);
        }

        // Validate lifetime elision rules.
        self.check_lifetime_elision(func);

        self.check_block(&func.body);

        // Pop lifetime scopes (in reverse order).
        for _ in &func.lifetimes {
            self.env.pop_scope();
        }
        self.env.pop_scope();
    }

    /// Validate lifetime elision rules for a function signature.
    /// - Single input reference -> output gets same lifetime (no annotation needed)
    /// - `&self` methods -> output gets lifetime of self (no annotation needed)
    /// - Multiple input references -> output must be explicitly annotated
    fn check_lifetime_elision(&mut self, func: &Function) {
        let return_has_ref = func.return_type.as_ref().map_or(false, |t| type_has_reference(t));
        if !return_has_ref {
            return;
        }

        let return_has_lifetime = func.return_type.as_ref().map_or(false, |t| type_has_named_lifetime(t));
        if return_has_lifetime {
            return;
        }

        let ref_param_count = func.params.iter()
            .filter(|p| type_has_reference(&p.ty))
            .count();

        let has_self = func.params.iter().any(|p| p.name == "self");

        // &self method -> output gets lifetime of self (elision ok)
        if has_self {
            return;
        }

        // Single input reference -> elision ok
        if ref_param_count == 1 {
            return;
        }

        // Multiple input references with explicit lifetime params -> ok
        if ref_param_count > 1 && !func.lifetimes.is_empty() {
            return;
        }

        if ref_param_count > 1 {
            self.error(
                BorrowErrorKind::MissingLifetimeAnnotation,
                func.span,
                format!(
                    "function `{}` returns a reference but has multiple reference parameters; \
                     explicit lifetime annotations are required",
                    func.name
                ),
            );
        }
    }

    fn check_component(&mut self, comp: &Component) {
        for method in &comp.methods {
            self.check_function(method);
        }
    }

    // -- blocks / statements ------------------------------------------------

    fn check_block(&mut self, block: &Block) {
        for stmt in &block.stmts {
            self.check_stmt(stmt, block.span);
        }
    }

    fn check_stmt(&mut self, stmt: &Stmt, enclosing_span: Span) {
        match stmt {
            Stmt::Let {
                name,
                value,
                ownership,
                ..
            } => {
                self.check_let(name, value, ownership, enclosing_span);
            }
            Stmt::Signal { name, value, .. } => {
                // Signals are reactive state; treat them as owned values.
                self.check_expr(value, enclosing_span);
                self.env.declare(name, VarState::Owned);
            }
            Stmt::Expr(expr) => {
                self.check_expr(expr, enclosing_span);
            }
            Stmt::Return(maybe_expr) => {
                if let Some(expr) = maybe_expr {
                    self.check_expr(expr, enclosing_span);
                }
            }
            Stmt::Yield(expr) => {
                self.check_expr(expr, enclosing_span);
            }
            Stmt::LetDestructure { pattern, value, .. } => {
                self.check_expr(value, enclosing_span);
                self.declare_pattern_bindings(pattern);
            }
            _ => {}
        }
    }

    fn check_let(
        &mut self,
        name: &str,
        value: &Expr,
        ownership: &Ownership,
        span: Span,
    ) {
        // First, evaluate the right-hand side to detect moves/borrows.
        match value {
            Expr::Borrow(inner) => {
                let source = self.expr_as_ident(inner);
                if let Some(source_name) = source {
                    self.create_immutable_borrow(name, &source_name, span);
                } else {
                    // Borrowing a non-ident expression -- just check it.
                    self.check_expr(value, span);
                    self.env.declare(name, VarState::Owned);
                }
            }
            Expr::BorrowMut(inner) => {
                let source = self.expr_as_ident(inner);
                if let Some(source_name) = source {
                    self.create_mutable_borrow(name, &source_name, span);
                } else {
                    self.check_expr(value, span);
                    self.env.declare(name, VarState::Owned);
                }
            }
            Expr::Ident(source_name) => {
                // Assignment from another variable -- this is a *move* unless
                // the ownership annotation says otherwise.
                match ownership {
                    Ownership::Borrowed => {
                        self.create_immutable_borrow(name, source_name, span);
                    }
                    Ownership::MutBorrowed => {
                        self.create_mutable_borrow(name, source_name, span);
                    }
                    Ownership::Owned => {
                        // Move.
                        self.move_var(source_name, name, span);
                        self.env.declare(name, VarState::Owned);
                    }
                }
            }
            _ => {
                self.check_expr(value, span);
                self.env.declare(name, VarState::Owned);
            }
        }
    }

    // -- expressions --------------------------------------------------------

    fn check_expr(&mut self, expr: &Expr, span: Span) {
        match expr {
            Expr::Ident(name) => {
                self.assert_not_moved(name, span);
            }
            Expr::Integer(_)
            | Expr::Float(_)
            | Expr::StringLit(_)
            | Expr::Bool(_)
            | Expr::SelfExpr => {}

            Expr::Binary { left, right, .. } => {
                self.check_expr(left, span);
                self.check_expr(right, span);
            }
            Expr::Unary { operand, .. } => {
                self.check_expr(operand, span);
            }

            Expr::FieldAccess { object, .. } => {
                self.check_expr(object, span);
            }
            Expr::MethodCall { object, args, .. } => {
                self.check_expr(object, span);
                for arg in args {
                    self.check_expr(arg, span);
                }
            }
            Expr::FnCall { callee, args } => {
                self.check_expr(callee, span);
                for arg in args {
                    // Passing a variable to a function moves it (by default).
                    if let Expr::Ident(name) = arg {
                        self.assert_not_moved(name, span);
                        self.move_var(name, "<function argument>", span);
                    } else {
                        self.check_expr(arg, span);
                    }
                }
            }
            Expr::Index { object, index } => {
                self.check_expr(object, span);
                self.check_expr(index, span);
            }

            // Control flow -- each branch gets its own scope.
            Expr::If {
                condition,
                then_block,
                else_block,
            } => {
                self.check_expr(condition, span);
                self.env.push_scope();
                self.check_block(then_block);
                self.env.pop_scope();
                if let Some(else_blk) = else_block {
                    self.env.push_scope();
                    self.check_block(else_blk);
                    self.env.pop_scope();
                }
            }
            Expr::Match { subject, arms } => {
                self.check_expr(subject, span);
                for arm in arms {
                    self.env.push_scope();
                    self.declare_pattern_bindings(&arm.pattern);
                    self.check_expr(&arm.body, span);
                    self.env.pop_scope();
                }
            }
            Expr::For {
                binding,
                iterator,
                body,
            } => {
                self.check_expr(iterator, span);
                self.env.push_scope();
                self.env.declare(binding, VarState::Owned);
                self.check_block(body);
                self.env.pop_scope();
            }
            Expr::While { condition, body } => {
                self.check_expr(condition, span);
                self.env.push_scope();
                self.check_block(body);
                self.env.pop_scope();
            }
            Expr::Block(block) => {
                self.env.push_scope();
                self.check_block(block);
                self.env.pop_scope();
            }

            Expr::Borrow(inner) => {
                if let Expr::Ident(name) = inner.as_ref() {
                    self.assert_not_moved(name, span);
                    self.assert_not_mut_borrowed(name, span);
                } else {
                    self.check_expr(inner, span);
                }
            }
            Expr::BorrowMut(inner) => {
                if let Expr::Ident(name) = inner.as_ref() {
                    self.assert_not_moved(name, span);
                    self.assert_no_active_borrows(name, span);
                } else {
                    self.check_expr(inner, span);
                }
            }

            Expr::StructInit { fields, .. } => {
                for (_fname, fval) in fields {
                    self.check_expr(fval, span);
                }
            }

            Expr::Assign { target, value } => {
                // If the target is currently borrowed, we cannot assign to it.
                if let Expr::Ident(name) = target.as_ref() {
                    match self.env.get(name).cloned() {
                        Some(VarState::Borrowed { .. }) | Some(VarState::MutBorrowed) => {
                            self.error(
                                BorrowErrorKind::AssignWhileBorrowed,
                                span,
                                format!("cannot assign to `{}` because it is currently borrowed", name),
                            );
                        }
                        _ => {}
                    }
                }
                self.check_expr(value, span);
            }

            Expr::Await(inner) => {
                self.check_expr(inner, span);
            }
            Expr::Fetch { url, options, .. } => {
                self.check_expr(url, span);
                if let Some(opts) = options {
                    self.check_expr(opts, span);
                }
            }
            Expr::Closure { params, body } => {
                // Closures capture variables from the enclosing scope.
                let param_names: Vec<String> = params.iter().map(|(n, _)| n.clone()).collect();

                // Walk the closure body to find captured variables.
                let captures = collect_captures(body, &param_names);

                // For each captured variable, check borrow rules.
                for cap in &captures {
                    if let Some(state) = self.env.get(cap).cloned() {
                        match state {
                            VarState::Moved { .. } => {
                                self.error(
                                    BorrowErrorKind::UseAfterMove,
                                    span,
                                    format!("closure captures moved variable `{}`", cap),
                                );
                            }
                            VarState::MutBorrowed => {
                                self.error(
                                    BorrowErrorKind::ImmBorrowWhileMutBorrowed,
                                    span,
                                    format!("closure captures `{}` which is already mutably borrowed", cap),
                                );
                            }
                            _ => {
                                if body_mutates_var(body, cap) {
                                    self.assert_no_active_borrows(cap, span);
                                }
                            }
                        }
                    }
                }

                // Check the closure body with params declared in a child scope.
                self.env.push_scope();
                for name in &param_names {
                    self.env.declare(name, VarState::Owned);
                }
                self.check_expr(body, span);
                self.env.pop_scope();
            }
            Expr::PromptTemplate { interpolations, .. } => {
                for (_name, expr) in interpolations {
                    self.check_expr(expr, span);
                }
            }
            Expr::Navigate { path } => {
                self.check_expr(path, span);
            }
            Expr::Stream { source } => {
                self.check_expr(source, span);
            }
            Expr::Suspend { fallback, body } => {
                self.check_expr(fallback, span);
                self.check_expr(body, span);
            }
            Expr::Spawn { body } => {
                self.check_expr(body, span);
            }
            Expr::Channel { .. } => {}
            Expr::Send { channel, value } => {
                self.check_expr(channel, span);
                self.check_expr(value, span);
            }
            Expr::Receive { channel } => {
                self.check_expr(channel, span);
            }
            Expr::Parallel { exprs } => {
                for expr in exprs {
                    self.check_expr(expr, span);
                }
            }
            Expr::TryCatch { body, error_binding, catch_body } => {
                self.env.push_scope();
                self.check_expr(body, span);
                self.env.pop_scope();
                self.env.push_scope();
                self.env.declare(error_binding, VarState::Owned);
                self.check_expr(catch_body, span);
                self.env.pop_scope();
            }
            Expr::Assert { condition, .. } => {
                self.check_expr(condition, span);
            }
            Expr::AssertEq { left, right, .. } => {
                self.check_expr(left, span);
                self.check_expr(right, span);
            }
            Expr::Animate { target, .. } => {
                self.check_expr(target, span);
            }
            Expr::FormatString { parts } => {
                for part in parts {
                    if let FormatPart::Expression(expr) = part {
                        self.check_expr(expr, span);
                    }
                }
            }
            Expr::Try(inner) => {
                self.check_expr(inner, span);
            }
        }
    }

    // -- helpers ------------------------------------------------------------

    /// If `expr` is a simple identifier, return its name.
    fn expr_as_ident(&self, expr: &Expr) -> Option<String> {
        match expr {
            Expr::Ident(name) => Some(name.clone()),
            _ => None,
        }
    }

    fn assert_not_moved(&mut self, name: &str, span: Span) {
        if let Some(VarState::Moved { moved_to }) = self.env.get(name).cloned() {
            self.error(
                BorrowErrorKind::UseAfterMove,
                span,
                format!(
                    "use of moved value `{}` (value was moved to {})",
                    name, moved_to
                ),
            );
        }
    }

    fn assert_not_mut_borrowed(&mut self, name: &str, span: Span) {
        if let Some(VarState::MutBorrowed) = self.env.get(name) {
            self.error(
                BorrowErrorKind::ImmBorrowWhileMutBorrowed,
                span,
                format!(
                    "cannot immutably borrow `{}` because it is already mutably borrowed",
                    name
                ),
            );
        }
    }

    fn assert_no_active_borrows(&mut self, name: &str, span: Span) {
        match self.env.get(name) {
            Some(VarState::MutBorrowed) => {
                self.error(
                    BorrowErrorKind::DoubleMutBorrow,
                    span,
                    format!("cannot borrow `{}` as mutable more than once at a time", name),
                );
            }
            Some(VarState::Borrowed { count }) if *count > 0 => {
                self.error(
                    BorrowErrorKind::MutBorrowWhileImmBorrowed,
                    span,
                    format!(
                        "cannot borrow `{}` as mutable because it is already borrowed as immutable",
                        name
                    ),
                );
            }
            _ => {}
        }
    }

    fn move_var(&mut self, source: &str, dest: &str, span: Span) {
        self.assert_not_moved(source, span);

        // Check that the source is not currently borrowed.
        match self.env.get(source) {
            Some(VarState::Borrowed { count }) if *count > 0 => {
                self.error(
                    BorrowErrorKind::AssignWhileBorrowed,
                    span,
                    format!("cannot move `{}` because it is currently borrowed", source),
                );
            }
            Some(VarState::MutBorrowed) => {
                self.error(
                    BorrowErrorKind::AssignWhileBorrowed,
                    span,
                    format!(
                        "cannot move `{}` because it is currently mutably borrowed",
                        source
                    ),
                );
            }
            _ => {}
        }

        self.env.set(
            source,
            VarState::Moved {
                moved_to: format!("`{}`", dest),
            },
        );
    }

    fn create_immutable_borrow(&mut self, borrow_var: &str, source: &str, span: Span) {
        self.assert_not_moved(source, span);
        self.assert_not_mut_borrowed(source, span);

        // Bump immutable borrow count on the source.
        let new_state = match self.env.get(source) {
            Some(VarState::Borrowed { count }) => VarState::Borrowed { count: count + 1 },
            Some(VarState::Owned) => VarState::Borrowed { count: 1 },
            _ => VarState::Borrowed { count: 1 },
        };
        self.env.set(source, new_state);

        // Declare the borrowing variable.
        self.env.declare(borrow_var, VarState::Owned);

        // Record the borrow so it is released when `borrow_var` goes out of scope.
        self.env.record_borrow(
            borrow_var,
            BorrowInfo {
                source_var: source.to_string(),
                mutable: false,
                scope_depth: self.env.depth(),
                lifetime: None,
            },
        );
    }

    fn create_mutable_borrow(&mut self, borrow_var: &str, source: &str, span: Span) {
        self.assert_not_moved(source, span);
        self.assert_no_active_borrows(source, span);

        self.env.set(source, VarState::MutBorrowed);

        self.env.declare(borrow_var, VarState::Owned);

        self.env.record_borrow(
            borrow_var,
            BorrowInfo {
                source_var: source.to_string(),
                mutable: true,
                scope_depth: self.env.depth(),
                lifetime: None,
            },
        );
    }

    fn declare_pattern_bindings(&mut self, pattern: &Pattern) {
        match pattern {
            Pattern::Ident(name) => {
                self.env.declare(name, VarState::Owned);
            }
            Pattern::Variant { fields, .. } => {
                for p in fields {
                    self.declare_pattern_bindings(p);
                }
            }
            Pattern::Wildcard | Pattern::Literal(_) => {}
            Pattern::Tuple(patterns) | Pattern::Array(patterns) => {
                for p in patterns {
                    self.declare_pattern_bindings(p);
                }
            }
            Pattern::Struct { fields, .. } => {
                for (_name, p) in fields {
                    self.declare_pattern_bindings(p);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type reference helpers
// ---------------------------------------------------------------------------

/// Returns true if the AST type contains a reference.
fn type_has_reference(ty: &Type) -> bool {
    match ty {
        Type::Reference { .. } => true,
        Type::Array(inner) | Type::Option(inner) => type_has_reference(inner),
        Type::Generic { args, .. } => args.iter().any(type_has_reference),
        Type::Tuple(elems) => elems.iter().any(type_has_reference),
        Type::Function { params, ret } => {
            params.iter().any(type_has_reference) || type_has_reference(ret)
        }
        _ => false,
    }
}

/// Returns true if the AST type contains a named lifetime.
fn type_has_named_lifetime(ty: &Type) -> bool {
    match ty {
        Type::Reference { lifetime, inner, .. } => {
            lifetime.is_some() || type_has_named_lifetime(inner)
        }
        Type::Array(inner) | Type::Option(inner) => type_has_named_lifetime(inner),
        Type::Generic { args, .. } => args.iter().any(type_has_named_lifetime),
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Closure capture helpers
// ---------------------------------------------------------------------------

/// Collect all identifiers referenced in `expr` that are not in `local_names`.
/// These are the variables captured from the enclosing scope.
fn collect_captures(expr: &Expr, local_names: &[String]) -> Vec<String> {
    let mut captures = Vec::new();
    collect_captures_inner(expr, local_names, &mut captures);
    captures.sort();
    captures.dedup();
    captures
}

fn collect_captures_inner(expr: &Expr, locals: &[String], out: &mut Vec<String>) {
    match expr {
        Expr::Ident(name) => {
            if !locals.contains(name) {
                out.push(name.clone());
            }
        }
        Expr::Binary { left, right, .. } => {
            collect_captures_inner(left, locals, out);
            collect_captures_inner(right, locals, out);
        }
        Expr::Unary { operand, .. } => {
            collect_captures_inner(operand, locals, out);
        }
        Expr::FnCall { callee, args } => {
            collect_captures_inner(callee, locals, out);
            for arg in args {
                collect_captures_inner(arg, locals, out);
            }
        }
        Expr::FieldAccess { object, .. } => {
            collect_captures_inner(object, locals, out);
        }
        Expr::MethodCall { object, args, .. } => {
            collect_captures_inner(object, locals, out);
            for arg in args {
                collect_captures_inner(arg, locals, out);
            }
        }
        Expr::If { condition, then_block, else_block } => {
            collect_captures_inner(condition, locals, out);
            for stmt in &then_block.stmts {
                if let Stmt::Expr(e) = stmt { collect_captures_inner(e, locals, out); }
            }
            if let Some(blk) = else_block {
                for stmt in &blk.stmts {
                    if let Stmt::Expr(e) = stmt { collect_captures_inner(e, locals, out); }
                }
            }
        }
        Expr::Block(block) => {
            for stmt in &block.stmts {
                if let Stmt::Expr(e) = stmt { collect_captures_inner(e, locals, out); }
            }
        }
        Expr::Assign { target, value } => {
            collect_captures_inner(target, locals, out);
            collect_captures_inner(value, locals, out);
        }
        Expr::Index { object, index } => {
            collect_captures_inner(object, locals, out);
            collect_captures_inner(index, locals, out);
        }
        Expr::Borrow(inner) | Expr::BorrowMut(inner) | Expr::Await(inner) | Expr::Try(inner) => {
            collect_captures_inner(inner, locals, out);
        }
        // For other expression types, we do a best-effort walk.
        _ => {}
    }
}

/// Check whether the closure body mutates (assigns to) a variable by name.
fn body_mutates_var(expr: &Expr, var: &str) -> bool {
    match expr {
        Expr::Assign { target, value } => {
            if let Expr::Ident(name) = target.as_ref() {
                if name == var { return true; }
            }
            body_mutates_var(value, var)
        }
        Expr::Binary { left, right, .. } => {
            body_mutates_var(left, var) || body_mutates_var(right, var)
        }
        Expr::Block(block) => {
            block.stmts.iter().any(|s| {
                if let Stmt::Expr(e) = s { body_mutates_var(e, var) } else { false }
            })
        }
        Expr::If { condition, then_block, else_block } => {
            body_mutates_var(condition, var)
                || then_block.stmts.iter().any(|s| if let Stmt::Expr(e) = s { body_mutates_var(e, var) } else { false })
                || else_block.as_ref().is_some_and(|b| b.stmts.iter().any(|s| if let Stmt::Expr(e) = s { body_mutates_var(e, var) } else { false }))
        }
        Expr::FnCall { callee, args } => {
            body_mutates_var(callee, var) || args.iter().any(|a| body_mutates_var(a, var))
        }
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Run the borrow checker over a parsed program.
///
/// Returns `Ok(())` when no ownership violations are found, or
/// `Err(errors)` with a list of every violation detected.
pub fn check(program: &Program) -> Result<(), Vec<BorrowError>> {
    let mut checker = Checker::new();
    checker.check_program(program);

    if checker.errors.is_empty() {
        Ok(())
    } else {
        Err(checker.errors)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token::Span;

    fn span() -> Span {
        Span::new(0, 0, 1, 1)
    }

    fn ident(name: &str) -> Expr {
        Expr::Ident(name.to_string())
    }

    fn int_lit(v: i64) -> Expr {
        Expr::Integer(v)
    }

    /// Helper: wrap statements into a single-function program.
    fn program_with_stmts(stmts: Vec<Stmt>) -> Program {
        Program {
            items: vec![Item::Function(Function {
                name: "main".to_string(),
                lifetimes: vec![],
                type_params: vec![],
                params: vec![],
                return_type: None,
                trait_bounds: vec![],
                body: Block {
                    stmts,
                    span: span(),
                },
                is_pub: true,
                span: span(),
            })],
        }
    }

    // -----------------------------------------------------------------------
    // Use after move
    // -----------------------------------------------------------------------

    #[test]
    fn use_after_move_detected() {
        // let x = 42;
        // let y = x;   // moves x
        // let z = x;   // ERROR: use after move
        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(42),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "y".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: ident("x"),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "z".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: ident("x"),
                ownership: Ownership::Owned,
            },
        ]);

        let result = check(&prog);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].kind, BorrowErrorKind::UseAfterMove);
    }

    // -----------------------------------------------------------------------
    // Double mutable borrow
    // -----------------------------------------------------------------------

    #[test]
    fn double_mut_borrow_detected() {
        // let mut x = 42;
        // let a = &mut x;
        // let b = &mut x;  // ERROR: already mutably borrowed
        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: true,
                secret: false,
                value: int_lit(42),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "a".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::BorrowMut(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "b".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::BorrowMut(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
        ]);

        let result = check(&prog);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].kind, BorrowErrorKind::DoubleMutBorrow);
    }

    // -----------------------------------------------------------------------
    // Mutable borrow while immutably borrowed
    // -----------------------------------------------------------------------

    #[test]
    fn mut_borrow_while_imm_borrowed_detected() {
        // let x = 42;
        // let a = &x;
        // let b = &mut x;  // ERROR
        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(42),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "a".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::Borrow(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "b".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::BorrowMut(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
        ]);

        let result = check(&prog);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].kind, BorrowErrorKind::MutBorrowWhileImmBorrowed);
    }

    // -----------------------------------------------------------------------
    // Valid: multiple immutable borrows
    // -----------------------------------------------------------------------

    #[test]
    fn multiple_immutable_borrows_ok() {
        // let x = 42;
        // let a = &x;
        // let b = &x;
        // a;  // use a
        // b;  // use b
        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(42),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "a".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::Borrow(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "b".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::Borrow(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
            Stmt::Expr(ident("a")),
            Stmt::Expr(ident("b")),
        ]);

        let result = check(&prog);
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Valid: borrow ends at scope exit, then mut borrow is fine
    // -----------------------------------------------------------------------

    #[test]
    fn scope_exit_releases_borrows() {
        // let x = 42;
        // { let a = &x; }   // borrow released
        // let b = &mut x;   // OK -- no active borrows
        let inner_block = Block {
            stmts: vec![Stmt::Let {
                name: "a".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::Borrow(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            }],
            span: span(),
        };

        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(42),
                ownership: Ownership::Owned,
            },
            Stmt::Expr(Expr::Block(inner_block)),
            Stmt::Let {
                name: "b".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::BorrowMut(Box::new(ident("x"))),
                ownership: Ownership::Owned,
            },
        ]);

        let result = check(&prog);
        assert!(result.is_ok(), "expected Ok but got: {:?}", result);
    }

    // -----------------------------------------------------------------------
    // Scope exit invalidation: use-after-move does not leak across scopes
    // -----------------------------------------------------------------------

    #[test]
    fn scope_exit_invalidation() {
        // let x = 42;
        // { let y = x; }  // x moved inside inner scope
        // let z = x;      // ERROR: use after move
        let inner_block = Block {
            stmts: vec![Stmt::Let {
                name: "y".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: ident("x"),
                ownership: Ownership::Owned,
            }],
            span: span(),
        };

        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(42),
                ownership: Ownership::Owned,
            },
            Stmt::Expr(Expr::Block(inner_block)),
            Stmt::Let {
                name: "z".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: ident("x"),
                ownership: Ownership::Owned,
            },
        ]);

        let result = check(&prog);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].kind, BorrowErrorKind::UseAfterMove);
    }

    // -----------------------------------------------------------------------
    // Valid: simple owned values, no borrows, no moves
    // -----------------------------------------------------------------------

    #[test]
    fn simple_owned_values_ok() {
        let prog = program_with_stmts(vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(1),
                ownership: Ownership::Owned,
            },
            Stmt::Let {
                name: "y".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: int_lit(2),
                ownership: Ownership::Owned,
            },
            Stmt::Expr(Expr::Binary {
                op: BinOp::Add,
                left: Box::new(ident("x")),
                right: Box::new(ident("y")),
            }),
        ]);

        let result = check(&prog);
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Lifetime elision: multiple ref params returning ref needs annotation
    // -----------------------------------------------------------------------

    #[test]
    fn lifetime_elision_multiple_refs_returning_ref_needs_annotation() {
        // fn longest(a: &i32, b: &i32) -> &i32 { ... }
        // Should error: multiple ref params, returning ref, no lifetime annotation
        let prog = Program {
            items: vec![Item::Function(Function {
                name: "longest".to_string(),
                lifetimes: vec![],
                type_params: vec![],
                params: vec![
                    Param {
                        name: "a".to_string(),
                        ty: Type::Reference {
                            mutable: false,
                            lifetime: None,
                            inner: Box::new(Type::Named("i32".to_string())),
                        },
                        ownership: Ownership::Borrowed,
                    },
                    Param {
                        name: "b".to_string(),
                        ty: Type::Reference {
                            mutable: false,
                            lifetime: None,
                            inner: Box::new(Type::Named("i32".to_string())),
                        },
                        ownership: Ownership::Borrowed,
                    },
                ],
                return_type: Some(Type::Reference {
                    mutable: false,
                    lifetime: None,
                    inner: Box::new(Type::Named("i32".to_string())),
                }),
                trait_bounds: vec![],
                body: Block {
                    stmts: vec![Stmt::Return(Some(ident("a")))],
                    span: span(),
                },
                is_pub: false,
                span: span(),
            })],
        };

        let result = check(&prog);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert_eq!(errors[0].kind, BorrowErrorKind::MissingLifetimeAnnotation);
    }

    #[test]
    fn lifetime_elision_single_ref_returning_ref_ok() {
        // fn first(a: &i32) -> &i32 { ... }
        // Single input reference -> elision ok
        let prog = Program {
            items: vec![Item::Function(Function {
                name: "first".to_string(),
                lifetimes: vec![],
                type_params: vec![],
                params: vec![Param {
                    name: "a".to_string(),
                    ty: Type::Reference {
                        mutable: false,
                        lifetime: None,
                        inner: Box::new(Type::Named("i32".to_string())),
                    },
                    ownership: Ownership::Borrowed,
                }],
                return_type: Some(Type::Reference {
                    mutable: false,
                    lifetime: None,
                    inner: Box::new(Type::Named("i32".to_string())),
                }),
                trait_bounds: vec![],
                body: Block {
                    stmts: vec![Stmt::Return(Some(ident("a")))],
                    span: span(),
                },
                is_pub: false,
                span: span(),
            })],
        };

        let result = check(&prog);
        assert!(result.is_ok());
    }

    #[test]
    fn lifetime_annotation_multiple_refs_returning_ref_ok() {
        // fn longest<'a>(a: &'a i32, b: &'a i32) -> &'a i32 { ... }
        // Explicit lifetime annotation -> ok
        let prog = Program {
            items: vec![Item::Function(Function {
                name: "longest".to_string(),
                lifetimes: vec!["a".to_string()],
                type_params: vec![],
                params: vec![
                    Param {
                        name: "a".to_string(),
                        ty: Type::Reference {
                            mutable: false,
                            lifetime: Some("a".to_string()),
                            inner: Box::new(Type::Named("i32".to_string())),
                        },
                        ownership: Ownership::Borrowed,
                    },
                    Param {
                        name: "b".to_string(),
                        ty: Type::Reference {
                            mutable: false,
                            lifetime: Some("a".to_string()),
                            inner: Box::new(Type::Named("i32".to_string())),
                        },
                        ownership: Ownership::Borrowed,
                    },
                ],
                return_type: Some(Type::Reference {
                    mutable: false,
                    lifetime: Some("a".to_string()),
                    inner: Box::new(Type::Named("i32".to_string())),
                }),
                trait_bounds: vec![],
                body: Block {
                    stmts: vec![Stmt::Return(Some(ident("a")))],
                    span: span(),
                },
                is_pub: false,
                span: span(),
            })],
        };

        let result = check(&prog);
        assert!(result.is_ok());
    }
}
