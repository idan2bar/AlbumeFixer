// Albume Editor Scroll Memory
// Remembers the scroll position of the image selection panel and re-applies
// it every time the panel re-appears (Albume resets it to the top on render).

const CONFIG = {
  // The left-bar image selection list: an Angular virtual-scroller that
  // gets torn down and rebuilt (resetting scrollTop) whenever it re-appears.
  PANEL_SELECTOR: '.lbphotosList virtual-scroller.selfScroll',
  SAVE_DEBOUNCE_MS: 150,
  // Virtual-scroller sizes its content (.total-padding scaleY) asynchronously
  // after appearing, so retry the restore over a few frames.
  RESTORE_RETRY_FRAMES: 10,
};

// Keyed by the full URL so different albums/projects (often encoded in the
// path or query string) don't share a saved scroll position.
const storageKey = () => `scrollPos:${location.href}`;

let saveTimer = null;
function scheduleSave(panel) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ [storageKey()]: panel.scrollTop });
  }, CONFIG.SAVE_DEBOUNCE_MS);
}

function restoreScrollOnce(panel, saved) {
  if (panel.scrollTop !== saved) {
    panel.scrollTop = saved;
  }
}

function restoreScroll(panel) {
  chrome.storage.local.get(storageKey(), (result) => {
    const saved = result[storageKey()];
    if (typeof saved !== 'number') return;

    // Retry across several frames: the virtual-scroller's content height
    // (.total-padding scaleY) can still be growing right after it appears,
    // which would otherwise clamp scrollTop back toward 0.
    let framesLeft = CONFIG.RESTORE_RETRY_FRAMES;
    const tick = () => {
      restoreScrollOnce(panel, saved);
      if (--framesLeft > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// A panel can "re-appear" either as a brand new DOM node (component
// destroyed/recreated) or as the same node toggling visibility. Attach the
// scroll listener only once per node, but restore every time we see it.
const listenerAttached = new WeakSet();
function trackPanel(panel) {
  if (!listenerAttached.has(panel)) {
    listenerAttached.add(panel);
    panel.addEventListener('scroll', () => scheduleSave(panel), { passive: true });
  }
  restoreScroll(panel);
}

function scan(root = document) {
  root.querySelectorAll?.(CONFIG.PANEL_SELECTOR).forEach(trackPanel);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.(CONFIG.PANEL_SELECTOR)) trackPanel(node);
      scan(node);
    }
    // Panel may already exist in the DOM and merely toggle visibility
    // (e.g. style/class change) instead of being added/removed.
    if (mutation.type === 'attributes' && mutation.target instanceof Element) {
      if (mutation.target.matches?.(CONFIG.PANEL_SELECTOR)) {
        trackPanel(mutation.target);
      }
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style', 'class'],
});

scan();
