// preloads.js (hardened)
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Security goals:
 * - Only expose a small, explicit API surface
 * - Whitelist channels that renderer can call
 * - Validate inputs where practical
 * - Ensure errors don't crash preload
 */

// -----------------------------
// IPC Channel Allow-Lists
// -----------------------------
const INVOKE_CHANNELS = new Set([
  "dialog:openPdf",
  "dialog:savePdfAs",
  "file:writeBytes",
  "file:getCurrentPath",
]);

const SEND_CHANNELS = new Set([
  "app:quit",
  "window:minimize",
  "window:toggleMaximize",
]);

// If you actually use "onMenuAction" events, whitelist those here.
// Example: "menu:open", "menu:save", etc.
const ON_CHANNELS = new Set([
  // "menu:open",
  // "menu:save",
  // "menu:saveAs",
  // "menu:exit",
]);

// -----------------------------
// Helpers
// -----------------------------
function assertString(v, name) {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function isArrayBuffer(v) {
  return v instanceof ArrayBuffer;
}

function isUint8Array(v) {
  return v instanceof Uint8Array;
}

function isSerializableBytes(v) {
  return isArrayBuffer(v) || isUint8Array(v) || Array.isArray(v);
}

function safeInvoke(channel, ...args) {
  if (!INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`Blocked ipcRenderer.invoke on channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

function safeSend(channel, ...args) {
  if (!SEND_CHANNELS.has(channel)) {
    throw new Error(`Blocked ipcRenderer.send on channel: ${channel}`);
  }
  ipcRenderer.send(channel, ...args);
}

function safeOn(channel, handler) {
  if (!ON_CHANNELS.has(channel)) {
    throw new Error(`Blocked ipcRenderer.on on channel: ${channel}`);
  }
  if (typeof handler !== "function") {
    throw new Error("handler must be a function");
  }

  const subscription = (_event, ...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`[preload] on("${channel}") handler error:`, err);
    }
  };

  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
}

// -----------------------------
// Exposed API (frozen)
// -----------------------------
const api = Object.freeze({
  isNative: true,

  /**
   * LISTENERS (Main -> Renderer)
   * Note: this is now restricted to ON_CHANNELS allow-list.
   */
  onMenuAction: (channel, callback) => {
    try {
      assertString(channel, "channel");
      return safeOn(channel, callback);
    } catch (err) {
      console.error("[preload] onMenuAction blocked/error:", err);
      return () => {}; // safe no-op unsubscribe
    }
  },

  /**
   * ACTIONS (Renderer -> Main)
   */
  quitApp: () => {
    try {
      safeSend("app:quit");
    } catch (err) {
      console.error("[preload] quitApp error:", err);
    }
  },

  openPdfDialog: async () => {
    try {
      return await safeInvoke("dialog:openPdf");
    } catch (err) {
      console.error("[preload] openPdfDialog error:", err);
      return null;
    }
  },

  savePdfAsDialog: async (fileName) => {
    try {
      // fileName can be undefined; main has default
      if (fileName != null && typeof fileName !== "string") {
        throw new Error("fileName must be a string or undefined");
      }
      return await safeInvoke("dialog:savePdfAs", fileName);
    } catch (err) {
      console.error("[preload] savePdfAsDialog error:", err);
      return null;
    }
  },

  writeBytes: async ({ path, bytes } = {}) => {
    try {
      assertString(path, "path");
      if (!isSerializableBytes(bytes)) {
        throw new Error("bytes must be Uint8Array | ArrayBuffer | number[]");
      }
      return await safeInvoke("file:writeBytes", { path, bytes });
    } catch (err) {
      console.error("[preload] writeBytes error:", err);
      return { ok: false, error: String(err?.message || err) };
    }
  },

  getCurrentPath: async () => {
    try {
      return await safeInvoke("file:getCurrentPath");
    } catch (err) {
      console.error("[preload] getCurrentPath error:", err);
      return null;
    }
  },

  minimize: () => {
    try {
      safeSend("window:minimize");
    } catch (err) {
      console.error("[preload] minimize error:", err);
    }
  },

  toggleMaximize: () => {
    try {
      safeSend("window:toggleMaximize");
    } catch (err) {
      console.error("[preload] toggleMaximize error:", err);
    }
  },
});

contextBridge.exposeInMainWorld("pdfEditorNative", api);

console.log("✅ Preload script loaded (hardened): window.pdfEditorNative is available");
