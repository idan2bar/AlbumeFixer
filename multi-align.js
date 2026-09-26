// Albume Editor Multi-Select Row / Column Alignment
// With several images selected, adds "align row" / "align column" buttons above
// Albume's own alignment options. They give every selected image the size of the
// first selected one, then press Albume's built-in align and distribute buttons.
// Reuses commitValue/sleep/makeButton/getSizeInputs from size-clipboard.js.

const ALIGN_CONFIG = {
  // Albume's alignment section, shown only while several images are selected.
  GROUP_SELECTOR: 'rbar-group-component',
  POSITION_INPUT_SELECTOR:
    '.objectPropsActionsGroupDims .position input.inputsDimsPos',
  BUTTONS_CLASS: 'albume-fixer-align-buttons',
  // Albume's own buttons (by icon class) per axis: put every image on one line,
  // then space them evenly along it.
  BUILT_IN_ICONS: {
    row: ['icon_alignvcenter', 'icon_distributecenter'],
    column: ['icon_alignhcenter', 'icon_distributemiddle'],
  },
  REQUEST_EVENT: 'albume-fixer:request',
  RESPONSE_EVENT: 'albume-fixer:response',
  BRIDGE_TIMEOUT_MS: 3000,
  // Albume updates the panel asynchronously after the selection changes.
  PANEL_POLL_MS: 30,
  PANEL_TIMEOUT_MS: 500,
  PANEL_SETTLE_MS: 50,
  BUILT_IN_GAP_MS: 150,
};

let bridgeRequestId = 0;
function askBridge(op, args) {
  const id = ++bridgeRequestId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), ALIGN_CONFIG.BRIDGE_TIMEOUT_MS);
    const onResponse = (event) => {
      const response = JSON.parse(event.detail);
      if (response.id === id) finish(response.result);
    };
    function finish(result) {
      clearTimeout(timer);
      document.removeEventListener(ALIGN_CONFIG.RESPONSE_EVENT, onResponse);
      resolve(result);
    }
    document.addEventListener(ALIGN_CONFIG.RESPONSE_EVENT, onResponse);
    document.dispatchEvent(
      new CustomEvent(ALIGN_CONFIG.REQUEST_EVENT, {
        detail: JSON.stringify({ id, op, args }),
      })
    );
  });
}

const getPositionInputs = () => [
  ...document.querySelectorAll(ALIGN_CONFIG.POSITION_INPUT_SELECTOR),
];

// Size and position of the single selected image, in cm.
function readGeometry() {
  const [w, h] = getSizeInputs().map((input) => parseFloat(input.value));
  const [x, y] = getPositionInputs().map((input) => parseFloat(input.value));
  return { x, y, w, h };
}

const geometryKey = (g) => `${g.x}|${g.y}|${g.w}|${g.h}`;

// Wait until the panel's geometry satisfies `isReady` (it still shows the
// previously selected image right after the selection changes), then return it.
async function waitForPanel(isReady) {
  const deadline = Date.now() + ALIGN_CONFIG.PANEL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const geometry = readGeometry();
    if (Object.values(geometry).every(Number.isFinite) && isReady(geometry)) {
      break;
    }
    await sleep(ALIGN_CONFIG.PANEL_POLL_MS);
  }
  await sleep(ALIGN_CONFIG.PANEL_SETTLE_MS);
  return readGeometry();
}

// Commit each changed field in turn, re-querying because Angular may re-render
// the inputs after every change (same reasoning as pasteSize).
async function applyFields(fields) {
  for (const [getInputs, index, value] of fields) {
    const input = getInputs()[index];
    if (input) commitValue(input, value.toFixed(2));
    await sleep(SIZE_CONFIG.COMMIT_GAP_MS);
  }
}

