// runtime/modules/loader.js — Script/link loading syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  loader: {
    insertScript(url, cbIdx) {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => _cbs.get(cbIdx)?.(1);
      script.onerror = () => _cbs.get(cbIdx)?.(0);
      document.head.appendChild(script);
    },

    insertLink(url, rel) {
      const link = document.createElement('link');
      link.href = url;
      link.rel = rel;
      document.head.appendChild(link);
    },
  },
};

module.exports = { name: 'loader', runtime: { _cbs }, wasmImports };
