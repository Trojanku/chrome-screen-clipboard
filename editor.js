const LAST_CAPTURE_KEY = "lastCapture";
const LAST_CAPTURE_ERROR_KEY = "lastCaptureError";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const drawModeBtn = document.getElementById("drawModeBtn");
const toolBtn = document.getElementById("toolBtn");
const colorInput = document.getElementById("colorInput");
const sizeInput = document.getElementById("sizeInput");
const clearBtn = document.getElementById("clearBtn");
const undoBtn = document.getElementById("undoBtn");
const copyBtn = document.getElementById("copyBtn");
const statusEl = document.getElementById("status");

const TOOLS = ["brush", "rectangle", "text"];
const TOOL_LABELS = { brush: "Brush", rectangle: "Rectangle", text: "Text" };

let drawingEnabled = true;
let activeTool = "brush";
let baseImage = null;

// ─── Annotation store ───────────────────────────────────────
let annotations = [];
let nextId = 1;
let selectedId = null;

// ─── Undo stack ─────────────────────────────────────────────
const undoStack = [];
const MAX_UNDO = 60;

function pushUndo() {
  undoStack.push(JSON.stringify(annotations));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  updateUndoBtn();
}

function undo() {
  if (!undoStack.length) return;
  commitTextInput();
  selectedId = null;
  dragging = null;
  resizing = null;
  annotations = JSON.parse(undoStack.pop());
  updateUndoBtn();
  repaint();
}

function updateUndoBtn() {
  undoBtn.disabled = undoStack.length === 0;
}

// ─── Drawing-in-progress state ──────────────────────────────
let isDrawing = false;
let lastPoint = null;
let currentBrushStroke = null;
let rectDragStart = null;

// Dragging existing annotations
let dragging = null; // { ann, offsetX, offsetY, startAnnSnapshot }

// Resizing rectangles
let resizing = null; // { ann, handle, startAnnSnapshot, startPoint }

// Text editing overlay
let activeTextInput = null;

// Track undo snapshot for slider/color changes
let sliderUndoPushed = false;

// ─── Resize handle constants ────────────────────────────────
const HANDLE_SIZE = 10; // px in canvas coords
const HANDLE_NAMES = ["nw", "ne", "se", "sw"];

// ─── Helpers ────────────────────────────────────────────────

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f87171" : "#8b8fa3";
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function getCanvasScale() {
  const rect = canvas.getBoundingClientRect();
  return {
    x: canvas.width / rect.width,
    y: canvas.height / rect.height,
  };
}

// ─── Annotation rendering ───────────────────────────────────

function drawBrush(ann) {
  if (ann.points.length < 2) return;
  ctx.strokeStyle = ann.color;
  ctx.lineWidth = ann.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ann.points[0].x, ann.points[0].y);
  for (let i = 1; i < ann.points.length; i++) {
    ctx.lineTo(ann.points[i].x, ann.points[i].y);
  }
  ctx.stroke();
}

function drawRect(ann) {
  ctx.strokeStyle = ann.color;
  ctx.lineWidth = ann.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
}

function drawText(ann) {
  ctx.font = `${ann.fontSize}px Arial, sans-serif`;
  ctx.fillStyle = ann.color;
  ctx.textBaseline = "top";
  const lines = ann.text.split("\n");
  const lineHeight = ann.fontSize * 1.2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], ann.x, ann.y + i * lineHeight);
  }
}

function drawAnnotation(ann) {
  if (ann.type === "brush") drawBrush(ann);
  else if (ann.type === "rect") drawRect(ann);
  else if (ann.type === "text") drawText(ann);
}