// Index of the image that ends furthest along the axis (right edge for a row,
// bottom edge for a column). Resizing keeps an image's top-left corner fixed,
// and Albume's distribute keeps the outermost images in place, so this is the
// one image whose position must be corrected to keep the row/column's far edge.
function farthestIndex(boxes, axis) {
  const end = (box) =>
    axis === 'row' ? box.left + box.width : box.top + box.height;
  return boxes.reduce(
    (best, box, i) => (end(box) > end(boxes[best]) ? i : best),
    0
  );
}

function clickBuiltIn(iconClass) {
  document
    .querySelector(`${ALIGN_CONFIG.GROUP_SELECTOR} .${iconClass}`)
    ?.click();
}

let aligning = false;
async function alignSelection(axis, buttons) {
  if (aligning) return;
  aligning = true;
  buttons.forEach((button) => (button.disabled = true));
  try {
    const count = await askBridge('capture');
    if (!count) {
      console.warn('[AlbumeFixer] could not find the selected images');
      return;
    }

    // Image 0 is the first one selected: its size is the target size.
    await askBridge('selectOne', { index: 0 });
    const reference = await waitForPanel(() => true);
    const farthest = farthestIndex(await askBridge('boxes'), axis);

    let previousKey = geometryKey(reference);
    for (let index = 1; index < count; index++) {
      await askBridge('selectOne', { index });
      const before = await waitForPanel((g) => geometryKey(g) !== previousKey);

      const fields = [];
      if (before.w !== reference.w) fields.push([getSizeInputs, 0, reference.w]);
      if (before.h !== reference.h) fields.push([getSizeInputs, 1, reference.h]);
      if (index === farthest) {
        fields.push(
          axis === 'row'
            ? [getPositionInputs, 0, before.x + before.w - reference.w]
            : [getPositionInputs, 1, before.y + before.h - reference.h]
        );
      }
      await applyFields(fields);
      previousKey = geometryKey(readGeometry());
    }

    await askBridge('selectAll');
    // The alignment section re-appears once the multi-selection is back.
    for (const iconClass of ALIGN_CONFIG.BUILT_IN_ICONS[axis]) {
      await sleep(ALIGN_CONFIG.BUILT_IN_GAP_MS);
      clickBuiltIn(iconClass);
    }
  } finally {
    aligning = false;
    buttons.forEach((button) => (button.disabled = false));
  }
}

function createAlignButtons() {
  const wrapper = document.createElement('div');
  wrapper.className = ALIGN_CONFIG.BUTTONS_CLASS;
  wrapper.style.cssText =
    'display:flex;justify-content:center;gap:8px;margin:8px 0;';
  const buttons = [];
  const rowButton = makeButton(
    'יישור שורה',
    'אותו גודל לכל התמונות (לפי הראשונה שנבחרה), ביישור אופקי ובמרווחים שווים',
    () => alignSelection('row', buttons)
  );
  const columnButton = makeButton(
    'יישור עמודה',
    'אותו גודל לכל התמונות (לפי הראשונה שנבחרה), ביישור אנכי ובמרווחים שווים',
    () => alignSelection('column', buttons)
  );
  buttons.push(rowButton, columnButton);
  wrapper.append(rowButton, columnButton);
  return wrapper;
}

// The alignment section only exists in multi-select mode, and Angular
// re-renders the panel on every selection change, so re-check on each mutation.
function ensureAlignButtons() {
  const group = document.querySelector(ALIGN_CONFIG.GROUP_SELECTOR);
  if (!group) {
    document
      .querySelectorAll(`.${ALIGN_CONFIG.BUTTONS_CLASS}`)
      .forEach((buttons) => buttons.remove());
    return;
  }
  const previous = group.previousElementSibling;
  if (previous?.classList.contains(ALIGN_CONFIG.BUTTONS_CLASS)) return;
  group.before(createAlignButtons());
}

let alignEnsureScheduled = false;
const alignObserver = new MutationObserver(() => {
  if (alignEnsureScheduled) return;
  alignEnsureScheduled = true;
  requestAnimationFrame(() => {
    alignEnsureScheduled = false;
    ensureAlignButtons();
  });
});

alignObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

ensureAlignButtons();
