// runtime/modules/time.js — Time syscall layer (logic in Rust/WASM)

const wasmImports = {
  time: {
    dateNow() {
      return Date.now();
    },

    newDate(ms) {
      return new Date(ms).toISOString();
    },

    formatDate(ms, locale, optsJson) {
      return new Intl.DateTimeFormat(locale, JSON.parse(optsJson)).format(new Date(ms));
    },

    getTimezoneOffset() {
      return new Date().getTimezoneOffset();
    },
  },
};

module.exports = { name: 'time', runtime: {}, wasmImports };