function measureAnnotation(ann) {
  if (ann.type === "rect") {
    const x = ann.w < 0 ? ann.x + ann.w : ann.x;
    const y = ann.h < 0 ? ann.y + ann.h : ann.y;
    return { x, y, width: Math.abs(ann.w), height: Math.abs(ann.h) };
  }
  if (ann.type === "text") {
    ctx.font = `${ann.fontSize}px Arial, sans-serif`;
    const lines = ann.text.split("\n");
    const lineHeight = ann.fontSize * 1.2;
    let maxWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxWidth) maxWidth = m.width;
    }
    return { x: ann.x, y: ann.y, width: maxWidth, height: lines.length * lineHeight };
  }
  if (ann.type === "brush" && ann.points.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ann.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = ann.lineWidth / 2;
    return { x: minX - pad, y: minY - pad, width: maxX - minX + ann.lineWidth, height: maxY - minY + ann.lineWidth };
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

// ─── Resize handles ─────────────────────────────────────────

function getResizeHandles(ann) {
  if (ann.type !== "rect") return [];
  const b = measureAnnotation(ann);
  const hs = HANDLE_SIZE;
  return [
    { name: "nw", x: b.x - hs / 2, y: b.y - hs / 2, w: hs, h: hs },
    { name: "ne", x: b.x + b.width - hs / 2, y: b.y - hs / 2, w: hs, h: hs },
    { name: "se", x: b.x + b.width - hs / 2, y: b.y + b.height - hs / 2, w: hs, h: hs },
    { name: "sw", x: b.x - hs / 2, y: b.y + b.height - hs / 2, w: hs, h: hs },
  ];
}

function hitTestHandle(point, ann) {
  if (ann.type !== "rect") return null;
  const handles = getResizeHandles(ann);
  const pad = 3;
  for (const h of handles) {
    if (
      point.x >= h.x - pad && point.x <= h.x + h.w + pad &&
      point.y >= h.y - pad && point.y <= h.y + h.h + pad
    ) {
      return h.name;
    }
  }
  return null;
}

function handleCursor(name) {
  const map = { nw: "nwse-resize", ne: "nesw-resize", se: "nwse-resize", sw: "nesw-resize" };
  return map[name] || "default";
}

// ─── Selection box + handles drawing ────────────────────────

function drawSelectionBox(ann) {
  const bounds = measureAnnotation(ann);
  const pad = 5;
  ctx.save();
  ctx.strokeStyle = "#4d8eff";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(
    bounds.x - pad,
    bounds.y - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2
  );
  ctx.restore();

  // Draw resize handles for rectangles
  if (ann.type === "rect") {
    const handles = getResizeHandles(ann);
    ctx.save();
    ctx.fillStyle = "#4d8eff";
    ctx.strokeStyle = "#1a1d27";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const h of handles) {
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    }
    ctx.restore();
  }
}

// ─── Repaint ────────────────────────────────────────────────

function repaint() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  }

  const editingId =
    activeTextInput && activeTextInput.annotationId
      ? activeTextInput.annotationId
      : null;

  for (const ann of annotations) {
    if (ann.id === editingId) continue;
    drawAnnotation(ann);
  }

  // Draw live brush stroke in progress
  if (currentBrushStroke) {
    drawBrush(currentBrushStroke);
  }

  // Draw live rectangle in progress
  if (rectDragStart) {
    ctx.strokeStyle = rectDragStart.color;
    ctx.lineWidth = rectDragStart.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeRect(rectDragStart.x, rectDragStart.y, rectDragStart.w, rectDragStart.h);
  }

  // Selection box + handles
  if (selectedId && selectedId !== editingId) {
    const sel = annotations.find((a) => a.id === selectedId);
    if (sel) drawSelectionBox(sel);
  }
}

// ─── Hit testing ────────────────────────────────────────────

function hitTest(point) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    const bounds = measureAnnotation(ann);
    const pad = ann.type === "brush" ? 4 : 6;
    if (
      point.x >= bounds.x - pad &&
      point.x <= bounds.x + bounds.width + pad &&
      point.y >= bounds.y - pad &&
      point.y <= bounds.y + bounds.height + pad
    ) {
      return ann;
    }
  }
  return null;
}

// ─── Annotation movement helpers ────────────────────────────

function moveAnnotation(ann, dx, dy) {
  if (ann.type === "text" || ann.type === "rect") {
    ann.x += dx;
    ann.y += dy;
  } else if (ann.type === "brush") {
    for (const p of ann.points) {
      p.x += dx;
      p.y += dy;
    }
  }
}

