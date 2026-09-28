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

The copy / paste buttons are hidden while several images are selected.

## Align row / column (multi-select)

With several images selected, two buttons (יישור שורה / יישור עמודה) appear
above Albume's alignment options. They give every selected image the width
and height of the first one you selected, then press Albume's built-in
align (vertical-center for a row, horizontal-center for a column) and
distribute buttons. Since resizing keeps an image's top-left corner fixed,
the rightmost image (row) or bottom image (column) is also repositioned so
the row/column keeps its far edge. Implemented in `multi-align.js`.

Albume's canvas (fabric.js) isn't reachable from the extension's isolated
content-script world, so `canvas-bridge.js` runs in the page's own world
(`"world": "MAIN"`). It tracks the order images were selected in and selects
images one at a time / re-selects them all; the two scripts talk through
`CustomEvent`s on `document`.

## Remove all images

In the add/remove-images modal, a "הסר הכל" button appears above the photo
grid. Albume only lets you remove one image at a time (hover a thumbnail,
click its own delete icon), so this button does that for every image in
turn: it hovers the first thumbnail to reveal its delete icon, clicks it,
and repeats until the pool is empty. A first click arms it ("לחץ שוב
לאישור"); a second click within 3 seconds runs it. Implemented in
`remove-all.js`.

## How the scroll memory works

The image selection panel is an Angular virtual-scroller
(`.lbphotosList virtual-scroller.selfScroll`) that gets torn down and
rebuilt (or has its visibility toggled) each time it re-appears, resetting
`scrollTop` to 0. `content.js` uses a `MutationObserver` to detect the panel
appearing, saves its scroll position (debounced) to `chrome.storage.local`
keyed by the current URL, and re-applies it over the next few animation
frames once the panel re-appears.
