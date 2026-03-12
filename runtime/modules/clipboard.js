// runtime/modules/clipboard.js — Clipboard API runtime

const ClipboardRuntime = {
  async copy(textPtr, textLen) {
    try {
      await navigator.clipboard.writeText(readString(textPtr, textLen));
      return 1;
    } catch { return 0; }
  },
  async paste() {
    try { return await navigator.clipboard.readText(); }
    catch { return ''; }
  },
  async copyImage(dataPtr, dataLen) {
    try {
      const data = readString(dataPtr, dataLen);
      const blob = await fetch(data).then(r => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      return 1;
    } catch { return 0; }
  },
};

module.exports = {
  name: 'clipboard',
  runtime: ClipboardRuntime,
  wasmImports: {
    clipboard: {
      copy: ClipboardRuntime.copy,
      paste: ClipboardRuntime.paste,
      copyImage: ClipboardRuntime.copyImage,
    }
  }
};
