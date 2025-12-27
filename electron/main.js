import { app, BrowserWindow, ipcMain, dialog, session } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

app.disableHardwareAcceleration();

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let currentPdfPath = null;

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function toExactArrayBufferFromNodeBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function toNodeBuffer(input) {
  if (!input) throw new Error("bytes is null/undefined");
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input));
  if (typeof input === "object" && input.type === "Buffer" && Array.isArray(input.data)) {
    return Buffer.from(input.data);
  }
  if (Array.isArray(input)) return Buffer.from(input);
  throw new Error(`Unsupported bytes type: ${Object.prototype.toString.call(input)}`);
}

// ---------------------------------------------------------
// CSP (Dev vs Prod)
// ---------------------------------------------------------
function buildCsp({ dev }) {
  // NOTE:
  // - You use lots of inline styles in React => style-src needs 'unsafe-inline'
  // - pdf.js worker needs blob:
  // - backend calls need connect-src to localhost:8000
  if (dev) {
    return [
      "default-src 'self';",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
      "style-src 'self' 'unsafe-inline';",
      "img-src 'self' data: blob:;",
      "font-src 'self' data: blob:;",
      "connect-src 'self' http://localhost:8000 ws://localhost:5175 blob:;",
      "worker-src 'self' blob:;",
      "frame-src 'self';",
    ].join(" ");
  }

  // Production (packaged): tighten it up
  // If your Python backend is local, keep localhost:8000.
  // If you later change port/host, update connect-src.
  return [
    "default-src 'self';",
    "script-src 'self';",
    "style-src 'self' 'unsafe-inline';",
    "img-src 'self' data: blob:;",
    "font-src 'self' data: blob:;",
    "connect-src 'self' http://localhost:8000 blob:;",
    "worker-src 'self' blob:;",
    "frame-src 'self';",
    // Optional hardening:
    "base-uri 'self';",
    "object-src 'none';",
  ].join(" ");
}

function installCspHeaders() {
  const csp = buildCsp({ dev: isDev });

  // Apply CSP to all responses loaded by the app window (dev server or file://)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};

    // Force CSP
    responseHeaders["Content-Security-Policy"] = [csp];

    callback({ responseHeaders });
  });
}

// ---------------------------------------------------------
// Create window
// ---------------------------------------------------------
function createWindow() {
  // Install CSP before any navigation happens
  installCspHeaders();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "PDF Redactor Pro",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,

      // ✅ Recommended hardening:
      webSecurity: true,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);

  if (isDev) {
    mainWindow.loadURL("http://localhost:5175/");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------
ipcMain.on("app:quit", () => {
  console.log("🛑 Quit requested");
  app.quit();
});

ipcMain.handle("dialog:openPdf", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (result.canceled || !result.filePaths?.[0]) return null;

    currentPdfPath = result.filePaths[0];
    const buf = fs.readFileSync(currentPdfPath);
    const ab = toExactArrayBufferFromNodeBuffer(buf);

    return { path: currentPdfPath, bytes: ab };
  } catch (error) {
    console.error("❌ Failed to open PDF:", error);
    return null;
  }
});

ipcMain.handle("dialog:savePdfAs", async (_event, suggestedName = "edited.pdf") => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save PDF As",
      defaultPath: suggestedName,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (result.canceled || !result.filePath) return null;
    return { path: result.filePath };
  } catch (error) {
    console.error("❌ Save dialog error:", error);
    return null;
  }
});

ipcMain.handle("file:writeBytes", async (_event, { path: outPath, bytes }) => {
  try {
    if (!outPath) throw new Error("Missing outPath");
    const buffer = toNodeBuffer(bytes);

    const header = buffer.slice(0, 5).toString("ascii");
    console.log("📝 WRITE HEADER:", header, "bytes:", buffer.length);

    fs.writeFileSync(outPath, buffer);
    currentPdfPath = outPath;
    return { ok: true, bytesWritten: buffer.length };
  } catch (error) {
    console.error("❌ Critical Save Error:", error);
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle("file:getCurrentPath", async () => currentPdfPath);

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:toggleMaximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});

// ---------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------
app.whenReady().then(() => {
  console.log("🚀 App ready, creating window...");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => console.error("💥 Uncaught Exception:", error));
process.on("unhandledRejection", (reason, promise) =>
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason)
);