// ─── Rectangle resizing ─────────────────────────────────────

function applyResize(ann, handle, dx, dy) {
  // ann is a rect: { x, y, w, h }
  // Resize from the given corner handle
  if (handle === "nw") {
    ann.x += dx;
    ann.y += dy;
    ann.w -= dx;
    ann.h -= dy;
  } else if (handle === "ne") {
    ann.y += dy;
    ann.w += dx;
    ann.h -= dy;
  } else if (handle === "se") {
    ann.w += dx;
    ann.h += dy;
  } else if (handle === "sw") {
    ann.x += dx;
    ann.w -= dx;
    ann.h += dy;
  }
}

// ─── Text input overlay ─────────────────────────────────────

function removeActiveTextInput() {
  if (activeTextInput) {
    activeTextInput.element.remove();
    activeTextInput = null;
  }
}

function commitTextInput() {
  if (!activeTextInput) return;
  const input = activeTextInput;
  const text = input.element.value;

  if (input.annotationId) {
    const ann = annotations.find((a) => a.id === input.annotationId);
    if (ann) {
      if (text.trim()) {
        if (ann.text !== text) {
          pushUndo();
          ann.text = text;
        }
      } else {
        pushUndo();
        annotations = annotations.filter((a) => a.id !== input.annotationId);
        if (selectedId === input.annotationId) selectedId = null;
      }
    }
  } else {
    if (text.trim()) {
      pushUndo();
      annotations.push({
        type: "text",
        id: nextId++,
        text: text,
        x: input.canvasX,
        y: input.canvasY,
        fontSize: input.fontSize,
        color: input.color,
      });
    }
  }

  removeActiveTextInput();
  repaint();
}

function openTextInput(canvasX, canvasY, fontSize, color, existingAnnotation) {
  commitTextInput();

  const rect = canvas.getBoundingClientRect();
  const scale = getCanvasScale();
  const displayFontSize = fontSize / scale.y;

  const cssX = canvasX / scale.x + rect.left + window.scrollX;
  const cssY = canvasY / scale.y + rect.top + window.scrollY;

  const textarea = document.createElement("textarea");
  textarea.className = "text-input-overlay";
  textarea.style.left = `${cssX}px`;
  textarea.style.top = `${cssY}px`;
  textarea.style.fontSize = `${displayFontSize}px`;
  textarea.style.color = color;
  textarea.style.lineHeight = "1.2";
  textarea.rows = 1;

  if (existingAnnotation) {
    textarea.value = existingAnnotation.text;
  }

  document.body.appendChild(textarea);
  textarea.focus();

  if (existingAnnotation) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  activeTextInput = {
    element: textarea,
    canvasX,
    canvasY,
    fontSize,
    color,
    annotationId: existingAnnotation ? existingAnnotation.id : null,
  };

  repaint();

  textarea.addEventListener("blur", () => {
    setTimeout(() => {
      if (activeTextInput && activeTextInput.element === textarea) {
        commitTextInput();
      }
    }, 100);
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeActiveTextInput();
      repaint();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });
}

// ─── Pointer handlers ───────────────────────────────────────

