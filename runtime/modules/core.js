// runtime/modules/core.js — Nectar unified syscall layer
// ONE file. ONLY browser APIs that WASM physically cannot call.
// Everything else (logic, state, routing, components, formatting, crypto) is pure Rust/WASM.
//
// DOM strategy:
//   - Initial render: WASM builds HTML string in linear memory, single mount() sets innerHTML
//   - Updates: WASM writes batched opcodes into linear memory, single flush() call per frame
//   - This collapses ~50 individual WASM→JS boundary crossings into 1-2 per frame

// ── Flush opcodes ────────────────────────────────────────────────────────────
const OP_SET_TEXT       = 1;
const OP_SET_ATTR       = 2;
const OP_REMOVE_ATTR    = 3;
const OP_APPEND_CHILD   = 4;
const OP_REMOVE_CHILD   = 5;
const OP_INSERT_BEFORE  = 6;
const OP_SET_STYLE      = 7;
const OP_CLASS_ADD      = 8;
const OP_CLASS_REMOVE   = 9;
const OP_CLASS_TOGGLE   = 10;
const OP_SET_INNER_HTML = 11;
const OP_ADD_EVENT      = 12;
const OP_REMOVE_EVENT   = 13;
const OP_FOCUS          = 14;
const OP_BLUR           = 15;
const OP_SET_PROPERTY   = 16;

