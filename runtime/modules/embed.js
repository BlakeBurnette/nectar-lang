// runtime/modules/embed.js — Embed syscall layer (logic in Rust/WASM)

const _cbs = new Map();

const wasmImports = {
  embed: {
    loadScript(url, attrs) {
      const script = document.createElement('script');
      script.src = url;
      if (attrs) Object.assign(script, JSON.parse(attrs));
      document.head.appendChild(script);
    },

    loadIframe(url, sandbox, style) {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.sandbox = sandbox;
      iframe.style.cssText = style;
      document.body.appendChild(iframe);
      return iframe;
    },

    observeViewport(elId, cbIdx) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => _cbs.get(cbIdx)?.(entry.isIntersecting ? 1 : 0));
      });
      observer.observe(document.getElementById(elId));
    },

    requestIdleCallback(cbIdx) {
      const fn = deadline => _cbs.get(cbIdx)?.(deadline.timeRemaining());
      if (typeof window.requestIdleCallback !== 'undefined') {
        window.requestIdleCallback(fn);
      } else {
        setTimeout(() => fn({ timeRemaining: () => 0 }), 1);
      }
    },
  },
};

module.exports = { name: 'embed', runtime: { _cbs }, wasmImports };
