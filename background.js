const LAST_CAPTURE_KEY = "lastCapture";
const LAST_CAPTURE_ERROR_KEY = "lastCaptureError";

chrome.action.onClicked.addListener(async (tab) => {
  const capturePayload = {
    dataUrl: "",
    pageUrl: tab?.url || "",
    pageTitle: tab?.title || "",
    capturedAt: new Date().toISOString()
  };
  let captureError = "";

  try {
    const windowId = tab.windowId;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    capturePayload.dataUrl = dataUrl;
  } catch (error) {
    console.error("Capture failed:", error);
    captureError = error?.message || String(error);
  }

  await chrome.storage.local.set({
    [LAST_CAPTURE_KEY]: capturePayload,
    [LAST_CAPTURE_ERROR_KEY]: captureError
  });

  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
  } catch (error) {
    console.error("Failed to open editor:", error);
  }
});
