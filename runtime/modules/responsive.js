// runtime/modules/responsive.js — Responsive syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  responsive: {
    getWindowWidth() {
      return window.innerWidth;
    },

    onResize(cbIdx) {
      window.addEventListener('resize', () => {
        _cbs.get(cbIdx)?.(window.innerWidth, window.innerHeight);
      });
    },

    matchMedia(query) {
      return window.matchMedia(query).matches ? 1 : 0;
    },
  },
};

module.exports = { name: 'responsive', runtime: { _cbs }, wasmImports };
