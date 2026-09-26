# Albume Fixer

Chrome extension that remembers the scroll position of the image selection
panel on https://editor.albume.co.il/ and restores it every time the panel
re-appears, instead of letting it reset to the top.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this folder.
4. Open the Albume editor and scroll the image selection panel — the
   position should now survive the panel re-rendering.

## Size copy / paste

When an image is selected, two buttons (העתק / הדבק) appear below the size
("גודל") width x height fields. Copy remembers both values; Paste applies both
to the currently selected image. The copied size is kept in
`chrome.storage.local`, so it survives page reloads. Implemented in
`size-clipboard.js`.

## How the scroll memory works

The image selection panel is an Angular virtual-scroller
(`.lbphotosList virtual-scroller.selfScroll`) that gets torn down and
rebuilt (or has its visibility toggled) each time it re-appears, resetting
`scrollTop` to 0. `content.js` uses a `MutationObserver` to detect the panel
appearing, saves its scroll position (debounced) to `chrome.storage.local`
keyed by the current URL, and re-applies it over the next few animation
frames once the panel re-appears.
