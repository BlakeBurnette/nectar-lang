// runtime/modules/auth.js — Auth syscall layer (logic in Rust/WASM)

const wasmImports = {
  auth: {
    redirect(url) {
      location.href = url;
    },

    setCookie(name, value, opts) {
      document.cookie = `${name}=${value};${opts}`;
    },

    getCookie(name) {
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
      return match ? match[1] : null;
    },

    clearCookie(name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    },
  },
};

module.exports = { name: 'auth', runtime: {}, wasmImports };
