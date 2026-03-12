// runtime/modules/trace.js — Tracing syscall layer (logic in Rust/WASM)

const wasmImports = {
  trace: {
    performanceNow() {
      return performance.now();
    },

    consoleMark(name) {
      performance.mark(name);
    },

    consoleMeasure(name, startMark, endMark) {
      performance.measure(name, startMark, endMark);
    },

    consoleDebug(msg) {
      console.debug(msg);
    },
  },
};

module.exports = { name: 'trace', runtime: {}, wasmImports };
