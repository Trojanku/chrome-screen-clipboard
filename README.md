# 📸 chrome-screen-clipboard

<img width="1080" height="608" alt="screenshot-1080x608 (2)" src="https://github.com/user-attachments/assets/96463614-7b53-4ace-84c2-18898903f6cb" />

Chrome extension (Manifest V3) that lets you screenshot, annotate, and copy — all without leaving your browser.

1. 🖼️ Capture the current visible tab as a screenshot
2. ✏️ Draw, annotate, and add text on top of it
3. 📋 Copy the final image to your clipboard in one click

> 💡 **Perfect for AI workflows!** Quickly annotate a screenshot and paste it into [OpenClaw](https://openclaw.com), ChatGPT, Claude, or any AI chatbot to give it visual context. Circle a bug, highlight a UI element, add notes — one screenshot is worth a thousand words of prompting.

---

## 🚀 Quick Start

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. You're ready! 🎉

## 🎨 Usage

1. Open any website tab (`https://...`)
2. Click the extension icon — the editor opens with your screenshot
3. Pick a tool and go wild:

| Tool | What it does |
|---|---|
| 🖌️ **Brush** | Freehand drawing |
| 🔲 **Rectangle** | Draw rectangle outlines |
| 🔤 **Text** | Click to place text, Shift+Enter for multiline |

4. Click **Copy to Clipboard** and paste (`Ctrl+V`) wherever you need it!

## ✨ Features

- **🎯 Select & move** — Click any annotation (text, rectangle, or brush stroke) to select it, then drag to reposition
- **↔️ Resize rectangles** — Drag the corner handles on a selected rectangle to resize it
- **✏️ Edit text** — Double-click any text annotation to re-edit it
- **🎚️ Unified Size slider** — Controls brush width, rectangle stroke width, AND text font size (auto-adapts when switching tools or selecting annotations)
- **🎨 Live color changes** — Change color/size while an annotation is selected to update it instantly
- **↩️ Undo** — `Ctrl+Z` / `Cmd+Z` or click the Undo button (up to 60 steps)
- **🗑️ Delete** — Press `Delete` or `Backspace` to remove selected annotations
- **🌙 Dark themed** editor UI

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Delete` / `Backspace` | Delete selected annotation |
| `Enter` | Commit text input |
| `Shift+Enter` | New line in text input |
| `Escape` | Cancel text editing |

## 🔧 Troubleshooting

- **No editor opened** — Reload the extension in `chrome://extensions` and click the icon again
- **Capture failed** — Chrome blocks screenshots on `chrome://*` and other protected pages
- **Copy failed** — Ensure the editor tab is focused and try **Copy to Clipboard** again
