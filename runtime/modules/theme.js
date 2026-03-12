// runtime/modules/theme.js — Theme syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  theme: {
    getPreferredColorScheme() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 1 : 0;
    },

    onColorSchemeChange(cbIdx) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        _cbs.get(cbIdx)?.(e.matches ? 1 : 0);
      });
    },

    setDocAttribute(name, value) {
      document.documentElement.setAttribute(name, value);
    },

    setCssVar(name, value) {
      document.documentElement.style.setProperty(name, value);
    },

    getStoredTheme() {
      return localStorage.getItem('nectar-theme');
    },

    storeTheme(theme) {
      localStorage.setItem('nectar-theme', theme);
    },
  },
};

module.exports = { name: 'theme', runtime: { _cbs }, wasmImports };
