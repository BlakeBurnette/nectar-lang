// runtime/modules/core.js — Pure syscall layer for DOM, memory, timers, navigation, console
// ALL logic (reactive graph, scheduling, routing, worker pools, agents) lives in Rust/WASM.

// Element registry — thin object pool for DOM references
const NectarRuntime = {
  __elements: [null], // index 0 = null sentinel
  __objects: [null],
  __callbacks: [],
  __memory: null,
  __instance: null,
  __decoder: new TextDecoder(),
  __encoder: new TextEncoder(),
  __registerElement(el) { if (!el) return 0; this.__elements.push(el); return this.__elements.length - 1; },
  __getElement(id) { return this.__elements[id]; },
  __registerObject(obj) { if (!obj) return 0; this.__objects.push(obj); return this.__objects.length - 1; },
  __getObject(id) { return this.__objects[id]; },
  __registerNodeList(nl) { const ids = []; for (let i = 0; i < nl.length; i++) ids.push(this.__registerElement(nl[i])); return ids; },
  __getString(ptr, len) { return this.__decoder.decode(new Uint8Array(this.__memory.buffer, ptr, len)); },
  __allocString(str) { const bytes = this.__encoder.encode(str); const ptr = this.__instance.exports.alloc(bytes.length); new Uint8Array(this.__memory.buffer, ptr, bytes.length).set(bytes); return ptr; },
  __init(instance) { this.__instance = instance; this.__memory = instance.exports.memory; },
};

