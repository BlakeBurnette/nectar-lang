use crate::ast::*;
use std::collections::HashSet;

/// Analyzes a program to determine which WASM import namespaces are used.
///
/// With the unified single-file runtime (core.js), there is no JS module
/// tree-shaking. However, this analysis is still useful for:
///   1. Dead code elimination in the WASM binary (don't emit unused imports)
///   2. Build diagnostics (report which features a program uses)
///   3. Future: conditional compilation of WASM-side feature modules
pub fn detect_required_namespaces(program: &Program) -> HashSet<String> {
    let mut ns = HashSet::new();
    ns.insert("dom".to_string());     // always needed
    ns.insert("mem".to_string());     // always needed
    ns.insert("string".to_string());  // always needed

    for item in &program.items {
        match item {
            Item::Page(_) => { ns.insert("seo".to_string()); }
            Item::Form(_) => { ns.insert("form".to_string()); }
            Item::Channel(_) => { ns.insert("channel".to_string()); }
            Item::Contract(_) => { ns.insert("contract".to_string()); }
            Item::App(app) => {
                ns.insert("pwa".to_string());
                if app.a11y.is_some() { ns.insert("a11y".to_string()); }
            }
            Item::Embed(_) => { ns.insert("embed".to_string()); }
            Item::Pdf(_) => { ns.insert("pdf".to_string()); }
            Item::Payment(_) => { ns.insert("payment".to_string()); }
            Item::Auth(_) => { ns.insert("auth".to_string()); }
            Item::Upload(_) => { ns.insert("upload".to_string()); }
            Item::Db(_) => { ns.insert("db".to_string()); }
            Item::Breakpoints(_) => { ns.insert("responsive".to_string()); }
            Item::Animation(_) => { ns.insert("animation".to_string()); }
            Item::Theme(_) => { ns.insert("theme".to_string()); }
            Item::Component(c) => {
                if c.a11y.is_some() { ns.insert("a11y".to_string()); }
                if !c.shortcuts.is_empty() { ns.insert("shortcuts".to_string()); }
                if c.permissions.is_some() { ns.insert("permissions".to_string()); }
                if !c.gestures.is_empty() { ns.insert("gesture".to_string()); }
                if c.on_destroy.is_some() { ns.insert("lifecycle".to_string()); }
                check_exprs_in_component(c, &mut ns);
            }
            Item::Store(s) => {
                if !s.selectors.is_empty() { ns.insert("state".to_string()); }
                for field in &s.signals {
                    if field.atomic { ns.insert("state".to_string()); }
                }
            }
            Item::LazyComponent(lazy) => {
                ns.insert("loader".to_string());
                if lazy.component.permissions.is_some() { ns.insert("permissions".to_string()); }
                if !lazy.component.gestures.is_empty() { ns.insert("gesture".to_string()); }
                if lazy.component.on_destroy.is_some() { ns.insert("lifecycle".to_string()); }
                check_exprs_in_component(&lazy.component, &mut ns);
            }
            _ => {}
        }
    }

    ns
}

/// Legacy API — returns the same result as detect_required_namespaces.
/// Kept for backward compatibility with existing build tooling.
pub fn detect_required_modules(program: &Program) -> HashSet<String> {
    detect_required_namespaces(program)
}

fn check_exprs_in_component(component: &Component, ns: &mut HashSet<String>) {
    for method in &component.methods {
        check_exprs_in_block(&method.body, ns);
    }
}

fn check_exprs_in_block(block: &Block, ns: &mut HashSet<String>) {
    for stmt in &block.stmts {
        check_exprs_in_stmt(stmt, ns);
    }
}

fn check_exprs_in_stmt(stmt: &Stmt, ns: &mut HashSet<String>) {
    match stmt {
        Stmt::Expr(expr) | Stmt::Return(Some(expr)) => { check_expr(expr, ns); }
        Stmt::Let { value, .. } => { check_expr(value, ns); }
        Stmt::Signal { value, .. } => { check_expr(value, ns); }
        Stmt::LetDestructure { value, .. } => { check_expr(value, ns); }
        Stmt::Yield(expr) => { check_expr(expr, ns); }
        Stmt::Return(None) => {}
    }
}