// ── Runtime object pool ──────────────────────────────────────────────────────
const NectarRuntime = {
  __elements: [null],   // index 0 = null sentinel
  __objects: [null],     // WebSocket, Worker, XHR, IDB, Observer, etc.
  __callbacks: [],
  __memory: null,
  __instance: null,
  __decoder: new TextDecoder(),
  __encoder: new TextEncoder(),

  __registerElement(el) {
    if (!el) return 0;
    this.__elements.push(el);
    return this.__elements.length - 1;
  },
  __getElement(id) { return this.__elements[id]; },

  __registerObject(obj) {
    if (!obj) return 0;
    this.__objects.push(obj);
    return this.__objects.length - 1;
  },
  __getObject(id) { return this.__objects[id]; },

  __getString(ptr, len) {
    return this.__decoder.decode(new Uint8Array(this.__memory.buffer, ptr, len));
  },
  __allocString(str) {
    const bytes = this.__encoder.encode(str);
    const ptr = this.__instance.exports.alloc(bytes.length);
    new Uint8Array(this.__memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  },
  __allocStringWithLen(str) {
    const bytes = this.__encoder.encode(str);
    const ptr = this.__instance.exports.alloc(bytes.length);
    new Uint8Array(this.__memory.buffer, ptr, bytes.length).set(bytes);
    return { ptr, len: bytes.length };
  },
  __cb(idx) { this.__instance.exports.__callback(idx); },
  __cbData(idx, ptr) { this.__instance.exports.__callback_with_data(idx, ptr); },

  __init(instance) {
    this.__instance = instance;
    this.__memory = instance.exports.memory;
  },
};

// ── Shorthand ────────────────────────────────────────────────────────────────
const R = NectarRuntime;

// ══════════════════════════════════════════════════════════════════════════════
//  WASM IMPORTS — organized by namespace to match codegen.rs import declarations
// ══════════════════════════════════════════════════════════════════════════════

export const name = 'core';
export const runtime = ``;
export const wasmImports = {

  // ── DOM: mount/flush command buffer + element queries ────────────────────
  dom: {
    mount(containerElId, htmlPtr, htmlLen) {
      R.__getElement(containerElId).innerHTML = R.__getString(htmlPtr, htmlLen);
    },

    hydrateRefs(containerElId) {
      const container = R.__getElement(containerElId);
      const nodes = container.querySelectorAll('[data-nid]');
      let count = 0;
      for (let i = 0; i < nodes.length; i++) {
        const nid = parseInt(nodes[i].getAttribute('data-nid'), 10);
        while (R.__elements.length <= nid) R.__elements.push(null);
        R.__elements[nid] = nodes[i];
        count++;
      }
      return count;
    },

    flush(bufPtr, bufLen) {
      const mem = R.__memory.buffer;
      const buf = new Uint32Array(mem, bufPtr, bufLen >>> 2);
      const els = R.__elements;
      const dec = R.__decoder;
      const inst = R.__instance;
      let i = 0;
      const end = buf.length;

      while (i < end) {
        const op = buf[i++];
        switch (op) {
          case OP_SET_TEXT: {
            const id = buf[i++], p = buf[i++], l = buf[i++];
            els[id].textContent = dec.decode(new Uint8Array(mem, p, l));
            break;
          }
          case OP_SET_ATTR: {
            const id = buf[i++], kp = buf[i++], kl = buf[i++], vp = buf[i++], vl = buf[i++];
            els[id].setAttribute(dec.decode(new Uint8Array(mem, kp, kl)), dec.decode(new Uint8Array(mem, vp, vl)));
            break;
          }
          case OP_REMOVE_ATTR: {
            const id = buf[i++], kp = buf[i++], kl = buf[i++];
            els[id].removeAttribute(dec.decode(new Uint8Array(mem, kp, kl)));
            break;
          }
          case OP_APPEND_CHILD: { els[buf[i++]].appendChild(els[buf[i++]]); break; }
          case OP_REMOVE_CHILD: { els[buf[i++]].removeChild(els[buf[i++]]); break; }
          case OP_INSERT_BEFORE: {
            const pid = buf[i++], nid = buf[i++], rid = buf[i++];
            els[pid].insertBefore(els[nid], els[rid]);
            break;
          }
          case OP_SET_STYLE: {
            const id = buf[i++], pp = buf[i++], pl = buf[i++], vp = buf[i++], vl = buf[i++];
            els[id].style.setProperty(dec.decode(new Uint8Array(mem, pp, pl)), dec.decode(new Uint8Array(mem, vp, vl)));
            break;
          }
          case OP_CLASS_ADD: { const id = buf[i++], p = buf[i++], l = buf[i++]; els[id].classList.add(dec.decode(new Uint8Array(mem, p, l))); break; }
          case OP_CLASS_REMOVE: { const id = buf[i++], p = buf[i++], l = buf[i++]; els[id].classList.remove(dec.decode(new Uint8Array(mem, p, l))); break; }
          case OP_CLASS_TOGGLE: { const id = buf[i++], p = buf[i++], l = buf[i++]; els[id].classList.toggle(dec.decode(new Uint8Array(mem, p, l))); break; }
          case OP_SET_INNER_HTML: {
            const id = buf[i++], p = buf[i++], l = buf[i++];
            els[id].innerHTML = dec.decode(new Uint8Array(mem, p, l));
            break;
          }
          case OP_ADD_EVENT: {
            const id = buf[i++], ep = buf[i++], el = buf[i++], cb = buf[i++];
            const handler = () => inst.exports.__callback(cb);
            R.__callbacks[cb] = handler;
            els[id].addEventListener(dec.decode(new Uint8Array(mem, ep, el)), handler);
            break;
          }
          case OP_REMOVE_EVENT: {
            const id = buf[i++], ep = buf[i++], el = buf[i++], cb = buf[i++];
            els[id].removeEventListener(dec.decode(new Uint8Array(mem, ep, el)), R.__callbacks[cb]);
            break;
          }
          case OP_FOCUS: { els[buf[i++]].focus(); break; }
          case OP_BLUR: { els[buf[i++]].blur(); break; }
          case OP_SET_PROPERTY: {
            const id = buf[i++], pp = buf[i++], pl = buf[i++], vp = buf[i++], vl = buf[i++];
            els[id][dec.decode(new Uint8Array(mem, pp, pl))] = dec.decode(new Uint8Array(mem, vp, vl));
            break;
          }
          default:
            console.error('[nectar] unknown flush opcode:', op, 'at index', i - 1);
            return;
        }
      }
    },

    getElementById(ptr, len) { return R.__registerElement(document.getElementById(R.__getString(ptr, len))); },
    querySelector(ptr, len) { return R.__registerElement(document.querySelector(R.__getString(ptr, len))); },
    createElement(ptr, len) { return R.__registerElement(document.createElement(R.__getString(ptr, len))); },
    createTextNode(ptr, len) { return R.__registerElement(document.createTextNode(R.__getString(ptr, len))); },
    getBody() { return R.__registerElement(document.body); },
    getHead() { return R.__registerElement(document.head); },
    getRoot() { return R.__registerElement(document.getElementById('app') || document.body); },
    getDocumentElement() { return R.__registerElement(document.documentElement); },

    addEventListener(elId, evtPtr, evtLen, cbIdx) {
      const handler = (e) => {
        // Write event data to WASM memory if callback_with_event exists
        if (R.__instance.exports.__event_data_ptr) {
          const dv = new DataView(R.__memory.buffer);
          const base = R.__instance.exports.__event_data_ptr();
          dv.setFloat64(base, e.clientX || 0, true);
          dv.setFloat64(base + 8, e.clientY || 0, true);
          dv.setInt32(base + 16, e.keyCode || 0, true);
          dv.setInt32(base + 20, (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0), true);
          if (e.key) {
            const s = R.__allocStringWithLen(e.key);
            dv.setInt32(base + 24, s.ptr, true);
            dv.setInt32(base + 28, s.len, true);
          }
          if (e.dataTransfer) {
            R.__objects[0] = e; // stash event for getData/setData
          }
        }
        R.__cb(cbIdx);
      };
      R.__callbacks[cbIdx] = handler;
      R.__getElement(elId).addEventListener(R.__getString(evtPtr, evtLen), handler);
    },

    removeEventListener(elId, evtPtr, evtLen, cbIdx) {
      R.__getElement(elId).removeEventListener(R.__getString(evtPtr, evtLen), R.__callbacks[cbIdx]);
    },

    lazyMount(containerElId, urlPtr, urlLen, cbIdx) {
      const url = R.__getString(urlPtr, urlLen);
      import(url).then((mod) => {
        if (mod && mod.default) mod.default(R.__getElement(containerElId));
        R.__cb(cbIdx);
      });
    },

    setTitle(ptr, len) { document.title = R.__getString(ptr, len); },

    // Read-only DOM measurements (cannot go through flush — need return values)
    getScrollTop(elId) { return R.__getElement(elId).scrollTop; },
    getScrollLeft(elId) { return R.__getElement(elId).scrollLeft; },
    getClientHeight(elId) { return R.__getElement(elId).clientHeight; },
    getClientWidth(elId) { return R.__getElement(elId).clientWidth; },
    getWindowWidth() { return window.innerWidth; },
    getWindowHeight() { return window.innerHeight; },
    getOuterHtml() { return R.__allocString(document.documentElement.outerHTML); },

    // Drag data transfer (on stashed event)
    setDragData(fmtPtr, fmtLen, dataPtr, dataLen) {
      const e = R.__objects[0];
      if (e && e.dataTransfer) e.dataTransfer.setData(R.__getString(fmtPtr, fmtLen), R.__getString(dataPtr, dataLen));
    },
    getDragData(fmtPtr, fmtLen) {
      const e = R.__objects[0];
      if (e && e.dataTransfer) return R.__allocString(e.dataTransfer.getData(R.__getString(fmtPtr, fmtLen)));
      return 0;
    },
    preventDefault() {
      const e = R.__objects[0];
      if (e && e.preventDefault) e.preventDefault();
    },
  },

  // ── Memory read/write ────────────────────────────────────────────────────
  mem: {
    getString(ptr, len) { return R.__getString(ptr, len); },
    allocString(strPtr, strLen) { return R.__allocString(R.__getString(strPtr, strLen)); },
    readI32(ptr) { return new DataView(R.__memory.buffer).getInt32(ptr, true); },
    writeI32(ptr, val) { new DataView(R.__memory.buffer).setInt32(ptr, val, true); },
    readF64(ptr) { return new DataView(R.__memory.buffer).getFloat64(ptr, true); },
    writeF64(ptr, val) { new DataView(R.__memory.buffer).setFloat64(ptr, val, true); },
  },

  // ── Timers ───────────────────────────────────────────────────────────────
  timer: {
    setTimeout(cbIdx, ms) { return setTimeout(() => R.__cb(cbIdx), ms); },
    clearTimeout(id) { clearTimeout(id); },
    setInterval(cbIdx, ms) { return setInterval(() => R.__cb(cbIdx), ms); },
    clearInterval(id) { clearInterval(id); },
    requestAnimationFrame(cbIdx) { return requestAnimationFrame(() => R.__cb(cbIdx)); },
    cancelAnimationFrame(id) { cancelAnimationFrame(id); },
    now() { return performance.now(); },
  },

  // ── webapi — matches codegen.rs "webapi" namespace ───────────────────────
  webapi: {
    // Storage
    localStorageGet(kp, kl) { const v = localStorage.getItem(R.__getString(kp, kl)); return v !== null ? R.__allocString(v) : 0; },
    localStorageSet(kp, kl, vp, vl) { localStorage.setItem(R.__getString(kp, kl), R.__getString(vp, vl)); },
    localStorageRemove(kp, kl) { localStorage.removeItem(R.__getString(kp, kl)); },
    sessionStorageGet(kp, kl) { const v = sessionStorage.getItem(R.__getString(kp, kl)); return v !== null ? R.__allocString(v) : 0; },
    sessionStorageSet(kp, kl, vp, vl) { sessionStorage.setItem(R.__getString(kp, kl), R.__getString(vp, vl)); },
    // Clipboard
    clipboardWrite(ptr, len) { navigator.clipboard.writeText(R.__getString(ptr, len)).catch(() => {}); },
    clipboardRead(cbIdx) { navigator.clipboard.readText().then(t => { R.__cbData(cbIdx, R.__allocString(t)); }).catch(() => R.__cbData(cbIdx, 0)); },
    // Timers (alternate entry matching codegen)
    setTimeout(cbIdx, ms) { return setTimeout(() => R.__cb(cbIdx), ms); },
    setInterval(cbIdx, ms) { return setInterval(() => R.__cb(cbIdx), ms); },
    clearTimer(id) { clearTimeout(id); clearInterval(id); },
    // URL / History
    getLocationHref() { return R.__allocString(location.href); },
    getLocationSearch() { return R.__allocString(location.search); },
    getLocationHash() { return R.__allocString(location.hash); },
    pushState(urlPtr, urlLen) { history.pushState(null, '', R.__getString(urlPtr, urlLen)); },
    replaceState(urlPtr, urlLen) { history.replaceState(null, '', R.__getString(urlPtr, urlLen)); },
    // Console
    consoleLog(ptr, len) { console.log(R.__getString(ptr, len)); },
    consoleWarn(ptr, len) { console.warn(R.__getString(ptr, len)); },
    consoleError(ptr, len) { console.error(R.__getString(ptr, len)); },
    // Misc
    randomFloat() { return Math.random(); },
    now() { return performance.now(); },
    requestAnimationFrame(cbIdx) { return requestAnimationFrame(() => R.__cb(cbIdx)); },
  },

  // ── Navigation (kept for backward compat with older codegen paths) ──────
  nav: {
    pushState(urlPtr, urlLen) { history.pushState(null, '', R.__getString(urlPtr, urlLen)); },
    replaceState(urlPtr, urlLen) { history.replaceState(null, '', R.__getString(urlPtr, urlLen)); },
    getHref() { return R.__allocString(location.href); },
    getPathname() { return R.__allocString(location.pathname); },
    getSearch() { return R.__allocString(location.search); },
    getHash() { return R.__allocString(location.hash); },
    onPopState(cbIdx) { window.addEventListener('popstate', () => R.__cb(cbIdx)); },
    setHref(urlPtr, urlLen) { location.href = R.__getString(urlPtr, urlLen); },
  },

  // ── Console ──────────────────────────────────────────────────────────────
  console: {
    log(ptr, len) { console.log(R.__getString(ptr, len)); },
    warn(ptr, len) { console.warn(R.__getString(ptr, len)); },
    error(ptr, len) { console.error(R.__getString(ptr, len)); },
    debug(ptr, len) { console.debug(R.__getString(ptr, len)); },
  },

  // ── Network — fetch ──────────────────────────────────────────────────────
  net: {
    fetch(urlPtr, urlLen, optsPtr, optsLen) {
      const url = R.__getString(urlPtr, urlLen);
      const opts = optsLen > 0 ? JSON.parse(R.__getString(optsPtr, optsLen)) : {};
      return R.__registerObject(fetch(url, opts));
    },
  },

  // ── HTTP — matches codegen "http" namespace ──────────────────────────────
  http: {
    fetch(urlPtr, urlLen, optsPtr, optsLen) {
      const url = R.__getString(urlPtr, urlLen);
      const opts = optsLen > 0 ? JSON.parse(R.__getString(optsPtr, optsLen)) : {};
      return R.__registerObject(fetch(url, opts));
    },
    fetchGetBody(promiseId) {
      // Returns allocated string ptr after resolving
      return R.__getObject(promiseId);
    },
    fetchGetStatus(promiseId) {
      return R.__getObject(promiseId);
    },
  },

  // ── Observer — IntersectionObserver, matchMedia ──────────────────────────
  observe: {
    matchMedia(qPtr, qLen) { return matchMedia(R.__getString(qPtr, qLen)).matches ? 1 : 0; },
    intersectionObserver(cbIdx, optsPtr, optsLen) {
      const opts = optsLen > 0 ? JSON.parse(R.__getString(optsPtr, optsLen)) : {};
      return R.__registerObject(new IntersectionObserver(() => R.__cb(cbIdx), opts));
    },
    observe(obsId, elId) { R.__getObject(obsId).observe(R.__getElement(elId)); },
    unobserve(obsId, elId) { R.__getObject(obsId).unobserve(R.__getElement(elId)); },
    disconnect(obsId) { R.__getObject(obsId).disconnect(); },
  },

  // ── Share — navigator.share (browser API, cannot be WASM) ───────────────
  share: {
    canShare() { return navigator.share ? 1 : 0; },
    nativeShare(titlePtr, titleLen, textPtr, textLen, urlPtr, urlLen) {
      if (!navigator.share) return 0;
      navigator.share({
        title: R.__getString(titlePtr, titleLen),
        text: R.__getString(textPtr, textLen),
        url: R.__getString(urlPtr, urlLen),
      }).catch(() => {});
      return 1;
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  //  BROWSER APIs — things WASM physically cannot do
  // ════════════════════════════════════════════════════════════════════════════

  // ── WebSocket (codegen namespace: "channel") ─────────────────────────────
  channel: {
    connect(urlPtr, urlLen, onMsgCb, onCloseCb) {
      const ws = new WebSocket(R.__getString(urlPtr, urlLen));
      const id = R.__registerObject(ws);
      ws.addEventListener('message', (e) => {
        const ptr = R.__allocString(typeof e.data === 'string' ? e.data : '');
        R.__cbData(onMsgCb, ptr);
      });
      ws.addEventListener('close', () => R.__cb(onCloseCb));
      return id;
    },
    send(wsId, dataPtr, dataLen) { R.__getObject(wsId).send(R.__getString(dataPtr, dataLen)); },
    close(wsId) { R.__getObject(wsId).close(); },
    setReconnect(wsId, intervalMs, maxRetries) { /* reconnection logic lives in WASM */ },
  },

  // Also provide "ws" namespace for alternate codegen paths
  ws: {
    connect(urlPtr, urlLen) { return R.__registerObject(new WebSocket(R.__getString(urlPtr, urlLen))); },
    send(wsId, dataPtr, dataLen) { R.__getObject(wsId).send(R.__getString(dataPtr, dataLen)); },
    sendBinary(wsId, ptr, len) { R.__getObject(wsId).send(new Uint8Array(R.__memory.buffer, ptr, len)); },
    close(wsId) { R.__getObject(wsId).close(); },
    closeWithCode(wsId, code, rPtr, rLen) { R.__getObject(wsId).close(code, R.__getString(rPtr, rLen)); },
    onOpen(wsId, cbIdx) { R.__getObject(wsId).addEventListener('open', () => R.__cb(cbIdx)); },
    onMessage(wsId, cbIdx) { R.__getObject(wsId).addEventListener('message', (e) => R.__cbData(cbIdx, R.__allocString(e.data))); },
    onClose(wsId, cbIdx) { R.__getObject(wsId).addEventListener('close', () => R.__cb(cbIdx)); },
    onError(wsId, cbIdx) { R.__getObject(wsId).addEventListener('error', () => R.__cb(cbIdx)); },
    getReadyState(wsId) { return R.__getObject(wsId).readyState; },
  },

  // ── IndexedDB ────────────────────────────────────────────────────────────
  db: {
    open(namePtr, nameLen, version) {
      const name = R.__getString(namePtr, nameLen);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, version || 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('default')) db.createObjectStore('default', { keyPath: 'id' });
        };
        req.onsuccess = (e) => { resolve(R.__registerObject(e.target.result)); };
        req.onerror = () => reject(0);
      });
    },
    put(dbId, storePtr, storeLen, dataPtr, dataLen) {
      const db = R.__getObject(dbId);
      const store = R.__getString(storePtr, storeLen);
      const data = JSON.parse(R.__getString(dataPtr, dataLen));
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(data);
    },
    get(dbId, storePtr, storeLen, keyPtr, keyLen) {
      const db = R.__getObject(dbId);
      const store = R.__getString(storePtr, storeLen);
      const key = R.__getString(keyPtr, keyLen);
      return new Promise((resolve) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result ? R.__allocString(JSON.stringify(req.result)) : 0);
      });
    },
    delete(dbId, storePtr, storeLen, keyPtr, keyLen) {
      const db = R.__getObject(dbId);
      const store = R.__getString(storePtr, storeLen);
      const key = R.__getString(keyPtr, keyLen);
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
    },
    query(dbId, storePtr, storeLen) {
      const db = R.__getObject(dbId);
      const store = R.__getString(storePtr, storeLen);
      return new Promise((resolve) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(R.__allocString(JSON.stringify(req.result)));
      });
    },
  },

  // ── Clipboard ────────────────────────────────────────────────────────────
  clipboard: {
    copy(textPtr, textLen) {
      navigator.clipboard.writeText(R.__getString(textPtr, textLen)).catch(() => {});
      return 1;
    },
    paste(cbIdx) {
      navigator.clipboard.readText()
        .then(t => R.__cbData(cbIdx, R.__allocString(t)))
        .catch(() => R.__cbData(cbIdx, 0));
    },
    copyImage(dataPtr, dataLen) {
      if (typeof ClipboardItem === 'undefined') return 0;
      const data = R.__getString(dataPtr, dataLen);
      fetch(data).then(r => r.blob()).then(blob => {
        navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      }).catch(() => {});
      return 1;
    },
  },

  // ── Web Workers ──────────────────────────────────────────────────────────
  worker: {
    spawn(codePtr, codeLen) {
      const blob = new Blob([R.__getString(codePtr, codeLen)], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      return R.__registerObject(w);
    },
    channelCreate() {
      const { port1, port2 } = new MessageChannel();
      const id1 = R.__registerObject(port1);
      const id2 = R.__registerObject(port2);
      // Write both IDs — WASM reads them from a known memory location
      return id1; // WASM convention: port2 = id1 + 1
    },
    channelSend(portId, dataPtr, dataLen) {
      R.__getObject(portId).postMessage(R.__getString(dataPtr, dataLen));
    },
    channelRecv(portId, cbIdx) {
      const port = R.__getObject(portId);
      port.addEventListener('message', (e) => R.__cbData(cbIdx, R.__allocString(JSON.stringify(e.data))));
      port.start();
    },
    parallel(fnPtrsPtr, fnCount, cbIdx) { /* orchestration in WASM — this is the JS entry */ R.__cb(cbIdx); },
    await(promiseId) { return R.__getObject(promiseId); },
    postMessage(workerId, dataPtr, dataLen) { R.__getObject(workerId).postMessage(R.__getString(dataPtr, dataLen)); },
    onMessage(workerId, cbIdx) { R.__getObject(workerId).addEventListener('message', (e) => R.__cbData(cbIdx, R.__allocString(JSON.stringify(e.data)))); },
    terminate(workerId) { R.__getObject(workerId).terminate(); },
  },

  // ── PWA — Service Worker, Push, Caching ──────────────────────────────────
  pwa: {
    registerManifest(hrefPtr, hrefLen) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = R.__getString(hrefPtr, hrefLen);
      document.head.appendChild(link);
    },
    cachePrecache(namePtr, nameLen) {
      return caches.open(R.__getString(namePtr, nameLen));
    },
    setStrategy(namePtr, nameLen) { /* strategy selection lives in WASM */ },
    registerPush(optsPtr, optsLen) {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 0;
      return navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.subscribe(optsLen > 0 ? JSON.parse(R.__getString(optsPtr, optsLen)) : {})
      );
    },
    registerServiceWorker(pathPtr, pathLen, cbIdx) {
      if (!('serviceWorker' in navigator)) { R.__cb(cbIdx); return; }
      navigator.serviceWorker.register(R.__getString(pathPtr, pathLen)).then(() => R.__cb(cbIdx));
    },
  },

  // ── Hardware APIs ────────────────────────────────────────────────────────
  hardware: {
    haptic(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); },
    biometricAuth(optsPtr, optsLen, successCb, failCb) {
      if (!navigator.credentials) { R.__cb(failCb); return; }
      navigator.credentials.get(JSON.parse(R.__getString(optsPtr, optsLen)))
        .then(() => R.__cb(successCb))
        .catch(() => R.__cb(failCb));
    },
    cameraCapture(constraintsPtr, constraintsLen, cbIdx) {
      if (!navigator.mediaDevices) { R.__cb(cbIdx); return; }
      navigator.mediaDevices.getUserMedia(JSON.parse(R.__getString(constraintsPtr, constraintsLen)))
        .then(stream => { R.__cbData(cbIdx, R.__registerObject(stream)); });
    },
    geolocationCurrent(cbIdx) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const dv = new DataView(R.__memory.buffer);
          const base = R.__instance.exports.__geo_data_ptr ? R.__instance.exports.__geo_data_ptr() : 0;
          if (base) {
            dv.setFloat64(base, pos.coords.latitude, true);
            dv.setFloat64(base + 8, pos.coords.longitude, true);
          }
          R.__cb(cbIdx);
        },
        () => R.__cb(cbIdx)
      );
    },
  },

  // ── Gesture — pointer events for swipe/longpress/pinch ───────────────────
  gesture: {
    registerSwipe(elId, dirPtr, dirLen) {
      // Pointer events routed through dom.addEventListener; gesture recognition in WASM
    },
    registerLongPress(elId, ms, cbIdx) {
      let timer;
      const el = R.__getElement(elId);
      el.addEventListener('pointerdown', () => { timer = setTimeout(() => R.__cb(cbIdx), ms); });
      el.addEventListener('pointerup', () => clearTimeout(timer));
      el.addEventListener('pointerleave', () => clearTimeout(timer));
    },
    registerPinch(elId, cbIdx) {
      // Multi-touch tracking routed through dom.addEventListener; math in WASM
    },
  },

  // ── Payment — sandboxed iframe + postMessage ─────────────────────────────
  payment: {
    initProvider(namePtr, nameLen, keyPtr, keyLen, cbIdx) {
      // Provider init (Stripe, etc.) — loads external script
      const script = document.createElement('script');
      script.src = R.__getString(namePtr, nameLen);
      script.onload = () => R.__cb(cbIdx);
      document.head.appendChild(script);
    },
    createCheckout(optsPtr, optsLen, containerElId, cbIdx) {
      const iframe = document.createElement('iframe');
      iframe.sandbox = 'allow-scripts allow-forms allow-same-origin';
      iframe.style.cssText = 'border:none;width:100%;height:400px;';
      R.__getElement(containerElId).appendChild(iframe);
      return R.__registerObject(iframe);
    },
    processPayment(iframeId, cbIdx) {
      window.addEventListener('message', (e) => {
        R.__cbData(cbIdx, R.__allocString(JSON.stringify(e.data)));
      }, { once: true });
      R.__getObject(iframeId).contentWindow.postMessage({ action: 'process' }, '*');
    },
  },

  // ── Auth — redirect + cookies (browser-only APIs) ────────────────────────
  auth: {
    initAuth(providerPtr, providerLen, configPtr, configLen) { /* config stored in WASM */ },
    login(urlPtr, urlLen) { location.href = R.__getString(urlPtr, urlLen); },
    logout(urlPtr, urlLen) {
      document.cookie.split(';').forEach(c => {
        document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });
      if (urlPtr) location.href = R.__getString(urlPtr, urlLen);
    },
    getUser() {
      const match = document.cookie.match(/(?:^|; )nectar_user=([^;]*)/);
      return match ? R.__allocString(decodeURIComponent(match[1])) : 0;
    },
    isAuthenticated() {
      return document.cookie.includes('nectar_session=') ? 1 : 0;
    },
  },

  // ── Upload — file picker + XHR (browser APIs) ───────────────────────────
  upload: {
    init(acceptPtr, acceptLen, multiple, cbIdx) {
      const input = document.createElement('input');
      input.type = 'file';
      if (acceptPtr) input.accept = R.__getString(acceptPtr, acceptLen);
      if (multiple) input.multiple = true;
      input.addEventListener('change', () => {
        R.__registerObject(input.files);
        R.__cb(cbIdx);
      });
      input.click();
    },
    start(urlPtr, urlLen, cbIdx) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', R.__getString(urlPtr, urlLen));
      const id = R.__registerObject(xhr);
      xhr.upload.addEventListener('progress', (e) => {
        if (R.__instance.exports.__upload_progress) {
          R.__instance.exports.__upload_progress(id, e.loaded, e.total);
        }
      });
      xhr.addEventListener('load', () => R.__cbData(cbIdx, xhr.status));
      return id;
    },
    cancel(xhrId) { R.__getObject(xhrId).abort(); },
  },

  // ── PDF / IO — print + blob download ─────────────────────────────────────
  pdf: {
    create(htmlPtr, htmlLen, stylePtr, styleLen) {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(R.__getString(htmlPtr, htmlLen));
      if (stylePtr) {
        const style = doc.createElement('style');
        style.textContent = R.__getString(stylePtr, styleLen);
        doc.head.appendChild(style);
      }
      doc.close();
      return R.__registerObject(iframe);
    },
    render(iframeId, cbIdx) {
      const iframe = R.__getObject(iframeId);
      iframe.contentWindow.print();
      R.__cb(cbIdx);
    },
  },

  io: {
    download(dataPtr, dataLen, namePtr, nameLen) {
      const data = R.__getString(dataPtr, dataLen);
      const name = R.__getString(namePtr, nameLen);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
  },

  // ── Time — Intl.DateTimeFormat, timezone (browser locale APIs) ───────────
  time: {
    now() { return Date.now(); },
    format(ms, localePtr, localeLen) {
      const locale = R.__getString(localePtr, localeLen) || undefined;
      return R.__allocString(new Intl.DateTimeFormat(locale).format(new Date(ms)));
    },
    toZone(ms, zonePtr, zoneLen) {
      // Returns ms adjusted — but really Intl handles display, WASM handles arithmetic
      return ms; // timezone math is in WASM; this is a passthrough
    },
    addDuration(ms, durationMs) { return ms + durationMs; },
    getTimezoneOffset() { return new Date().getTimezoneOffset(); },
    formatDate(ms, localePtr, localeLen, optsPtr, optsLen) {
      const locale = localePtr ? R.__getString(localePtr, localeLen) : undefined;
      const opts = optsLen > 0 ? JSON.parse(R.__getString(optsPtr, optsLen)) : {};
      return R.__allocString(new Intl.DateTimeFormat(locale, opts).format(new Date(ms)));
    },
  },

  // ── Trace — performance.mark/measure (DevTools API) ──────────────────────
  trace: {
    start(namePtr, nameLen) {
      performance.mark(R.__getString(namePtr, nameLen) + ':start');
      return 1;
    },
    end(spanId) {
      performance.mark('span:end');
    },
    error(spanId, msgPtr, msgLen) {
      console.error('[trace]', R.__getString(msgPtr, msgLen));
    },
  },

  // ── Perf — raw performance API ───────────────────────────────────────────
  perf: {
    mark(namePtr, nameLen) { performance.mark(R.__getString(namePtr, nameLen)); },
    measure(namePtr, nameLen, startPtr, startLen, endPtr, endLen) {
      performance.measure(R.__getString(namePtr, nameLen), R.__getString(startPtr, startLen), R.__getString(endPtr, endLen));
    },
  },

  // ── SEO — document.title + meta/link/jsonld in <head> ───────────────────
  // These are DOM writes but target <head> which can't go through flush() nid system.
  // WASM doesn't have data-nid handles for <head> children. Minimal JS bridge.
  seo: {
    setMeta(typePtr, typeLen, namePtr, nameLen, valPtr, valLen, extraPtr, extraLen) {
      const name = R.__getString(namePtr, nameLen);
      const val = R.__getString(valPtr, valLen);
      let el = document.querySelector(`meta[name="${name}"],meta[property="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name); document.head.appendChild(el); }
      el.content = val;
    },
    registerStructuredData(jsonPtr, jsonLen) {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.textContent = R.__getString(jsonPtr, jsonLen);
      document.head.appendChild(el);
    },
    registerRoute(pathPtr, pathLen, titlePtr, titleLen) { /* route registry in WASM */ },
    emitStaticHtml(ptr, len) { return R.__allocString(document.documentElement.outerHTML); },
  },

  // ── Embed — script loading + sandboxed iframes ──────────────────────────
  embed: {
    loadScript(urlPtr, urlLen, attrsPtr, attrsLen, cbIdx) {
      const script = document.createElement('script');
      script.src = R.__getString(urlPtr, urlLen);
      script.onload = () => R.__cb(cbIdx);
      script.onerror = () => R.__cb(cbIdx);
      document.head.appendChild(script);
    },
    loadSandboxed(urlPtr, urlLen, sandboxPtr, sandboxLen) {
      const iframe = document.createElement('iframe');
      iframe.src = R.__getString(urlPtr, urlLen);
      iframe.sandbox = R.__getString(sandboxPtr, sandboxLen);
      document.body.appendChild(iframe);
      return R.__registerObject(iframe);
    },
  },

  // ── Loader — code splitting (dynamic script/link insertion) ──────────────
  loader: {
    loadChunk(urlPtr, urlLen) {
      const script = document.createElement('script');
      script.src = R.__getString(urlPtr, urlLen);
      document.head.appendChild(script);
      return R.__registerObject(new Promise((resolve) => { script.onload = resolve; }));
    },
    preloadChunk(urlPtr, urlLen) {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = R.__getString(urlPtr, urlLen);
      document.head.appendChild(link);
    },
  },

  // ── Responsive — matchMedia + window dimensions ─────────────────────────
  responsive: {
    registerBreakpoints(jsonPtr, jsonLen) { /* breakpoint logic in WASM, uses observe.matchMedia */ },
    getBreakpoint() { return window.innerWidth; },
  },

  // ── Theme — prefers-color-scheme + localStorage (browser APIs) ───────────
  theme: {
    init(lightPtr, lightLen, darkPtr, darkLen) {
      const stored = localStorage.getItem('nectar-theme');
      if (stored) document.documentElement.setAttribute('data-theme', stored);
    },
    toggle() {
      const curr = document.documentElement.getAttribute('data-theme');
      const next = curr === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('nectar-theme', next);
    },
    set(namePtr, nameLen) {
      const t = R.__getString(namePtr, nameLen);
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('nectar-theme', t);
    },
    getCurrent() {
      const t = localStorage.getItem('nectar-theme') ||
        (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
      return R.__allocString(t);
    },
  },

  // ── A11y — ARIA attributes + focus management ───────────────────────────
  // Most of this is SET_ATTR/FOCUS opcodes. Only announce() needs a live region.
  a11y: {
    setAriaAttribute(elId, namePtr, nameLen, valPtr, valLen) {
      R.__getElement(elId).setAttribute(R.__getString(namePtr, nameLen), R.__getString(valPtr, valLen));
    },
    setRole(elId, rolePtr, roleLen) {
      R.__getElement(elId).setAttribute('role', R.__getString(rolePtr, roleLen));
    },
    manageFocus(elId) { R.__getElement(elId).focus(); },
    announceToScreenReader(textPtr, textLen, modePtr) {
      let region = document.getElementById('nectar-a11y-live');
      if (!region) {
        region = document.createElement('div');
        region.id = 'nectar-a11y-live';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(region);
      }
      region.textContent = R.__getString(textPtr, textLen);
    },
    trapFocus(elId) {
      const container = R.__getElement(elId);
      const focusable = container.querySelectorAll('button,a,[tabindex],input,textarea,select');
      if (focusable.length) focusable[0].focus();
    },
    releaseFocusTrap() { /* WASM manages trap state */ },
    enhance(elId, configPtr) { /* auto-enhancement logic in WASM */ },
    checkContrast(fg, fgLen, bg, bgLen) { return 1; /* contrast math in WASM */ },
  },

  // ── Shortcuts — keyboard events (uses dom.addEventListener internally) ──
  shortcuts: {
    register(keyPtr, keyLen, modifiers, cbIdx) {
      const key = R.__getString(keyPtr, keyLen);
      document.addEventListener('keydown', (e) => {
        if (e.key !== key) return;
        const mods = (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
        if (mods === modifiers) { e.preventDefault(); R.__cb(cbIdx); }
      });
    },
    unregister(keyPtr, keyLen) { /* handler cleanup in WASM */ },
  },

  // ── Virtual list — scroll measurements (read-only DOM, needs JS) ────────
  virtual: {
    createList(containerElId, itemHeight, totalItems, renderCb, bufferSize) {
      // WASM manages virtual list state. JS just provides scroll/size measurements.
      return containerElId;
    },
    updateViewport(containerId, scrollTop, clientHeight) {
      // WASM calls this with measurements it got from dom.getScrollTop/getClientHeight
    },
    scrollTo(containerId, offset) {
      R.__getElement(containerId).scrollTop = offset;
    },
  },

  // ── Animate — spring/keyframes need rAF + DOM style writes ──────────────
  // rAF is in timer namespace, style writes are flush opcodes.
  // These are high-level entry points that codegen calls.
  animate: {
    spring(elId, configPtr, configLen, cbIdx) { /* spring math in WASM, applies via SET_STYLE opcodes */ R.__cb(cbIdx); },
    keyframes(elId, framesPtr, framesLen, cbIdx) {
      const el = R.__getElement(elId);
      const frames = JSON.parse(R.__getString(framesPtr, framesLen));
      el.animate(frames.keyframes, frames.options);
      R.__cb(cbIdx);
    },
    stagger(elsPtr, elsLen, configPtr, configLen) { /* stagger scheduling in WASM */ },
    cancel(elId) { R.__getElement(elId).getAnimations().forEach(a => a.cancel()); },
  },

  // ── Animation — CSS transitions/keyframes (codegen "animation" namespace)
  animation: {
    registerTransition(elId, propPtr, propLen, durPtr, durLen, easingPtr, easingLen, cbIdx) {
      const el = R.__getElement(elId);
      el.style.transition = `${R.__getString(propPtr, propLen)} ${R.__getString(durPtr, durLen)} ${R.__getString(easingPtr, easingLen)}`;
      el.addEventListener('transitionend', () => R.__cb(cbIdx), { once: true });
    },
    registerKeyframes(namePtr, nameLen, cssPtr, cssLen) {
      const style = document.createElement('style');
      style.textContent = `@keyframes ${R.__getString(namePtr, nameLen)} { ${R.__getString(cssPtr, cssLen)} }`;
      document.head.appendChild(style);
    },
    play(elId, namePtr, nameLen, durPtr, durLen) {
      R.__getElement(elId).style.animation = `${R.__getString(namePtr, nameLen)} ${R.__getString(durPtr, durLen)}`;
    },
    pause(elId) { R.__getElement(elId).style.animationPlayState = 'paused'; },
    cancel(elId) { R.__getElement(elId).style.animation = 'none'; },
    onFinish(elId, cbIdx) { R.__getElement(elId).addEventListener('animationend', () => R.__cb(cbIdx), { once: true }); },
  },

  // ── DnD — drag/drop (dataTransfer is browser API, can't be WASM) ────────
  dnd: {
    makeDraggable(elId, dataPtr, dataLen, cbIdx) {
      const el = R.__getElement(elId);
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', R.__getString(dataPtr, dataLen));
        R.__cb(cbIdx);
      });
    },
    makeDroppable(elId, overCb, leaveCb, dropCb) {
      const el = R.__getElement(elId);
      el.addEventListener('dragover', (e) => { e.preventDefault(); R.__cb(overCb); });
      el.addEventListener('dragleave', () => R.__cb(leaveCb));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        R.__objects[0] = e; // stash for getDragData
        R.__cb(dropCb);
      });
    },
    getData() { const e = R.__objects[0]; return e ? R.__allocString(e.dataTransfer.getData('text/plain')) : 0; },
    setData(dataPtr, dataLen) { /* set during dragstart */ },
  },

  // ── Flags — feature flags (network fetch, browser API) ──────────────────
  flags: {
    isEnabled(namePtr, nameLen) { return 0; /* flag evaluation in WASM, fetch in net */ },
  },

  // ── Cache — query caching (uses memory, but init may need network) ──────
  cache: {
    init(configPtr, configLen, strategyPtr, strategyLen) { /* cache logic in WASM */ },
    registerQuery(namePtr, nameLen, urlPtr, urlLen) { /* WASM manages cache entries */ },
    registerMutation(namePtr, nameLen, urlPtr, urlLen) { /* WASM manages invalidation */ },
    get(namePtr, nameLen, keyPtr, keyLen) { return 0; },
    invalidate(namePtr, nameLen) { /* WASM clears cache */ },
  },

  // ── Permissions — runtime permission checks ─────────────────────────────
  permissions: {
    checkNetwork(urlPtr, urlLen, methodPtr, methodLen) { return 1; /* enforcement in WASM */ },
    checkStorage(keyPtr, keyLen, opPtr, opLen) { return 1; },
    registerPermissions(compPtr, compLen, permsPtr, permsLen) { /* WASM stores permissions */ },
  },

  // ── Form — validation (WASM logic, JS just reads DOM values) ────────────
  form: {
    registerForm(idPtr, idLen, schemaPtr, schemaLen) { /* validation in WASM */ },
    validate(formId, dataPtr) { return 1; /* WASM validates */ },
    setFieldError(formId, fieldPtr, fieldLen, msgPtr, msgLen) {
      // Uses SET_ATTR / SET_TEXT opcodes — this is a convenience wrapper
    },
  },

  // ── State — atomic state (WASM SharedArrayBuffer ops) ───────────────────
  state: {
    atomicGet(ptr) { return Atomics.load(new Int32Array(R.__memory.buffer), ptr >> 2); },
    atomicSet(ptr, val) { Atomics.store(new Int32Array(R.__memory.buffer), ptr >> 2, val); },
    atomicCompareSwap(ptr, expected, desired) {
      return Atomics.compareExchange(new Int32Array(R.__memory.buffer), ptr >> 2, expected, desired);
    },
  },

  // ── Lifecycle — cleanup registration ────────────────────────────────────
  lifecycle: {
    registerCleanup(componentId, cbIdx) { /* WASM tracks cleanup callbacks */ },
  },

  // ── Contract — API boundary validation ──────────────────────────────────
  contract: {
    validate(schemaPtr, schemaLen, dataPtr, dataLen) { return 1; /* validation in WASM */ },
    registerSchema(namePtr, nameLen, schemaPtr, schemaLen, hashPtr, hashLen) { /* WASM stores */ },
    getHash(namePtr, nameLen) { return 0; },
  },

  // ── Env — environment variable access ───────────────────────────────────
  env: {
    get(namePtr, nameLen) {
      // In browser: check meta tag or window.__env
      const name = R.__getString(namePtr, nameLen);
      const val = (typeof window !== 'undefined' && window.__env && window.__env[name]) || '';
      return R.__allocString(val);
    },
  },

  // ── String runtime (codegen imports) ────────────────────────────────────
  string: {
    concat(aPtr, aLen, bPtr, bLen) { return R.__allocString(R.__getString(aPtr, aLen) + R.__getString(bPtr, bLen)); },
    fromI32(val) { return R.__allocString(String(val)); },
    fromF64(val) { return R.__allocString(String(val)); },
    fromBool(val) { return R.__allocString(val ? 'true' : 'false'); },
    toString(val) { return R.__allocString(String(val)); },
  },

  // ── Signal runtime (codegen imports — reactive graph) ───────────────────
  signal: {
    create(initialVal) { return 0; /* reactive graph in WASM */ },
    get(signalId) { return 0; },
    set(signalId, val) {},
    subscribe(signalId, cbIdx) {},
    createEffect(cbIdx) {},
    createMemo(cbIdx) { return 0; },
    batch(cbIdx) {},
  },

  // ── Router runtime ──────────────────────────────────────────────────────
  router: {
    init(configPtr, configLen) { window.addEventListener('popstate', () => R.__cb(0)); },
    navigate(urlPtr, urlLen) { history.pushState(null, '', R.__getString(urlPtr, urlLen)); },
    currentPath() { return R.__allocString(location.pathname); },
    getParam(namePtr, nameLen) {
      const params = new URLSearchParams(location.search);
      const val = params.get(R.__getString(namePtr, nameLen));
      return val ? R.__allocString(val) : 0;
    },
    registerRoute(pathPtr, pathLen, cbIdx) { /* route table in WASM */ },
  },

  // ── Style runtime — scoped CSS injection ────────────────────────────────
  style: {
    injectStyles(cssPtr, cssLen, scopePtr, scopeLen) {
      const style = document.createElement('style');
      style.textContent = R.__getString(cssPtr, cssLen);
      document.head.appendChild(style);
      return R.__registerObject(style);
    },
    applyScope(elId, scopePtr, scopeLen) {
      R.__getElement(elId).setAttribute('data-s', R.__getString(scopePtr, scopeLen));
    },
  },

  // ── Streaming — SSE + streaming fetch ───────────────────────────────────
  streaming: {
    streamFetch(urlPtr, urlLen, cbIdx) {
      fetch(R.__getString(urlPtr, urlLen)).then(res => {
        const reader = res.body.getReader();
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) { R.__cb(cbIdx); return; }
          const ptr = R.__allocString(new TextDecoder().decode(value));
          R.__cbData(cbIdx, ptr);
          pump();
        });
        pump();
      });
    },
    sseConnect(urlPtr, urlLen, cbIdx) {
      const es = new EventSource(R.__getString(urlPtr, urlLen));
      es.onmessage = (e) => R.__cbData(cbIdx, R.__allocString(e.data));
      return R.__registerObject(es);
    },
    wsConnect(urlPtr, urlLen, cbIdx) {
      const ws = new WebSocket(R.__getString(urlPtr, urlLen));
      ws.onmessage = (e) => R.__cbData(cbIdx, R.__allocString(e.data));
      return R.__registerObject(ws);
    },
    wsSend(wsId, dataPtr, dataLen) { R.__getObject(wsId).send(R.__getString(dataPtr, dataLen)); },
    wsClose(wsId) { R.__getObject(wsId).close(); },
    yield(streamId, dataPtr) { /* WASM manages stream state */ },
  },

  // ── Media — lazy loading, decode, preload (uses DOM + fetch) ────────────
  media: {
    lazyImage(elId, srcPtr, srcLen, placeholderPtr, placeholderLen) {
      const el = R.__getElement(elId);
      el.loading = 'lazy';
      el.src = R.__getString(srcPtr, srcLen);
    },
    decodeImage(srcPtr, srcLen, cbIdx) {
      const img = new Image();
      img.src = R.__getString(srcPtr, srcLen);
      img.decode().then(() => R.__cb(cbIdx)).catch(() => R.__cb(cbIdx));
    },
    preload(urlPtr, urlLen, asPtr, asLen) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = R.__getString(urlPtr, urlLen);
      link.as = R.__getString(asPtr, asLen);
      document.head.appendChild(link);
    },
    progressiveImage(elId, lowPtr, lowLen, highPtr, highLen) {
      const el = R.__getElement(elId);
      el.src = R.__getString(lowPtr, lowLen);
      const img = new Image();
      img.src = R.__getString(highPtr, highLen);
      img.onload = () => { el.src = img.src; };
    },
  },

  // ── AI — LLM interaction (fetch-based, uses streaming) ──────────────────
  ai: {
    chatStream(urlPt, urlLn, keyPt, keyLn, modelPt, modelLn, msgPt, msgLn, cbIdx) {
      // Streaming chat — uses streaming.streamFetch internally
    },
    chatComplete(urlPt, urlLn, keyPt, keyLn, cbIdx) { /* single response fetch */ },
    registerTool(namePt, nameLn, descPt, descLn, schemaPt, schemaLn, cbIdx) { /* tool registration in WASM */ },
    embed(textPt, textLn, cbIdx) { /* embedding via fetch */ },
    parseStructured(textPt, textLn, schemaPt, schemaLn) { return 0; /* parsing in WASM */ },
  },

  // ── Test runtime ────────────────────────────────────────────────────────
  test: {
    pass(namePtr, nameLen) { console.log(`✓ ${R.__getString(namePtr, nameLen)}`); },
    fail(namePtr, nameLen, msgPtr, msgLen) { console.error(`✗ ${R.__getString(namePtr, nameLen)}: ${R.__getString(msgPtr, msgLen)}`); },
    summary(passCount, failCount) { console.log(`Tests: ${passCount} passed, ${failCount} failed`); },
  },
};

// ── WASM instantiation helper ────────────────────────────────────────────────
export async function instantiate(wasmUrl, extraImports = {}) {
  const merged = {};
  for (const [ns, fns] of Object.entries(wasmImports)) {
    merged[ns] = { ...fns, ...(extraImports[ns] || {}) };
  }
  const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), merged);
  NectarRuntime.__init(instance);
  return instance;
}

// ══════════════════════════════════════════════════════════════════════════════
//  HYDRATION — attaches WASM interactivity to server-rendered HTML
// ══════════════════════════════════════════════════════════════════════════════

const __delegatedHandlers = new Map();
const DELEGATED_EVENTS = [
  'click', 'input', 'change', 'submit', 'keydown', 'keyup',
  'focus', 'blur', 'mousedown', 'mouseup', 'touchstart', 'touchend',
];

function __initEventDelegation(root) {
  for (const evt of DELEGATED_EVENTS) {
    root.addEventListener(evt, (e) => {
      let t = e.target;
      while (t && t !== root) {
        const key = t.getAttribute('data-nectar-key');
        if (key) {
          const h = __delegatedHandlers.get(key);
          if (h && h[evt]) { h[evt](e); return; }
        }
        t = t.parentElement;
      }
    });
  }
}

export function hydrate(wasmInstance, rootElement) {
  if (window.__NECTAR_STATE__ && wasmInstance.exports) {
    for (const [store, data] of Object.entries(window.__NECTAR_STATE__)) {
      const init = wasmInstance.exports[store + '_init'];
      if (typeof init === 'function') init(data);
    }
  }
  __initEventDelegation(rootElement);
  const roots = rootElement.querySelectorAll('[data-nectar-hydrate]');
  for (const el of roots) {
    const name = el.getAttribute('data-nectar-hydrate');
    const fn = wasmInstance.exports[name + '_hydrate'] || wasmInstance.exports[name + '_mount'];
    if (typeof fn === 'function') fn(NectarRuntime.__registerElement(el));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SERVICE WORKER REGISTRATION — browser API, cannot be WASM
// ══════════════════════════════════════════════════════════════════════════════

export const sw = {
  _reg: null,
  _updateAvailable: false,
  _listeners: { update: [], offline: [] },

  async register(swUrl) {
    if (!('serviceWorker' in navigator)) return null;
    try {
      this._reg = await navigator.serviceWorker.register(swUrl || '/nectar-sw.js');
      if (this._reg.waiting) { this._updateAvailable = true; this._listeners.update.forEach(f => f()); }
      this._reg.addEventListener('updatefound', () => {
        const nw = this._reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            this._updateAvailable = true;
            this._listeners.update.forEach(f => f());
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this._updateAvailable) window.location.reload();
      });
      return this._reg;
    } catch (e) { console.error('[nectar] SW registration failed:', e); return null; }
  },

  update() {
    if (this._reg && this._reg.waiting) this._reg.waiting.postMessage('nectar:skipWaiting');
    else if (this._reg) this._reg.update();
  },

  on(evt, cb) { if (this._listeners[evt]) this._listeners[evt].push(cb); },
  get isOffline() { return !navigator.onLine; },
  get updateAvailable() { return this._updateAvailable; },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sw._listeners.offline.forEach(f => f()));
  window.addEventListener('offline', () => sw._listeners.offline.forEach(f => f()));
}

// ══════════════════════════════════════════════════════════════════════════════
//  HOT RELOAD — dev-mode only, injected by `nectar dev` server
// ══════════════════════════════════════════════════════════════════════════════

export function connectHotReload(wsUrl) {
  let ws, reconnectDelay = 1000;

  function connect() {
    ws = new WebSocket(wsUrl || 'ws://localhost:3000');
    ws.onopen = () => { console.log('[nectar] hot reload connected'); reconnectDelay = 1000; };
    ws.onclose = () => { setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
    ws.onmessage = async (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'css') {
        // Hot-reload CSS by cache-busting link tags
        for (const file of (msg.files || [])) {
          const links = document.querySelectorAll('link[rel="stylesheet"]');
          const name = file.split('/').pop();
          for (const link of links) {
            if (link.href && link.href.includes(name)) {
              const url = new URL(link.href);
              url.searchParams.set('_r', Date.now());
              link.href = url.toString();
            }
          }
        }
        // Inject scoped styles
        for (const [scope, css] of Object.entries(msg.css || {})) {
          let el = document.querySelector(`style[data-nectar-scope="${scope}"]`);
          if (!el) { el = document.createElement('style'); el.setAttribute('data-nectar-scope', scope); document.head.appendChild(el); }
          el.textContent = css;
        }
      }

      if (msg.type === 'reload') {
        for (const file of (msg.files || [])) {
          if (file.endsWith('.css')) continue; // handled above
          try {
            const wasmUrl = '/' + file.split('/').pop().replace(/\.[^.]+$/, '') + '.wasm';
            const resp = await fetch(wasmUrl, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`${resp.status}`);
            const bytes = await resp.arrayBuffer();
            const mod = await WebAssembly.compile(bytes);
            const inst = await WebAssembly.instantiate(mod, wasmImports);
            NectarRuntime.__init(inst);
            if (inst.exports._start) inst.exports._start();
            else if (inst.exports.main) inst.exports.main();
            console.log('[nectar] reloaded:', file);
          } catch (err) { console.error('[nectar] reload failed:', file, err); }
        }
      }
    };
  }

  connect();
}

if (typeof module !== "undefined") module.exports = { name, runtime, wasmImports, NectarRuntime, instantiate, hydrate, sw, connectHotReload };
