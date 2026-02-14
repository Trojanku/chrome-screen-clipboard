# chrome-screen-clipboard

Chrome extension (Manifest V3) to:

1. Capture the current visible tab as a screenshot.
2. Draw annotations on top of it.
3. Copy the final annotated image to your clipboard.

## Quick Start

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.

## Usage

1. Open a normal website tab (`https://...`).
2. Click the extension icon.
3. Draw on the opened screenshot editor.
4. Click `Copy to Clipboard`.
5. Paste with `Ctrl+V` where needed.

## Troubleshooting

- `No editor opened`: reload the extension in `chrome://extensions` and click the icon again.
- `Capture failed`: Chrome blocks screenshots on `chrome://*` and other protected pages.
- `Copy failed`: ensure the editor tab is focused and try `Copy to Clipboard` again.
