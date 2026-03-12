// runtime/modules/dnd.js — Drag and Drop syscall layer (logic in Rust/WASM)

const _cbs = new Map();
const _events = new Map();
let _nextEvent = 1;

const wasmImports = {
  dnd: {
    addDragListeners(elId, startCb, endCb) {
      const el = document.getElementById(elId);
      el.addEventListener('dragstart', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(startCb)?.(eid);
      });
      el.addEventListener('dragend', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(endCb)?.(eid);
      });
    },

    addDropListeners(elId, overCb, leaveCb, dropCb) {
      const el = document.getElementById(elId);
      el.addEventListener('dragover', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(overCb)?.(eid);
      });
      el.addEventListener('dragleave', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(leaveCb)?.(eid);
      });
      el.addEventListener('drop', e => {
        const eid = _nextEvent++;
        _events.set(eid, e);
        _cbs.get(dropCb)?.(eid);
      });
    },

    setDragData(eventId, format, data) {
      _events.get(eventId).dataTransfer.setData(format, data);
    },

    getDragData(eventId, format) {
      return _events.get(eventId).dataTransfer.getData(format);
    },

    preventDefault(eventId) {
      _events.get(eventId).preventDefault();
    },
  },
};

module.exports = { name: 'dnd', runtime: { _cbs, _events }, wasmImports };
