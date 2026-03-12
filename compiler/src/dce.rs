//! Dead code elimination pass — removes unreachable and unused code.
//!
//! This pass performs several eliminations:
//! - Removes statements after `return` in a block
//! - Removes `if false { ... }` branches (after constant folding)
//! - Removes unused local variables (assigned but never read)
//! - Removes unused private functions (not called and not exported)

use std::collections::HashSet;

use crate::ast::*;

/// Statistics about what dead code elimination accomplished.
#[derive(Debug, Default)]
pub struct DceStats {
    pub stmts_removed: usize,
    pub functions_removed: usize,
    pub unused_vars_removed: usize,
}

/// Eliminate dead code from the entire program.
pub fn eliminate_dead_code(program: &mut Program, stats: &mut DceStats) {
    // Phase 1: Remove unreachable statements within function bodies
    for item in &mut program.items {
        eliminate_in_item(item, stats);
    }

    // Phase 2: Remove unused private functions
    remove_unused_functions(program, stats);
}

fn eliminate_in_item(item: &mut Item, stats: &mut DceStats) {
    match item {
        Item::Function(f) => {
            eliminate_in_block(&mut f.body, stats);
            remove_unused_locals_in_block(&mut f.body, stats);
        }
        Item::Component(c) => {
            for method in &mut c.methods {
                eliminate_in_block(&mut method.body, stats);
                remove_unused_locals_in_block(&mut method.body, stats);
            }
        }
        Item::Impl(imp) => {
            for method in &mut imp.methods {
                eliminate_in_block(&mut method.body, stats);
                remove_unused_locals_in_block(&mut method.body, stats);
            }
        }
        Item::Store(store) => {
            for action in &mut store.actions {
                eliminate_in_block(&mut action.body, stats);
            }
            for computed in &mut store.computed {
                eliminate_in_block(&mut computed.body, stats);
            }
            for effect in &mut store.effects {
                eliminate_in_block(&mut effect.body, stats);
            }
        }
        Item::Agent(agent) => {
            for method in &mut agent.methods {
                eliminate_in_block(&mut method.body, stats);
            }
            for tool in &mut agent.tools {
                eliminate_in_block(&mut tool.body, stats);
            }
        }
        Item::Page(page) => {
            for method in &mut page.methods {
                eliminate_in_block(&mut method.body, stats);
                remove_unused_locals_in_block(&mut method.body, stats);
            }
        }
        Item::Form(form) => {
            for method in &mut form.methods {
                eliminate_in_block(&mut method.body, stats);
                remove_unused_locals_in_block(&mut method.body, stats);
            }
        }
        _ => {}
    }
}

/// Remove statements after a `return` in a block.
fn eliminate_in_block(block: &mut Block, stats: &mut DceStats) {
    // Recurse into nested blocks first
    for stmt in &mut block.stmts {
        eliminate_in_stmt(stmt, stats);
    }

    // Find first return statement and truncate after it
    if let Some(pos) = block.stmts.iter().position(|s| matches!(s, Stmt::Return(_))) {
        let removed = block.stmts.len() - (pos + 1);
        if removed > 0 {
            block.stmts.truncate(pos + 1);
            stats.stmts_removed += removed;
        }
    }

    // Remove `if false { ... }` with no else (these are dead after const folding)
    let before_len = block.stmts.len();
    block.stmts.retain(|stmt| {
        !matches!(stmt,
            Stmt::Expr(Expr::If {
                condition,
                else_block: None,
                ..
            }) if matches!(condition.as_ref(), Expr::Bool(false))
        )
    });
    let removed = before_len - block.stmts.len();
    stats.stmts_removed += removed;
}

fn eliminate_in_stmt(stmt: &mut Stmt, stats: &mut DceStats) {
    match stmt {
        Stmt::Expr(expr) => eliminate_in_expr(expr, stats),
        Stmt::Let { value, .. } => eliminate_in_expr(value, stats),
        Stmt::Signal { value, .. } => eliminate_in_expr(value, stats),
        Stmt::Return(Some(expr)) => eliminate_in_expr(expr, stats),
        Stmt::Return(None) => {}
        Stmt::Yield(expr) => eliminate_in_expr(expr, stats),
        _ => {}
    }
}