fn check_expr(expr: &Expr, ns: &mut HashSet<String>) {
    match expr {
        Expr::Spawn { body, .. } => {
            ns.insert("worker".to_string());
            check_exprs_in_block(body, ns);
        }
        Expr::Parallel { tasks, .. } => {
            ns.insert("worker".to_string());
            for task in tasks { check_expr(task, ns); }
        }
        Expr::Env { .. } => { ns.insert("env".to_string()); }
        Expr::Trace { body, .. } => {
            ns.insert("trace".to_string());
            check_exprs_in_block(body, ns);
        }
        Expr::Flag { .. } => { ns.insert("flags".to_string()); }
        Expr::Download { .. } => { ns.insert("io".to_string()); }
        Expr::DynamicImport { .. } => { ns.insert("loader".to_string()); }
        Expr::VirtualList { items, item_height, template, .. } => {
            ns.insert("virtual".to_string());
            check_expr(items, ns);
            check_expr(item_height, ns);
            check_expr(template, ns);
        }
        Expr::Fetch { .. } => { ns.insert("http".to_string()); }
        Expr::FnCall { callee, args, .. } => {
            if let Expr::FieldAccess { object, .. } = &**callee {
                if let Expr::Ident(ref name) = **object {
                    match name.as_str() {
                        "theme" => { ns.insert("theme".to_string()); }
                        "auth" => { ns.insert("auth".to_string()); }
                        "upload" => { ns.insert("upload".to_string()); }
                        "db" => { ns.insert("db".to_string()); }
                        "animate" => { ns.insert("animate".to_string()); }
                        "responsive" => { ns.insert("responsive".to_string()); }
                        "clipboard" => { ns.insert("clipboard".to_string()); }
                        "share" => { ns.insert("share".to_string()); }
                        "storage" => { ns.insert("webapi".to_string()); }
                        _ => {} // std lib namespaces are pure WASM — no JS imports
                    }
                }
            }
            check_expr(callee, ns);
            for arg in args { check_expr(arg, ns); }
        }
        Expr::MethodCall { object, args, .. } => {
            if let Expr::Ident(ref name) = **object {
                match name.as_str() {
                    "clipboard" => { ns.insert("clipboard".to_string()); }
                    _ => {}
                }
            }
            check_expr(object, ns);
            for arg in args { check_expr(arg, ns); }
        }
        // Recurse into sub-expressions
        Expr::Binary { left, right, .. } => { check_expr(left, ns); check_expr(right, ns); }
        Expr::Unary { operand, .. } => { check_expr(operand, ns); }
        Expr::FieldAccess { object, .. } => { check_expr(object, ns); }
        Expr::Index { object, index, .. } => { check_expr(object, ns); check_expr(index, ns); }
        Expr::If { condition, then_block, else_block, .. } => {
            check_expr(condition, ns);
            check_exprs_in_block(then_block, ns);
            if let Some(eb) = else_block { check_exprs_in_block(eb, ns); }
        }
        Expr::Match { subject, arms, .. } => {
            check_expr(subject, ns);
            for arm in arms { check_expr(&arm.body, ns); }
        }
        Expr::For { iterator, body, .. } => { check_expr(iterator, ns); check_exprs_in_block(body, ns); }
        Expr::While { condition, body, .. } => { check_expr(condition, ns); check_exprs_in_block(body, ns); }
        Expr::Block(block) => { check_exprs_in_block(block, ns); }
        Expr::Assign { target, value, .. } => { check_expr(target, ns); check_expr(value, ns); }
        Expr::Await(inner) => { check_expr(inner, ns); }
        Expr::TryCatch { body, catch_body, .. } => { check_expr(body, ns); check_expr(catch_body, ns); }
        Expr::Closure { body, .. } => { check_expr(body, ns); }
        Expr::Borrow(inner) | Expr::BorrowMut(inner) | Expr::Try(inner) | Expr::Stream { source: inner } => {
            check_expr(inner, ns);
        }
        Expr::Suspend { fallback, body, .. } => { check_expr(fallback, ns); check_expr(body, ns); }
        Expr::Send { channel, value, .. } => {
            ns.insert("worker".to_string());
            check_expr(channel, ns); check_expr(value, ns);
        }
        Expr::Receive { channel, .. } => {
            ns.insert("worker".to_string());
            check_expr(channel, ns);
        }
        Expr::Channel { .. } => { ns.insert("worker".to_string()); }
        _ => {}
    }
}

/// Format detected namespaces as a comma-separated string for diagnostics.
pub fn modules_to_string(modules: &HashSet<String>) -> String {
    let mut sorted: Vec<&String> = modules.iter().collect();
    sorted.sort();
    sorted.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(",")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token::Span;

    fn empty_span() -> Span {
        Span { start: 0, end: 0, line: 0, col: 0 }
    }

    #[test]
    fn test_core_always_included() {
        let program = Program { items: vec![] };
        let ns = detect_required_namespaces(&program);
        assert!(ns.contains("dom"));
        assert!(ns.contains("mem"));
        assert!(ns.contains("string"));
        assert_eq!(ns.len(), 3);
    }

    #[test]
    fn test_page_includes_seo() {
        let program = Program {
            items: vec![Item::Page(PageDef {
                name: "Home".to_string(),
                props: vec![],
                meta: None,
                state: vec![],
                methods: vec![],
                styles: vec![],
                render: RenderBlock {
                    body: TemplateNode::TextLiteral("hello".to_string()),
                    span: empty_span(),
                },
                permissions: None,
                gestures: vec![],
                is_pub: false,
                span: empty_span(),
            })],
        };
        let ns = detect_required_namespaces(&program);
        assert!(ns.contains("dom"));
        assert!(ns.contains("seo"));
    }

    #[test]
    fn test_contract_includes_contract() {
        let program = Program {
            items: vec![Item::Contract(ContractDef {
                name: "TestContract".to_string(),
                fields: vec![],
                is_pub: false,
                span: empty_span(),
            })],
        };
        let ns = detect_required_namespaces(&program);
        assert!(ns.contains("contract"));
    }

    #[test]
    fn test_form_includes_form() {
        let program = Program {
            items: vec![Item::Form(FormDef {
                name: "TestForm".to_string(),
                fields: vec![],
                on_submit: None,
                steps: vec![],
                methods: vec![],
                styles: vec![],
                render: None,
                is_pub: false,
                span: empty_span(),
            })],
        };
        let ns = detect_required_namespaces(&program);
        assert!(ns.contains("form"));
    }

    #[test]
    fn test_modules_to_string() {
        let mut ns = HashSet::new();
        ns.insert("dom".to_string());
        ns.insert("seo".to_string());
        ns.insert("form".to_string());
        let result = modules_to_string(&ns);
        assert_eq!(result, "dom,form,seo");
    }
}
