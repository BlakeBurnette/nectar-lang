// runtime/modules/dnd.js — Drag and Drop runtime

const DndRuntime = {
  _dragData: null,
  _dragSource: null,

  makeDraggable(selectorPtr, selectorLen, dataPtr, dataLen) {
    const selector = readString(selectorPtr, selectorLen);
    const data = dataLen > 0 ? readString(dataPtr, dataLen) : null;
    document.querySelectorAll(selector).forEach(el => {
      el.draggable = true;
      el.style.cursor = 'grab';
      el.addEventListener('dragstart', (e) => {
        DndRuntime._dragData = data || el.textContent;
        DndRuntime._dragSource = el;
        el.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', DndRuntime._dragData);
      });
      el.addEventListener('dragend', () => {
        el.style.opacity = '1';
        el.style.cursor = 'grab';
        DndRuntime._dragData = null;
        DndRuntime._dragSource = null;
      });
    });
  },

  makeDroppable(selectorPtr, selectorLen, callbackPtr, callbackLen) {
    const selector = readString(selectorPtr, selectorLen);
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.style.outline = '2px dashed #e94560';
        e.dataTransfer.dropEffect = 'move';
      });
      el.addEventListener('dragleave', () => {
        el.style.outline = '';
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.outline = '';
        const data = e.dataTransfer.getData('text/plain');
        el.dispatchEvent(new CustomEvent('nectar-drop', { detail: { data, source: DndRuntime._dragSource } }));
      });
    });
  },

  getData() { return DndRuntime._dragData; },
  setData(dataPtr, dataLen) { DndRuntime._dragData = readString(dataPtr, dataLen); },
};

module.exports = {
  name: 'dnd',
  runtime: DndRuntime,
  wasmImports: {
    dnd: {
      makeDraggable: DndRuntime.makeDraggable,
      makeDroppable: DndRuntime.makeDroppable,
      getData: DndRuntime.getData,
      setData: DndRuntime.setData,
    }
  }
};
