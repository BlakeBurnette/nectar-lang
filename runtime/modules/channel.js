// runtime/modules/channel.js — Pure syscall layer for WebSocket connections
// ALL logic (reconnection, heartbeats, buffering) lives in Rust/WASM.

export const name = 'channel';
export const runtime = ``;
export const wasmImports = {
  ws: {
    connect(urlPtr, urlLen) { const ws = new WebSocket(NectarRuntime.__getString(urlPtr, urlLen)); return NectarRuntime.__registerObject(ws); },
    send(wsId, dataPtr, dataLen) { NectarRuntime.__getObject(wsId).send(NectarRuntime.__getString(dataPtr, dataLen)); },
    sendBinary(wsId, ptr, len) { NectarRuntime.__getObject(wsId).send(new Uint8Array(NectarRuntime.__memory.buffer, ptr, len)); },
    close(wsId) { NectarRuntime.__getObject(wsId).close(); },
    closeWithCode(wsId, code, reasonPtr, reasonLen) { NectarRuntime.__getObject(wsId).close(code, NectarRuntime.__getString(reasonPtr, reasonLen)); },
    onOpen(wsId, cbIdx) { NectarRuntime.__getObject(wsId).addEventListener('open', () => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    onMessage(wsId, cbIdx) { NectarRuntime.__getObject(wsId).addEventListener('message', (e) => { const ptr = NectarRuntime.__allocString(e.data); NectarRuntime.__instance.exports.__callback_with_data(cbIdx, ptr); }); },
    onClose(wsId, cbIdx) { NectarRuntime.__getObject(wsId).addEventListener('close', () => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    onError(wsId, cbIdx) { NectarRuntime.__getObject(wsId).addEventListener('error', () => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    getReadyState(wsId) { return NectarRuntime.__getObject(wsId).readyState; },
  },
};

if (typeof module !== "undefined") module.exports = { name, runtime, wasmImports };
