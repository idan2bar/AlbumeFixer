// Albume Editor Size Clipboard
// Adds "copy" / "paste" buttons under the size (width x height, cm) fields of
// the selected image, so one image's size can be copied and applied to another.

const SIZE_CONFIG = {
  // Row holding the size ("גודל") inputs; the position ("מיקום") row is a
  // separate .position sibling, so this only matches the size inputs.
  SIZE_ROW_SELECTOR: '.objectPropsActionsGroupDims .dimensions',
  SIZE_INPUT_SELECTOR: 'input.inputsDimsPos',
  BUTTONS_CLASS: 'albume-fixer-size-buttons',
  STORAGE_KEY: 'copiedSize',
  // Delay between committing width and height, so Angular can finish
  // re-rendering the inputs after the first change.
  COMMIT_GAP_MS: 150,
};

const getSizeInputs = () => [
  ...document.querySelectorAll(
    `${SIZE_CONFIG.SIZE_ROW_SELECTOR} ${SIZE_CONFIG.SIZE_INPUT_SELECTOR}`
  ),
];

// Angular Material inputs ignore a plain `.value = x`: use the native setter,
// fire `input`, then Enter/change/blur, which is what makes Albume apply it.
const nativeValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
).set;

function commitValue(input, value) {
  input.focus();
  nativeValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (const type of ['keydown', 'keypress', 'keyup']) {
    input.dispatchEvent(
      new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isNumber = (value) => /^\d+(\.\d+)?$/.test(value);

function copySize(pasteButton) {
  const [width, height] = getSizeInputs().map((input) => input.value.trim());
  if (!isNumber(width) || !isNumber(height)) return;
  chrome.storage.local.set({ [SIZE_CONFIG.STORAGE_KEY]: { width, height } });
  pasteButton.disabled = false;
}

function pasteSize() {
  chrome.storage.local.get(SIZE_CONFIG.STORAGE_KEY, async (result) => {
    const size = result[SIZE_CONFIG.STORAGE_KEY];
    if (!size) return;
    const [width] = getSizeInputs();
    if (!width) return;
    commitValue(width, size.width);
    await sleep(SIZE_CONFIG.COMMIT_GAP_MS);
    // Re-query: the inputs may have been re-rendered after the width change.
    const [, height] = getSizeInputs();
    if (height) commitValue(height, size.height);
  });
}

function makeButton(label, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.style.cssText =
    'padding:2px 10px;border:1px solid #8bb9ae;border-radius:4px;' +
    'background:#fff;color:#2c7a68;font-size:12px;cursor:pointer;';
  // Keep focus/selection where it is so clicking doesn't deselect the image.
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', onClick);
  return button;
}

function createButtons() {
  const wrapper = document.createElement('div');
  wrapper.className = SIZE_CONFIG.BUTTONS_CLASS;
  wrapper.style.cssText =
    'display:flex;justify-content:center;gap:8px;margin:2px 0 4px;';

  const pasteButton = makeButton('הדבק', 'הדבק גודל (רוחב וגובה)', pasteSize);
  const copyButton = makeButton('העתק', 'העתק גודל (רוחב וגובה)', () =>
    copySize(pasteButton)
  );
  pasteButton.disabled = true;
  pasteButton.style.opacity = '0.5';
  chrome.storage.local.get(SIZE_CONFIG.STORAGE_KEY, (result) => {
    pasteButton.disabled = !result[SIZE_CONFIG.STORAGE_KEY];
    pasteButton.style.opacity = pasteButton.disabled ? '0.5' : '1';
  });
  // Mirror enabled state whenever a size is copied (also from another tab).
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes[SIZE_CONFIG.STORAGE_KEY]) return;
    pasteButton.disabled = !changes[SIZE_CONFIG.STORAGE_KEY].newValue;
    pasteButton.style.opacity = pasteButton.disabled ? '0.5' : '1';
  });

  wrapper.append(pasteButton, copyButton);
  return wrapper;
}

// Angular re-renders the properties panel whenever selection changes, so make
// sure the buttons exist right after the size row every time it appears.
function ensureButtons() {
  const row = document.querySelector(SIZE_CONFIG.SIZE_ROW_SELECTOR);
  if (!row) return;
  const next = row.nextElementSibling;
  if (next?.classList.contains(SIZE_CONFIG.BUTTONS_CLASS)) return;
  row.after(createButtons());
}

let ensureScheduled = false;
const sizeObserver = new MutationObserver(() => {
  if (ensureScheduled) return;
  ensureScheduled = true;
  requestAnimationFrame(() => {
    ensureScheduled = false;
    ensureButtons();
  });
});

sizeObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

ensureButtons();
