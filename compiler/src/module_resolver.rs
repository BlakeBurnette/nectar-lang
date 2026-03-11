use std::path::{Path, PathBuf};
use std::collections::HashSet;

/// Resolves module paths to file system paths and loads source files.
pub struct ModuleResolver {
    /// Root directory of the project (directory containing the entry file)
    root_dir: PathBuf,
    /// Set of already-loaded module paths (for circular dependency detection)
    loaded: HashSet<PathBuf>,
}

#[derive(Debug)]
pub struct ModuleResolveError {
    pub message: String,
}

impl std::fmt::Display for ModuleResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ModuleResolveError {}

impl ModuleResolver {
    /// Create a new resolver rooted at the given directory.
    pub fn new(root_dir: PathBuf) -> Self {
        Self {
            root_dir,
            loaded: HashSet::new(),
        }
    }

    /// Resolve a module path (e.g. `["math", "vec3"]`) to a file system path.
    ///
    /// Tries two conventions:
    ///   1. `<root>/math/vec3.arc`
    ///   2. `<root>/math/vec3/mod.arc`
    pub fn resolve_module(&self, path: &[String]) -> Result<PathBuf, ModuleResolveError> {
        self.resolve_module_from(&self.root_dir, path)
    }

    /// Resolve a module path relative to a given base directory.
    pub fn resolve_module_from(
        &self,
        base_dir: &Path,
        path: &[String],
    ) -> Result<PathBuf, ModuleResolveError> {
        if path.is_empty() {
            return Err(ModuleResolveError {
                message: "empty module path".to_string(),
            });
        }

        // Build the directory path from all segments except the last
        let mut dir = base_dir.to_path_buf();
        for segment in &path[..path.len() - 1] {
            dir.push(segment);
        }

        let last = &path[path.len() - 1];

        // Try `<dir>/<last>.arc`
        let file_path = dir.join(format!("{}.arc", last));
        if file_path.exists() {
            return Ok(file_path);
        }

        // Try `<dir>/<last>/mod.arc`
        let mod_path = dir.join(last).join("mod.arc");
        if mod_path.exists() {
            return Ok(mod_path);
        }

        Err(ModuleResolveError {
            message: format!(
                "module `{}` not found: tried `{}` and `{}`",
                path.join("::"),
                file_path.display(),
                mod_path.display(),
            ),
        })
    }

    /// Load a source file from disk.
    pub fn load_module(&self, path: &Path) -> Result<String, ModuleResolveError> {
        std::fs::read_to_string(path).map_err(|e| ModuleResolveError {
            message: format!("failed to read `{}`: {}", path.display(), e),
        })
    }

    /// Mark a module as loaded. Returns false if it was already loaded
    /// (indicating a circular dependency).
    pub fn mark_loaded(&mut self, path: &Path) -> bool {
        let canonical = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf());
        self.loaded.insert(canonical)
    }

    /// Check if a module has already been loaded.
    pub fn is_loaded(&self, path: &Path) -> bool {
        let canonical = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf());
        self.loaded.contains(&canonical)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_test_dir() -> tempfile::TempDir {
        let dir = tempfile::TempDir::new().unwrap();

        // Create foo.arc
        fs::write(dir.path().join("foo.arc"), "pub fn hello() {}").unwrap();

        // Create bar/mod.arc
        fs::create_dir_all(dir.path().join("bar")).unwrap();
        fs::write(dir.path().join("bar").join("mod.arc"), "pub fn world() {}").unwrap();

        // Create math/vec3.arc
        fs::create_dir_all(dir.path().join("math")).unwrap();
        fs::write(dir.path().join("math").join("vec3.arc"), "pub struct Vec3 {}").unwrap();

        dir
    }

    #[test]
    fn test_resolve_simple_module() {
        let dir = setup_test_dir();
        let resolver = ModuleResolver::new(dir.path().to_path_buf());

        let result = resolver.resolve_module(&["foo".to_string()]);
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("foo.arc"));
    }

    #[test]
    fn test_resolve_mod_arc() {
        let dir = setup_test_dir();
        let resolver = ModuleResolver::new(dir.path().to_path_buf());

        let result = resolver.resolve_module(&["bar".to_string()]);
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.ends_with("mod.arc"));
    }

    #[test]
    fn test_resolve_nested_module() {
        let dir = setup_test_dir();
        let resolver = ModuleResolver::new(dir.path().to_path_buf());

        let result = resolver.resolve_module(&["math".to_string(), "vec3".to_string()]);
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("vec3.arc"));
    }

    #[test]
    fn test_resolve_nonexistent() {
        let dir = setup_test_dir();
        let resolver = ModuleResolver::new(dir.path().to_path_buf());

        let result = resolver.resolve_module(&["nonexistent".to_string()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_circular_detection() {
        let dir = setup_test_dir();
        let mut resolver = ModuleResolver::new(dir.path().to_path_buf());

        let path = dir.path().join("foo.arc");
        assert!(resolver.mark_loaded(&path)); // first time
        assert!(!resolver.mark_loaded(&path)); // second time = circular
        assert!(resolver.is_loaded(&path));
    }

    #[test]
    fn test_load_module() {
        let dir = setup_test_dir();
        let resolver = ModuleResolver::new(dir.path().to_path_buf());

        let content = resolver.load_module(&dir.path().join("foo.arc")).unwrap();
        assert_eq!(content, "pub fn hello() {}");
    }
}
