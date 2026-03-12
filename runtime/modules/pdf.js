// runtime/modules/pdf.js — PDF/IO syscall layer (logic in Rust/WASM)

const _iframes = new Map();
let _nextId = 1;

const wasmImports = {
  pdf: {
    createIframe() {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;';
      document.body.appendChild(iframe);
      const id = _nextId++;
      _iframes.set(id, iframe);
      return id;
    },

    writeToIframe(iframeId, html) {
      const iframe = _iframes.get(iframeId);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    },

    triggerPrint(iframeId) {
      _iframes.get(iframeId).contentWindow.print();
    },

    downloadBlob(data, filename, mimeType) {
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
};

module.exports = { name: 'pdf', runtime: { _iframes }, wasmImports };
