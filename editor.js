const LAST_CAPTURE_KEY = "lastCapture";
const LAST_CAPTURE_ERROR_KEY = "lastCaptureError";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const drawModeBtn = document.getElementById("drawModeBtn");
const toolBtn = document.getElementById("toolBtn");
const colorInput = document.getElementById("colorInput");
const sizeInput = document.getElementById("sizeInput");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const statusEl = document.getElementById("status");

let drawingEnabled = true;
let activeTool = "brush";
let isDrawing = false;
let lastPoint = null;
let baseImage = null;
let rectangleStart = null;
let rectangleSnapshot = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

function redrawBaseImage() {
  if (!baseImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  rectangleStart = null;
  rectangleSnapshot = null;
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function beginStroke(event) {
  if (!drawingEnabled) return;
  event.preventDefault();
  isDrawing = true;
  const point = getPoint(event);

  if (activeTool === "brush") {
    lastPoint = point;
  } else {
    rectangleStart = point;
    rectangleSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  if (typeof canvas.setPointerCapture === "function") {
    canvas.setPointerCapture(event.pointerId);
  }
}

function continueStroke(event) {
  if (!isDrawing || !drawingEnabled) return;
  event.preventDefault();

  const point = getPoint(event);

  ctx.strokeStyle = colorInput.value;
  ctx.lineWidth = Number(sizeInput.value);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (activeTool === "brush") {
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint = point;
    return;
  }

  if (!rectangleStart || !rectangleSnapshot) return;
  ctx.putImageData(rectangleSnapshot, 0, 0);
  const x = Math.min(rectangleStart.x, point.x);
  const y = Math.min(rectangleStart.y, point.y);
  const width = Math.abs(point.x - rectangleStart.x);
  const height = Math.abs(point.y - rectangleStart.y);
  ctx.strokeRect(x, y, width, height);
}

function endStroke(event) {
  if (!isDrawing) return;
  if (event) {
    event.preventDefault();
  }

  if (activeTool === "rectangle" && rectangleStart && rectangleSnapshot) {
    const point = event ? getPoint(event) : rectangleStart;
    ctx.putImageData(rectangleSnapshot, 0, 0);
    const x = Math.min(rectangleStart.x, point.x);
    const y = Math.min(rectangleStart.y, point.y);
    const width = Math.abs(point.x - rectangleStart.x);
    const height = Math.abs(point.y - rectangleStart.y);
    ctx.strokeStyle = colorInput.value;
    ctx.lineWidth = Number(sizeInput.value);
    ctx.strokeRect(x, y, width, height);
    rectangleStart = null;
    rectangleSnapshot = null;
  }

  isDrawing = false;
  lastPoint = null;

  if (event && typeof canvas.releasePointerCapture === "function") {
    canvas.releasePointerCapture(event.pointerId);
  }
}

async function loadCapture() {
  const data = await chrome.storage.local.get([LAST_CAPTURE_KEY, LAST_CAPTURE_ERROR_KEY]);
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
  redrawBaseImage();
  setStatus("Capture loaded. Annotate and copy.");
}

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

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      throw new Error("Clipboard API unavailable in this browser context.");
    }

    await navigator.clipboard.writeText(canvas.toDataURL("image/png"));
    setStatus("Image clipboard unavailable. Copied PNG data URL text instead.");
  } catch (error) {
    setStatus(error.message || "Failed to copy capture.", true);
  } finally {
    copyBtn.disabled = false;
  }
}

drawModeBtn.addEventListener("click", () => {
  drawingEnabled = !drawingEnabled;
  drawModeBtn.textContent = `Draw: ${drawingEnabled ? "ON" : "OFF"}`;
});

toolBtn.addEventListener("click", () => {
  activeTool = activeTool === "brush" ? "rectangle" : "brush";
  toolBtn.textContent = `Tool: ${activeTool === "brush" ? "Brush" : "Rectangle"}`;
});

clearBtn.addEventListener("click", redrawBaseImage);
copyBtn.addEventListener("click", copyCapture);

canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", continueStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);
canvas.addEventListener("pointercancel", endStroke);

loadCapture().catch((error) => {
  setStatus(error.message || "Failed to load capture.", true);
});