function beginStroke(event) {
  if (!drawingEnabled) return;
  event.preventDefault();

  const point = getPoint(event);

  // --- Check resize handle on selected rect first ---
  if (selectedId) {
    const sel = annotations.find((a) => a.id === selectedId);
    if (sel && sel.type === "rect") {
      const handle = hitTestHandle(point, sel);
      if (handle) {
        resizing = {
          ann: sel,
          handle,
          startAnnSnapshot: JSON.stringify(sel),
          lastPoint: point,
        };
        if (typeof canvas.setPointerCapture === "function") {
          canvas.setPointerCapture(event.pointerId);
        }
        return;
      }
    }
  }

  // --- Text tool ---
  if (activeTool === "text") {
    const hit = hitTest(point);
    if (hit) {
      selectedId = hit.id;
      const bounds = measureAnnotation(hit);
      dragging = {
        ann: hit,
        offsetX: point.x - bounds.x,
        offsetY: point.y - bounds.y,
        startAnnSnapshot: JSON.stringify(hit),
      };
      syncSlidersToSelection();
      repaint();
      if (typeof canvas.setPointerCapture === "function") {
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }

    selectedId = null;
    openTextInput(point.x, point.y, Number(sizeInput.value), colorInput.value, null);
    repaint();
    return;
  }

  // --- Rectangle tool ---
  if (activeTool === "rectangle") {
    const hit = hitTest(point);
    if (hit) {
      selectedId = hit.id;
      const bounds = measureAnnotation(hit);
      dragging = {
        ann: hit,
        offsetX: point.x - bounds.x,
        offsetY: point.y - bounds.y,
        startAnnSnapshot: JSON.stringify(hit),
      };
      syncSlidersToSelection();
      repaint();
      if (typeof canvas.setPointerCapture === "function") {
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }

    // Drawing a new rectangle
    selectedId = null;
    isDrawing = true;
    rectDragStart = {
      x: point.x,
      y: point.y,
      w: 0,
      h: 0,
      originX: point.x,
      originY: point.y,
      color: colorInput.value,
      lineWidth: Number(sizeInput.value),
    };
    repaint();
    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(event.pointerId);
    }
    return;
  }

  // --- Brush tool ---
  if (activeTool === "brush") {
    selectedId = null;
    isDrawing = true;
    currentBrushStroke = {
      type: "brush",
      id: -1,
      points: [point],
      color: colorInput.value,
      lineWidth: Number(sizeInput.value),
    };
    lastPoint = point;
    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(event.pointerId);
    }
    return;
  }
}

function continueStroke(event) {
  if (!drawingEnabled) return;

  // Resizing a rectangle
  if (resizing) {
    event.preventDefault();
    const point = getPoint(event);
    const dx = point.x - resizing.lastPoint.x;
    const dy = point.y - resizing.lastPoint.y;
    applyResize(resizing.ann, resizing.handle, dx, dy);
    resizing.lastPoint = point;
    repaint();
    return;
  }

  // Dragging an existing annotation
  if (dragging) {
    event.preventDefault();
    const point = getPoint(event);
    const bounds = measureAnnotation(dragging.ann);
    const newX = point.x - dragging.offsetX;
    const newY = point.y - dragging.offsetY;
    const dx = newX - bounds.x;
    const dy = newY - bounds.y;
    moveAnnotation(dragging.ann, dx, dy);
    repaint();
    return;
  }

  if (!isDrawing) {
    // Update cursor when hovering over resize handles
    updateHoverCursor(event);
    return;
  }

  event.preventDefault();
  const point = getPoint(event);

  // Live brush stroke
  if (activeTool === "brush" && currentBrushStroke) {
    currentBrushStroke.points.push(point);
    lastPoint = point;
    repaint();
    return;
  }

  // Live rectangle preview
  if (activeTool === "rectangle" && rectDragStart) {
    rectDragStart.x = Math.min(rectDragStart.originX, point.x);
    rectDragStart.y = Math.min(rectDragStart.originY, point.y);
    rectDragStart.w = Math.abs(point.x - rectDragStart.originX);
    rectDragStart.h = Math.abs(point.y - rectDragStart.originY);
    repaint();
    return;
  }
}