export const name = 'core';
export const runtime = ``;
export const wasmImports = {
  dom: {
    createElement(tagPtr, tagLen) { return NectarRuntime.__registerElement(document.createElement(NectarRuntime.__getString(tagPtr, tagLen))); },
    createTextNode(textPtr, textLen) { return NectarRuntime.__registerElement(document.createTextNode(NectarRuntime.__getString(textPtr, textLen))); },
    setText(elId, textPtr, textLen) { NectarRuntime.__getElement(elId).textContent = NectarRuntime.__getString(textPtr, textLen); },
    appendChild(parentId, childId) { NectarRuntime.__getElement(parentId).appendChild(NectarRuntime.__getElement(childId)); },
    removeChild(parentId, childId) { NectarRuntime.__getElement(parentId).removeChild(NectarRuntime.__getElement(childId)); },
    setAttribute(elId, kPtr, kLen, vPtr, vLen) { NectarRuntime.__getElement(elId).setAttribute(NectarRuntime.__getString(kPtr, kLen), NectarRuntime.__getString(vPtr, vLen)); },
    removeAttribute(elId, kPtr, kLen) { NectarRuntime.__getElement(elId).removeAttribute(NectarRuntime.__getString(kPtr, kLen)); },
    addEventListener(elId, evtPtr, evtLen, cbIdx) { NectarRuntime.__getElement(elId).addEventListener(NectarRuntime.__getString(evtPtr, evtLen), () => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    removeEventListener(elId, evtPtr, evtLen, cbIdx) { NectarRuntime.__getElement(elId).removeEventListener(NectarRuntime.__getString(evtPtr, evtLen), NectarRuntime.__callbacks[cbIdx]); },
    getElementById(idPtr, idLen) { return NectarRuntime.__registerElement(document.getElementById(NectarRuntime.__getString(idPtr, idLen))); },
    querySelector(selPtr, selLen) { return NectarRuntime.__registerElement(document.querySelector(NectarRuntime.__getString(selPtr, selLen))); },
    querySelectorAll(selPtr, selLen) { return NectarRuntime.__registerNodeList(document.querySelectorAll(NectarRuntime.__getString(selPtr, selLen))); },
    insertBefore(parentId, newId, refId) { NectarRuntime.__getElement(parentId).insertBefore(NectarRuntime.__getElement(newId), NectarRuntime.__getElement(refId)); },
    replaceChild(parentId, newId, oldId) { NectarRuntime.__getElement(parentId).replaceChild(NectarRuntime.__getElement(newId), NectarRuntime.__getElement(oldId)); },
    setInnerHTML(elId, htmlPtr, htmlLen) { NectarRuntime.__getElement(elId).innerHTML = NectarRuntime.__getString(htmlPtr, htmlLen); },
    setStyle(elId, propPtr, propLen, valPtr, valLen) { NectarRuntime.__getElement(elId).style.setProperty(NectarRuntime.__getString(propPtr, propLen), NectarRuntime.__getString(valPtr, valLen)); },
    classAdd(elId, clsPtr, clsLen) { NectarRuntime.__getElement(elId).classList.add(NectarRuntime.__getString(clsPtr, clsLen)); },
    classRemove(elId, clsPtr, clsLen) { NectarRuntime.__getElement(elId).classList.remove(NectarRuntime.__getString(clsPtr, clsLen)); },
    classToggle(elId, clsPtr, clsLen) { NectarRuntime.__getElement(elId).classList.toggle(NectarRuntime.__getString(clsPtr, clsLen)); },
    getBody() { return NectarRuntime.__registerElement(document.body); },
    getHead() { return NectarRuntime.__registerElement(document.head); },
    getRoot() { return NectarRuntime.__registerElement(document.getElementById('app') || document.body); },
  },
  mem: {
    getString(ptr, len) { return NectarRuntime.__getString(ptr, len); },
    allocString(strPtr, strLen) { return NectarRuntime.__allocString(NectarRuntime.__getString(strPtr, strLen)); },
    readI32(ptr) { return new DataView(NectarRuntime.__memory.buffer).getInt32(ptr, true); },
    writeI32(ptr, val) { new DataView(NectarRuntime.__memory.buffer).setInt32(ptr, val, true); },
    readF64(ptr) { return new DataView(NectarRuntime.__memory.buffer).getFloat64(ptr, true); },
    writeF64(ptr, val) { new DataView(NectarRuntime.__memory.buffer).setFloat64(ptr, val, true); },
  },
  timer: {
    setTimeout(cbIdx, ms) { return setTimeout(() => NectarRuntime.__instance.exports.__callback(cbIdx), ms); },
    clearTimeout(id) { clearTimeout(id); },
    setInterval(cbIdx, ms) { return setInterval(() => NectarRuntime.__instance.exports.__callback(cbIdx), ms); },
    clearInterval(id) { clearInterval(id); },
    requestAnimationFrame(cbIdx) { return requestAnimationFrame(() => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    cancelAnimationFrame(id) { cancelAnimationFrame(id); },
    now() { return performance.now(); },
  },
  nav: {
    pushState(urlPtr, urlLen) { history.pushState(null, '', NectarRuntime.__getString(urlPtr, urlLen)); },
    replaceState(urlPtr, urlLen) { history.replaceState(null, '', NectarRuntime.__getString(urlPtr, urlLen)); },
    getHref() { return NectarRuntime.__allocString(location.href); },
    getPathname() { return NectarRuntime.__allocString(location.pathname); },
    getSearch() { return NectarRuntime.__allocString(location.search); },
    getHash() { return NectarRuntime.__allocString(location.hash); },
    onPopState(cbIdx) { window.addEventListener('popstate', () => NectarRuntime.__instance.exports.__callback(cbIdx)); },
    setHref(urlPtr, urlLen) { location.href = NectarRuntime.__getString(urlPtr, urlLen); },
  },
  console: {
    log(ptr, len) { console.log(NectarRuntime.__getString(ptr, len)); },
    warn(ptr, len) { console.warn(NectarRuntime.__getString(ptr, len)); },
    error(ptr, len) { console.error(NectarRuntime.__getString(ptr, len)); },
    debug(ptr, len) { console.debug(NectarRuntime.__getString(ptr, len)); },
  },
  net: {
    fetch(urlPtr, urlLen, optsPtr, optsLen) {
      const url = NectarRuntime.__getString(urlPtr, urlLen);
      const opts = optsLen > 0 ? JSON.parse(NectarRuntime.__getString(optsPtr, optsLen)) : {};
      const id = NectarRuntime.__registerObject(fetch(url, opts));
      return id;
    },
  },
  observe: {
    matchMedia(queryPtr, queryLen) { return matchMedia(NectarRuntime.__getString(queryPtr, queryLen)).matches ? 1 : 0; },
    intersectionObserver(cbIdx, optsPtr, optsLen) {
      const opts = optsLen > 0 ? JSON.parse(NectarRuntime.__getString(optsPtr, optsLen)) : {};
      const obs = new IntersectionObserver((entries) => NectarRuntime.__instance.exports.__callback(cbIdx), opts);
      return NectarRuntime.__registerObject(obs);
    },
    observe(obsId, elId) { NectarRuntime.__getObject(obsId).observe(NectarRuntime.__getElement(elId)); },
    unobserve(obsId, elId) { NectarRuntime.__getObject(obsId).unobserve(NectarRuntime.__getElement(elId)); },
    disconnect(obsId) { NectarRuntime.__getObject(obsId).disconnect(); },
  },
};

if (typeof module !== "undefined") module.exports = { name, runtime, wasmImports, NectarRuntime };