fn eliminate_in_expr(expr: &mut Expr, stats: &mut DceStats) {
    match expr {
        Expr::If { condition, then_block, else_block, .. } => {
            eliminate_in_expr(condition, stats);
            eliminate_in_block(then_block, stats);
            if let Some(eb) = else_block {
                eliminate_in_block(eb, stats);
            }
        }
        Expr::Block(block) => eliminate_in_block(block, stats),
        Expr::For { iterator, body, .. } => {
            eliminate_in_expr(iterator, stats);
            eliminate_in_block(body, stats);
        }
        Expr::While { condition, body, .. } => {
            eliminate_in_expr(condition, stats);
            eliminate_in_block(body, stats);
        }
        Expr::Closure { body, .. } => {
            eliminate_in_expr(body, stats);
        }
        _ => {}
    }
}

/// Remove unused local variables — variables assigned in `let` but never referenced.
fn remove_unused_locals_in_block(block: &mut Block, stats: &mut DceStats) {
    // Collect all variable names that are read
    let mut referenced = HashSet::new();
    for stmt in &block.stmts {
        collect_references_in_stmt(stmt, &mut referenced);
    }

    // Remove `let` bindings for variables that are never referenced,
    // but only if the value has no side effects.
    let before_len = block.stmts.len();
    block.stmts.retain(|stmt| {
        match stmt {
            Stmt::Let { name, value, .. } => {
                if referenced.contains(name.as_str()) {
                    true
                } else if is_pure(value) {
                    false // safe to remove
                } else {
                    true // keep — value may have side effects
                }
            }
            _ => true,
        }
    });
    let removed = before_len - block.stmts.len();
    stats.unused_vars_removed += removed;
    stats.stmts_removed += removed;
}

/// Collect all identifiers referenced in a statement (for usage analysis).
fn collect_references_in_stmt(stmt: &Stmt, refs: &mut HashSet<String>) {
    match stmt {
        Stmt::Let { value, .. } => collect_references_in_expr(value, refs),
        Stmt::Signal { value, .. } => collect_references_in_expr(value, refs),
        Stmt::Expr(expr) => collect_references_in_expr(expr, refs),
        Stmt::Return(Some(expr)) => collect_references_in_expr(expr, refs),
        Stmt::Return(None) => {}
        Stmt::Yield(expr) => collect_references_in_expr(expr, refs),
        _ => {}
    }
}

fn collect_references_in_expr(expr: &Expr, refs: &mut HashSet<String>) {
    match expr {
        Expr::Ident(name) => { refs.insert(name.clone()); }
        Expr::Binary { left, right, .. } => {
            collect_references_in_expr(left, refs);
            collect_references_in_expr(right, refs);
        }
        Expr::Unary { operand, .. } => collect_references_in_expr(operand, refs),
        Expr::FnCall { callee, args, .. } => {
            collect_references_in_expr(callee, refs);
            for arg in args { collect_references_in_expr(arg, refs); }
        }
        Expr::MethodCall { object, args, .. } => {
            collect_references_in_expr(object, refs);
            for arg in args { collect_references_in_expr(arg, refs); }
        }
        Expr::FieldAccess { object, .. } => collect_references_in_expr(object, refs),
        Expr::Index { object, index, .. } => {
            collect_references_in_expr(object, refs);
            collect_references_in_expr(index, refs);
        }
        Expr::If { condition, then_block, else_block, .. } => {
            collect_references_in_expr(condition, refs);
            for s in &then_block.stmts { collect_references_in_stmt(s, refs); }
            if let Some(eb) = else_block {
                for s in &eb.stmts { collect_references_in_stmt(s, refs); }
            }
        }
        Expr::Block(block) => {
            for s in &block.stmts { collect_references_in_stmt(s, refs); }
        }
        Expr::For { iterator, body, .. } => {
            collect_references_in_expr(iterator, refs);
            for s in &body.stmts { collect_references_in_stmt(s, refs); }
        }
        Expr::While { condition, body, .. } => {
            collect_references_in_expr(condition, refs);
            for s in &body.stmts { collect_references_in_stmt(s, refs); }
        }
        Expr::Assign { target, value, .. } => {
            collect_references_in_expr(target, refs);
            collect_references_in_expr(value, refs);
        }
        Expr::Closure { body, .. } => collect_references_in_expr(body, refs),
        Expr::StructInit { fields, .. } => {
            for (_, v) in fields { collect_references_in_expr(v, refs); }
        }
        Expr::Match { subject, arms, .. } => {
            collect_references_in_expr(subject, refs);
            for arm in arms { collect_references_in_expr(&arm.body, refs); }
        }
        Expr::Borrow(e) | Expr::BorrowMut(e) | Expr::Await(e)
        | Expr::Stream { source: e } | Expr::Navigate { path: e }
        | Expr::Receive { channel: e } => {
            collect_references_in_expr(e, refs);
        }
        Expr::Spawn { body, .. } => {
            for s in &body.stmts { collect_references_in_stmt(s, refs); }
        }
        Expr::Send { channel, value } => {
            collect_references_in_expr(channel, refs);
            collect_references_in_expr(value, refs);
        }
        Expr::Suspend { fallback, body } => {
            collect_references_in_expr(fallback, refs);
            collect_references_in_expr(body, refs);
        }
        Expr::TryCatch { body, catch_body, .. } => {
            collect_references_in_expr(body, refs);
            collect_references_in_expr(catch_body, refs);
        }
        Expr::Fetch { url, options, .. } => {
            collect_references_in_expr(url, refs);
            if let Some(opts) = options { collect_references_in_expr(opts, refs); }
        }
        Expr::Parallel { tasks, .. } => {
            for e in tasks { collect_references_in_expr(e, refs); }
        }
        Expr::PromptTemplate { interpolations, .. } => {
            for (_, e) in interpolations { collect_references_in_expr(e, refs); }
        }
        Expr::Env { name, .. } => {
            collect_references_in_expr(name, refs);
        }
        Expr::Trace { label, body, .. } => {
            collect_references_in_expr(label, refs);
            for s in &body.stmts { collect_references_in_stmt(s, refs); }
        }
        Expr::Flag { name, .. } => {
            collect_references_in_expr(name, refs);
        }
        _ => {}
    }
}

