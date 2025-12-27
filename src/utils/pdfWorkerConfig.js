import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";

// IMPORTANT:
// - ?url tells Vite to treat the worker as a static asset
// - This works in Web, Electron, and packaged builds
// - No CDN, no network dependency

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default pdfjsLib;
