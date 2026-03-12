// runtime/modules/upload.js — Upload syscall layer (logic in Rust/WASM)

const _cbs = new Map();
const _xhrs = new Map();
const _fds = new Map();
let _nextXhr = 1;
let _nextFd = 1;

const wasmImports = {
  upload: {
    openFilePicker(accept, multiple) {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      if (multiple) input.multiple = true;
      input.click();
      return input;
    },

    createXhr(url, method) {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      const id = _nextXhr++;
      _xhrs.set(id, xhr);
      return id;
    },

    sendXhr(xhrId, formData) {
      _xhrs.get(xhrId).send(formData);
    },

    abortXhr(xhrId) {
      _xhrs.get(xhrId).abort();
    },

    onXhrProgress(xhrId, cbIdx) {
      _xhrs.get(xhrId).upload.addEventListener('progress', e => {
        _cbs.get(cbIdx)?.(e.loaded, e.total);
      });
    },

    onXhrComplete(xhrId, cbIdx) {
      _xhrs.get(xhrId).addEventListener('load', e => {
        _cbs.get(cbIdx)?.(e.target.status, e.target.response);
      });
    },

    createFormData() {
      const fd = new FormData();
      const id = _nextFd++;
      _fds.set(id, fd);
      return id;
    },

    appendFormData(fdId, name, file) {
      _fds.get(fdId).append(name, file);
    },
  },
};

module.exports = { name: 'upload', runtime: { _cbs, _xhrs, _fds }, wasmImports };