/// Check if an expression is pure (has no side effects).
fn is_pure(expr: &Expr) -> bool {
    match expr {
        Expr::Integer(_) | Expr::Float(_) | Expr::StringLit(_)
        | Expr::Bool(_) | Expr::Ident(_) | Expr::SelfExpr => true,
        Expr::Binary { left, right, .. } => is_pure(left) && is_pure(right),
        Expr::Unary { operand, .. } => is_pure(operand),
        Expr::StructInit { fields, .. } => fields.iter().all(|(_, v)| is_pure(v)),
        Expr::FieldAccess { object, .. } => is_pure(object),
        Expr::Borrow(e) | Expr::BorrowMut(e) => is_pure(e),
        // Function calls, method calls, await, fetch, etc. are impure
        _ => false,
    }
}

/// Remove unused private functions that are never called from anywhere.
fn remove_unused_functions(program: &mut Program, stats: &mut DceStats) {
    // Collect all function names that are referenced
    let mut called_fns = HashSet::new();
    for item in &program.items {
        collect_called_functions_in_item(item, &mut called_fns);
    }

    let before_len = program.items.len();
    program.items.retain(|item| {
        match item {
            Item::Function(f) => {
                if f.is_pub {
                    true // keep public functions
                } else {
                    called_fns.contains(f.name.as_str())
                }
            }
            _ => true,
        }
    });
    let removed = before_len - program.items.len();
    stats.functions_removed += removed;
}