function endStroke(event) {
  // End resize
  if (resizing) {
    if (event) event.preventDefault();
    const currentSnapshot = JSON.stringify(resizing.ann);
    if (currentSnapshot !== resizing.startAnnSnapshot) {
      const resizedState = JSON.parse(currentSnapshot);
      const idx = annotations.indexOf(resizing.ann);
      if (idx !== -1) {
        annotations[idx] = JSON.parse(resizing.startAnnSnapshot);
        pushUndo();
        annotations[idx] = resizedState;
      }
    }
    resizing = null;
    repaint();
    if (event && typeof canvas.releasePointerCapture === "function") {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }

  // End drag of existing annotation
  if (dragging) {
    if (event) event.preventDefault();
    const currentSnapshot = JSON.stringify(dragging.ann);
    if (currentSnapshot !== dragging.startAnnSnapshot) {
      const movedState = JSON.parse(currentSnapshot);
      const idx = annotations.indexOf(dragging.ann);
      if (idx !== -1) {
        annotations[idx] = JSON.parse(dragging.startAnnSnapshot);
        pushUndo();
        annotations[idx] = movedState;
        dragging.ann = movedState;
      }
    }
    dragging = null;
    repaint();
    if (event && typeof canvas.releasePointerCapture === "function") {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }

  if (!isDrawing) return;
  if (event) event.preventDefault();

  // Commit brush stroke
  if (activeTool === "brush" && currentBrushStroke) {
    if (currentBrushStroke.points.length >= 2) {
      pushUndo();
      currentBrushStroke.id = nextId++;
      annotations.push(currentBrushStroke);
    }
    currentBrushStroke = null;
  }

  // Commit rectangle
  if (activeTool === "rectangle" && rectDragStart) {
    if (rectDragStart.w > 2 || rectDragStart.h > 2) {
      pushUndo();
      annotations.push({
        type: "rect",
        id: nextId++,
        x: rectDragStart.x,
        y: rectDragStart.y,
        w: rectDragStart.w,
        h: rectDragStart.h,
        color: rectDragStart.color,
        lineWidth: rectDragStart.lineWidth,
      });
    }
    rectDragStart = null;
  }

  isDrawing = false;
  lastPoint = null;
  repaint();

  if (event && typeof canvas.releasePointerCapture === "function") {
    canvas.releasePointerCapture(event.pointerId);
  }
}

// ─── Hover cursor for resize handles ────────────────────────

function updateHoverCursor(event) {
  if (!selectedId) {
    canvas.style.cursor = activeTool === "text" ? "text" : "crosshair";
    return;
  }
  const sel = annotations.find((a) => a.id === selectedId);
  if (!sel || sel.type !== "rect") {
    canvas.style.cursor = activeTool === "text" ? "text" : "crosshair";
    return;
  }
  const point = getPoint(event);
  const handle = hitTestHandle(point, sel);
  if (handle) {
    canvas.style.cursor = handleCursor(handle);
  } else {
    canvas.style.cursor = activeTool === "text" ? "text" : "crosshair";
  }
}

// ─── Double-click to edit text ──────────────────────────────

function handleDoubleClick(event) {
  if (!drawingEnabled) return;

  const point = getPoint(event);
  const hit = hitTest(point);
  if (!hit) return;

  if (hit.type === "text") {
    event.preventDefault();
    selectedId = hit.id;
    dragging = null;
    openTextInput(hit.x, hit.y, hit.fontSize, hit.color, hit);
  }
}

// ─── Delete selected annotation ─────────────────────────────

function deleteSelected() {
  if (!selectedId) return;
  pushUndo();
  annotations = annotations.filter((a) => a.id !== selectedId);
  selectedId = null;
  repaint();
}

// ─── Sync sliders to selected annotation ────────────────────

function syncSlidersToSelection() {
  if (!selectedId) return;
  const ann = annotations.find((a) => a.id === selectedId);
  if (!ann) return;

  colorInput.value = ann.color;

  if (ann.type === "text") {
    sizeInput.value = ann.fontSize;
  } else if (ann.type === "rect" || ann.type === "brush") {
    sizeInput.value = ann.lineWidth;
  }
}

// ─── Size slider changes selected annotation ────────────────

function onSizeChange() {
  if (!selectedId) return;
  const ann = annotations.find((a) => a.id === selectedId);
  if (!ann) return;

  if (!sliderUndoPushed) {
    pushUndo();
    sliderUndoPushed = true;
  }

  const val = Number(sizeInput.value);
  if (ann.type === "text") {
    ann.fontSize = val;
  } else if (ann.type === "rect" || ann.type === "brush") {
    ann.lineWidth = val;
  }
  repaint();
}

function onSizeChangeEnd() {
  sliderUndoPushed = false;
}

// ─── Color picker changes selected annotation ───────────────

function onColorChange() {
  if (!selectedId) return;
  const ann = annotations.find((a) => a.id === selectedId);
  if (!ann) return;

  if (!sliderUndoPushed) {
    pushUndo();
    sliderUndoPushed = true;
  }

  ann.color = colorInput.value;
  repaint();
}

function onColorChangeEnd() {
  sliderUndoPushed = false;
}

// ─── Keyboard shortcuts ─────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (activeTextInput) return;

  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedId) {
      e.preventDefault();
      deleteSelected();
    }
  }
});

