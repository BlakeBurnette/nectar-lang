// runtime/modules/worker.js — Web Worker syscall layer (logic in Rust/WASM)

const _cbs = new Map();
const _workers = new Map();
const _ports = new Map();
let _nextWorker = 1;
let _nextPort = 1;

const wasmImports = {
  worker: {
    createWorker(blobUrl) {
      const worker = new Worker(blobUrl);
      const id = _nextWorker++;
      _workers.set(id, worker);
      return id;
    },

    createBlobUrl(code) {
      return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    },

    postMessage(workerId, data) {
      _workers.get(workerId).postMessage(data);
    },

    onMessage(workerId, cbIdx) {
      _workers.get(workerId).addEventListener('message', e => {
        _cbs.get(cbIdx)?.(e.data);
      });
    },

    terminateWorker(workerId) {
      _workers.get(workerId).terminate();
      _workers.delete(workerId);
    },

    createMessageChannel() {
      const { port1, port2 } = new MessageChannel();
      const id1 = _nextPort++;
      const id2 = _nextPort++;
      _ports.set(id1, port1);
      _ports.set(id2, port2);
      return [id1, id2];
    },

    portPostMessage(portId, data) {
      _ports.get(portId).postMessage(data);
    },

    onPortMessage(portId, cbIdx) {
      _ports.get(portId).addEventListener('message', e => {
        _cbs.get(cbIdx)?.(e.data);
      });
      _ports.get(portId).start();
    },
  },
};

module.exports = { name: 'worker', runtime: { _cbs, _workers, _ports }, wasmImports };
