// Albume Editor Canvas Bridge
// Runs in the page's own JS world (manifest "world": "MAIN") because the
// editor's fabric.js canvas is not reachable from the isolated content-script
// world. It remembers the order images were selected in and lets multi-align.js
// select images one by one (and re-select them all) through request events.

(() => {
  const BRIDGE_CONFIG = {
    REQUEST_EVENT: 'albume-fixer:request',
    RESPONSE_EVENT: 'albume-fixer:response',
    FABRIC_POLL_MS: 250,
  };

  // Interactive canvases seen so far (thumbnails are StaticCanvas and never
  // get here). Captured from fabric's own mouse/render calls.
  const canvases = new Set();
  // Objects in the order the user selected them; fabric's own group order is
  // z-order, which loses which image was clicked first.
  let selectionOrder = [];
  // The canvas + ordered images of the last "capture" request.
  let session = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const selectableObjects = (canvas) =>
    canvas.getObjects().filter((o) => o.selectable !== false && o.visible);

  // Topmost selectable object under the pointer (what a click would hit).
  function objectAt(canvas, point) {
    const objects = selectableObjects(canvas);
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].containsPoint(point)) return objects[i];
    }
    return null;
  }

  function trackMouseDown(canvas, event) {
    const group = canvas.getActiveGroup();
    const active = canvas.getActiveObject();
    const target = objectAt(canvas, canvas.getPointer(event));
    if (event.shiftKey) {
      if (!target) return;
      // Selection made without a tracked click (e.g. programmatically).
      if (!selectionOrder.length && active) selectionOrder = [active];
      selectionOrder = selectionOrder.includes(target)
        ? selectionOrder.filter((o) => o !== target)
        : [...selectionOrder, target];
    } else if (!(group && target && group.contains(target))) {
      selectionOrder = target ? [target] : [];
    }
  }

  // Currently selected objects, in click order (z-order for untracked ones).
  function selectedInOrder(canvas) {
    const group = canvas.getActiveGroup();
    const active = canvas.getActiveObject();
    const selected = group ? group.getObjects() : active ? [active] : [];
    return [
      ...selectionOrder.filter((o) => selected.includes(o)),
      ...selected.filter((o) => !selectionOrder.includes(o)),
    ];
  }

  function hook() {
    const proto = fabric.Canvas.prototype;
    const originalMouseDown = proto.__onMouseDown;
    proto.__onMouseDown = function (event) {
      canvases.add(this);
      trackMouseDown(this, event);
      return originalMouseDown.call(this, event);
    };
    const originalRenderAll = proto.renderAll;
    proto.renderAll = function (...args) {
      canvases.add(this);
      return originalRenderAll.apply(this, args);
    };
  }

  const pollForFabric = setInterval(() => {
    if (!window.fabric?.Canvas?.prototype?.__onMouseDown) return;
    clearInterval(pollForFabric);
    hook();
  }, BRIDGE_CONFIG.FABRIC_POLL_MS);

  // A point on `object` that a click would really hit (not covered by a
  // higher object), or null when it is completely covered.
  function clickablePoint(canvas, object) {
    object.setCoords();
    const box = object.getBoundingRect();
    const fractions = [0.5, 0.3, 0.7, 0.15, 0.85];
    for (const fx of fractions) {
      for (const fy of fractions) {
        const point = new fabric.Point(
          box.left + box.width * fx,
          box.top + box.height * fy
        );
        if (objectAt(canvas, point) === object) return point;
      }
    }
    return null;
  }

  function fireMouse(canvas, target, type, point, shiftKey) {
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        shiftKey,
        clientX: rect.left + (point.x * rect.width) / canvas.width,
        clientY: rect.top + (point.y * rect.height) / canvas.height,
      })
    );
  }

  const OPERATIONS = {
    // Remember the multi-selection; resolves to how many images it holds.
    capture() {
      session = null;
      for (const canvas of canvases) {
        if (typeof canvas.getActiveGroup !== 'function') continue;
        const objects = selectedInOrder(canvas);
        if (objects.length >= 2) {
          session = { canvas, objects };
          break;
        }
      }
      return session ? session.objects.length : 0;
    },

    // Select just the index-th captured image (Albume's panel then shows its
    // own size/position fields).
    selectOne({ index }) {
      const { canvas, objects } = session;
      if (canvas.getActiveGroup()) canvas.discardActiveGroup();
      canvas.setActiveObject(objects[index]);
      canvas.renderAll();
      return true;
    },

    // Canvas-pixel bounding boxes of the captured images, in capture order.
    // Only meaningful while no group is active (group children use group-relative
    // coordinates), so call it after selectOne.
    boxes() {
      return session.objects.map((object) => {
        object.setCoords();
        const { left, top, width, height } = object.getBoundingRect();
        return { left, top, width, height };
      });
    },

    // Re-select every captured image with the same shift-clicks a user would
    // make, so Albume builds its normal multi-selection.
    async selectAll() {
      const { canvas, objects } = session;
      if (canvas.getActiveGroup()) canvas.discardActiveGroup();
      canvas.discardActiveObject();
      canvas.setActiveObject(objects[0]);
      canvas.renderAll();
      const points = objects.slice(1).map((o) => clickablePoint(canvas, o));
      if (points.some((p) => !p)) return false;
      for (const point of points) {
        await sleep(50);
        fireMouse(canvas, canvas.upperCanvasEl, 'mousedown', point, true);
        fireMouse(canvas, document, 'mouseup', point, true);
      }
      return true;
    },
  };

  document.addEventListener(BRIDGE_CONFIG.REQUEST_EVENT, async (event) => {
    const { id, op, args } = JSON.parse(event.detail);
    let result = null;
    try {
      result = await OPERATIONS[op](args);
    } catch (error) {
      console.warn('[AlbumeFixer] canvas bridge failed:', op, error);
    }
    document.dispatchEvent(
      new CustomEvent(BRIDGE_CONFIG.RESPONSE_EVENT, {
        detail: JSON.stringify({ id, result }),
      })
    );
  });
})();