// ─── Base image / clear ─────────────────────────────────────

function resetAll() {
  if (!baseImage) return;
  commitTextInput();
  if (annotations.length) pushUndo();
  annotations = [];
  selectedId = null;
  dragging = null;
  resizing = null;
  currentBrushStroke = null;
  rectDragStart = null;
  removeActiveTextInput();
  repaint();
}

// ─── Capture loading ────────────────────────────────────────

async function loadCapture() {
  const data = await chrome.storage.local.get([
    LAST_CAPTURE_KEY,
    LAST_CAPTURE_ERROR_KEY,
  ]);
  const capture = data[LAST_CAPTURE_KEY];
  const captureError = data[LAST_CAPTURE_ERROR_KEY];

  if (!capture || !capture.dataUrl) {
    const message = captureError
      ? `Capture failed: ${captureError}. Try a normal website (https://...), not chrome:// pages.`
      : "No capture found. Click extension icon on a page first.";
    setStatus(message, true);
    copyBtn.disabled = true;
    return;
  }

  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();

  baseImage = image;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  repaint();
  setStatus("Capture loaded. Annotate and copy.");
}

// ─── Copy to clipboard ──────────────────────────────────────

function canvasToBlob() {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to render image from canvas."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function copyCapture() {
  commitTextInput();
  const prevSelected = selectedId;
  selectedId = null;
  repaint();

  copyBtn.disabled = true;
  setStatus("Copying...");

  try {
    const blob = await canvasToBlob();

    if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setStatus("Annotated image copied to clipboard.");
      return;
    }

    if (
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      throw new Error("Clipboard API unavailable in this browser context.");
    }

    await navigator.clipboard.writeText(canvas.toDataURL("image/png"));
    setStatus("Image clipboard unavailable. Copied PNG data URL text instead.");
  } catch (error) {
    setStatus(error.message || "Failed to copy capture.", true);
  } finally {
    copyBtn.disabled = false;
    selectedId = prevSelected;
    repaint();
  }
}

// ─── Toolbar events ─────────────────────────────────────────

drawModeBtn.addEventListener("click", () => {
  drawingEnabled = !drawingEnabled;
  drawModeBtn.textContent = `Draw: ${drawingEnabled ? "ON" : "OFF"}`;
});

let lastBrushSize = 4;
let lastTextSize = 32;

function updateToolUI() {
  toolBtn.textContent = `Tool: ${TOOL_LABELS[activeTool]}`;
  canvas.style.cursor = activeTool === "text" ? "text" : "crosshair";

  // Swap size slider value based on tool context
  if (!selectedId) {
    if (activeTool === "text") {
      sizeInput.value = lastTextSize;
    } else {
      sizeInput.value = lastBrushSize;
    }
  }
}

toolBtn.addEventListener("click", () => {
  commitTextInput();
  // Save current size for this tool context before switching
  if (activeTool === "text") {
    lastTextSize = Number(sizeInput.value);
  } else {
    lastBrushSize = Number(sizeInput.value);
  }
  selectedId = null;
  const idx = TOOLS.indexOf(activeTool);
  activeTool = TOOLS[(idx + 1) % TOOLS.length];
  updateToolUI();
  repaint();
});

updateToolUI();

clearBtn.addEventListener("click", resetAll);
undoBtn.addEventListener("click", undo);
copyBtn.addEventListener("click", copyCapture);

sizeInput.addEventListener("input", onSizeChange);
sizeInput.addEventListener("change", onSizeChangeEnd);
colorInput.addEventListener("input", onColorChange);
colorInput.addEventListener("change", onColorChangeEnd);

canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", continueStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("dblclick", handleDoubleClick);

updateUndoBtn();

loadCapture().catch((error) => {
  setStatus(error.message || "Failed to load capture.", true);
});
