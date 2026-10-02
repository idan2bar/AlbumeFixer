// Albume Editor Remove-All-Images Button
// The add/remove-photos modal only lets you remove one image at a time: hover
// a thumbnail to reveal its own delete icon, then click it. This adds a single
// button above the thumbnail grid that does that for every image in turn.
// Reuses sleep/makeButton from size-clipboard.js.

const REMOVE_ALL_CONFIG = {
  // Scoped to the add/remove-photos modal's own photo pool.
  LIST_SELECTOR: 'uploadwindow .photosList',
  // The row of upload-source buttons (computer, Facebook, Google Photos, ...)
  // in the modal's footer - our button joins that row instead of sitting
  // above the thumbnail grid, where it used to add extra height and cause a
  // second scrollbar.
  FOOTER_BUTTONS_SELECTOR: 'uploadwindow .globalFooter .leftAreaContent',
  THUMB_SELECTOR: '.image-thumb.mat-tooltip-trigger',
  // Albume uses one icon class for a thumb already placed in the album and
  // another for one still unused, depending on its hover toolbar.
  REMOVE_ICON_SELECTOR: '.icon_delete, .icon_trash',
  BUTTON_CLASS: 'albume-fixer-remove-all',
  // The hover toolbar (with the delete icon) only renders once Albume sees
  // real hover-like mouse events on the thumb, not a bare click.
  HOVER_SETTLE_MS: 80,
  REMOVE_GAP_MS: 100,
  // A thumb whose toolbar never appears after a few tries stops the loop
  // instead of spinning on it forever.
  MAX_STUCK_RETRIES: 3,
  STUCK_RETRY_MS: 150,
  CONFIRM_LABEL: 'לחץ שוב לאישור',
  CONFIRM_WINDOW_MS: 3000,
};

function dispatchHover(el) {
  const rect = el.getBoundingClientRect();
  const opts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  for (const type of ['pointerenter', 'pointerover', 'mouseenter', 'mouseover', 'mousemove']) {
    el.dispatchEvent(new MouseEvent(type, opts));
  }
}

function clickElement(el) {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

// Removing the pool's first thumb always reflows the rest up into its place,
// so re-querying for the first one each time needs no index tracking or
// scrolling even though the list is a virtual-scroller.
async function removeAllImages(button, resetLabel) {
  button.disabled = true;
  button.textContent = 'מסיר תמונות...';
  try {
    let stuck = 0;
    let thumb;
    while ((thumb = document.querySelector(
      `${REMOVE_ALL_CONFIG.LIST_SELECTOR} ${REMOVE_ALL_CONFIG.THUMB_SELECTOR}`
    ))) {
      dispatchHover(thumb);
      await sleep(REMOVE_ALL_CONFIG.HOVER_SETTLE_MS);
      const icon = thumb.querySelector(REMOVE_ALL_CONFIG.REMOVE_ICON_SELECTOR);
      if (!icon) {
        if (++stuck > REMOVE_ALL_CONFIG.MAX_STUCK_RETRIES) {
          console.warn('[AlbumeFixer] could not reveal a thumbnail\'s delete icon');
          break;
        }
        await sleep(REMOVE_ALL_CONFIG.STUCK_RETRY_MS);
        continue;
      }
      stuck = 0;
      clickElement(icon);
      await sleep(REMOVE_ALL_CONFIG.REMOVE_GAP_MS);
    }
  } finally {
    button.disabled = false;
    resetLabel();
  }
}

function makeRemoveAllButton() {
  let confirmTimer = null;
  const resetLabel = () => {
    button.textContent = 'הסר הכל';
  };
  const button = makeButton('הסר הכל', 'הסרת כל התמונות מהפרויקט', () => {
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      removeAllImages(button, resetLabel);
      return;
    }
    button.textContent = REMOVE_ALL_CONFIG.CONFIRM_LABEL;
    confirmTimer = setTimeout(() => {
      confirmTimer = null;
      resetLabel();
    }, REMOVE_ALL_CONFIG.CONFIRM_WINDOW_MS);
  });
  return button;
}

// The modal (and its photo pool) is torn down whenever it closes, taking our
// injected button with it, so there's nothing to clean up on close - only
// insertion needs to be (re-)done whenever the footer (re-)appears.
function ensureRemoveAllButton() {
  const footerButtons = document.querySelector(REMOVE_ALL_CONFIG.FOOTER_BUTTONS_SELECTOR);
  if (!footerButtons) return;
  if (footerButtons.querySelector(`.${REMOVE_ALL_CONFIG.BUTTON_CLASS}`)) return;
  const button = makeRemoveAllButton();
  button.classList.add(REMOVE_ALL_CONFIG.BUTTON_CLASS);
  button.style.margin = '0 12px';
  footerButtons.append(button);
}

let removeAllEnsureScheduled = false;
const removeAllObserver = new MutationObserver(() => {
  if (removeAllEnsureScheduled) return;
  removeAllEnsureScheduled = true;
  requestAnimationFrame(() => {
    removeAllEnsureScheduled = false;
    ensureRemoveAllButton();
  });
});

removeAllObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

ensureRemoveAllButton();
