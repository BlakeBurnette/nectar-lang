// runtime/modules/payment.js — Payment syscall layer (logic in Rust/WASM)

const _cbs = new Map();
const _iframes = new Map();
let _nextId = 1;

const wasmImports = {
  payment: {
    createSandboxedIframe(url, sandbox, style) {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.sandbox = sandbox;
      iframe.style.cssText = style;
      document.body.appendChild(iframe);
      const id = _nextId++;
      _iframes.set(id, iframe);
      return id;
    },

    postMessageToIframe(iframeId, data) {
      _iframes.get(iframeId).contentWindow.postMessage(data, '*');
    },

    onIframeMessage(cbIdx) {
      window.addEventListener('message', e => {
        _cbs.get(cbIdx)?.(e.data, e.origin);
      });
    },
  },
};

module.exports = { name: 'payment', runtime: { _cbs, _iframes }, wasmImports };
