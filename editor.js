const LAST_CAPTURE_KEY = "lastCapture";
const LAST_CAPTURE_ERROR_KEY = "lastCaptureError";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const drawModeBtn = document.getElementById("drawModeBtn");
const colorInput = document.getElementById("colorInput");
const sizeInput = document.getElementById("sizeInput");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const statusEl = document.getElementById("status");

let drawingEnabled = true;
let isDrawing = false;
let lastPoint = null;
let baseImage = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

function redrawBaseImage() {
  if (!baseImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
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
  isDrawing = true;
  lastPoint = getPoint(event);
}

function continueStroke(event) {
  if (!isDrawing || !drawingEnabled) return;

  const point = getPoint(event);
  ctx.strokeStyle = colorInput.value;
  ctx.lineWidth = Number(sizeInput.value);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();

  lastPoint = point;
}

function endStroke() {
  isDrawing = false;
  lastPoint = null;
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

clearBtn.addEventListener("click", redrawBaseImage);
copyBtn.addEventListener("click", copyCapture);

canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", continueStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);

loadCapture().catch((error) => {
  setStatus(error.message || "Failed to load capture.", true);
});