fn collect_called_functions_in_item(item: &Item, called: &mut HashSet<String>) {
    match item {
        Item::Function(f) => {
            for s in &f.body.stmts { collect_references_in_stmt(s, called); }
        }
        Item::Component(c) => {
            for method in &c.methods {
                for s in &method.body.stmts { collect_references_in_stmt(s, called); }
            }
            // Mark component name as used
            called.insert(c.name.clone());
        }
        Item::Impl(imp) => {
            for method in &imp.methods {
                for s in &method.body.stmts { collect_references_in_stmt(s, called); }
            }
        }
        Item::Store(store) => {
            for action in &store.actions {
                for s in &action.body.stmts { collect_references_in_stmt(s, called); }
            }
            for computed in &store.computed {
                for s in &computed.body.stmts { collect_references_in_stmt(s, called); }
            }
            for effect in &store.effects {
                for s in &effect.body.stmts { collect_references_in_stmt(s, called); }
            }
        }
        Item::Agent(agent) => {
            for method in &agent.methods {
                for s in &method.body.stmts { collect_references_in_stmt(s, called); }
            }
            for tool in &agent.tools {
                for s in &tool.body.stmts { collect_references_in_stmt(s, called); }
            }
        }
        Item::Router(router) => {
            for route in &router.routes {
                called.insert(route.component.clone());
                if let Some(ref guard) = route.guard {
                    collect_references_in_expr(guard, called);
                }
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token::Span;

    fn dummy_span() -> Span {
        Span { start: 0, end: 0, line: 0, col: 0 }
    }

    fn make_fn(name: &str, is_pub: bool, stmts: Vec<Stmt>) -> Item {
        Item::Function(Function {
            name: name.to_string(),
            lifetimes: vec![],
            type_params: vec![],
            params: vec![],
            return_type: None,
            trait_bounds: vec![],
            body: Block { stmts, span: dummy_span() },
            is_pub,
            must_use: false,
            span: dummy_span(),
        })
    }

    #[test]
    fn test_remove_after_return() {
        let stmts = vec![
            Stmt::Return(Some(Expr::Integer(42))),
            Stmt::Expr(Expr::Integer(99)),   // dead
            Stmt::Expr(Expr::Integer(100)),  // dead
        ];
        let mut program = Program {
            items: vec![make_fn("test", true, stmts)],
        };
        let mut stats = DceStats::default();
        eliminate_dead_code(&mut program, &mut stats);

        match &program.items[0] {
            Item::Function(f) => {
                assert_eq!(f.body.stmts.len(), 1);
                assert_eq!(f.body.stmts[0], Stmt::Return(Some(Expr::Integer(42))));
            }
            _ => panic!("expected function"),
        }
        assert_eq!(stats.stmts_removed, 2);
    }

    #[test]
    fn test_remove_if_false() {
        let stmts = vec![
            Stmt::Expr(Expr::If {
                condition: Box::new(Expr::Bool(false)),
                then_block: Block {
                    stmts: vec![Stmt::Expr(Expr::Integer(42))],
                    span: dummy_span(),
                },
                else_block: None,
            }),
            Stmt::Expr(Expr::Integer(10)),
        ];
        let mut program = Program {
            items: vec![make_fn("test", true, stmts)],
        };
        let mut stats = DceStats::default();
        eliminate_dead_code(&mut program, &mut stats);

        match &program.items[0] {
            Item::Function(f) => {
                // The `if false` should be removed, leaving only the 10
                assert_eq!(f.body.stmts.len(), 1);
                assert_eq!(f.body.stmts[0], Stmt::Expr(Expr::Integer(10)));
            }
            _ => panic!("expected function"),
        }
    }

    #[test]
    fn test_remove_unused_private_function() {
        let items = vec![
            make_fn("main", true, vec![
                Stmt::Expr(Expr::FnCall {
                    callee: Box::new(Expr::Ident("helper".to_string())),
                    args: vec![],
                }),
            ]),
            make_fn("helper", false, vec![Stmt::Return(Some(Expr::Integer(1)))]),
            make_fn("unused", false, vec![Stmt::Return(Some(Expr::Integer(2)))]),
        ];
        let mut program = Program { items };
        let mut stats = DceStats::default();
        eliminate_dead_code(&mut program, &mut stats);

        // `unused` should be removed, `helper` and `main` kept
        assert_eq!(program.items.len(), 2);
        let names: Vec<_> = program.items.iter().map(|item| {
            match item {
                Item::Function(f) => f.name.as_str(),
                _ => "",
            }
        }).collect();
        assert!(names.contains(&"main"));
        assert!(names.contains(&"helper"));
        assert!(!names.contains(&"unused"));
        assert_eq!(stats.functions_removed, 1);
    }

    #[test]
    fn test_remove_unused_local_variable() {
        let stmts = vec![
            Stmt::Let {
                name: "unused_var".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::Integer(42),
                ownership: Ownership::Owned,
            },
            Stmt::Expr(Expr::Integer(10)),
        ];
        let mut program = Program {
            items: vec![make_fn("test", true, stmts)],
        };
        let mut stats = DceStats::default();
        eliminate_dead_code(&mut program, &mut stats);

        match &program.items[0] {
            Item::Function(f) => {
                assert_eq!(f.body.stmts.len(), 1);
                assert_eq!(f.body.stmts[0], Stmt::Expr(Expr::Integer(10)));
            }
            _ => panic!("expected function"),
        }
        assert_eq!(stats.unused_vars_removed, 1);
    }

    #[test]
    fn test_keep_used_local_variable() {
        let stmts = vec![
            Stmt::Let {
                name: "x".to_string(),
                ty: None,
                mutable: false,
                secret: false,
                value: Expr::Integer(42),
                ownership: Ownership::Owned,
            },
            Stmt::Expr(Expr::Ident("x".to_string())),
        ];
        let mut program = Program {
            items: vec![make_fn("test", true, stmts)],
        };
        let mut stats = DceStats::default();
        eliminate_dead_code(&mut program, &mut stats);

        match &program.items[0] {
            Item::Function(f) => {
                assert_eq!(f.body.stmts.len(), 2); // both kept
            }
            _ => panic!("expected function"),
        }
        assert_eq!(stats.unused_vars_removed, 0);
    }
}
