import React, { useEffect, useRef, useState, useCallback } from "react";
import { logSaveError } from "./Diagnosis/Diagnostic-tool";

import TopBar from "./components/layout/TopBar";
import LeftSidebar from "./components/layout/LeftSidebar";
import RightSidebar from "./components/layout/RightSidebar";
import Workspace from "./components/layout/Workspace";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

// --- Helpers:  keep byte payloads EXACT ---
function toExactUint8(bytes) {
  if (! bytes) return null;
  if (bytes instanceof Uint8Array) {
    // ✅ FIX: Create a copy to avoid detached buffer issues
    return new Uint8Array(bytes);
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes. byteLength);
  }
  return null;
}

function toExactArrayBuffer(bytes) {
  const u8 = toExactUint8(bytes);
  if (!u8) return null;
  // ✅ FIX:  Create a proper copy
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

export default function App() {
  /* ---------------------------------------------------------
     REFS
  --------------------------------------------------------- */
  const pdfViewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const pdfBytesRef = useRef(null);

  /* ---------------------------------------------------------
     STATE — MUST COME FIRST
  --------------------------------------------------------- */
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  const [currentTool, setCurrentTool] = useState("REMOVE_TEXT");
  const [zoom, setZoom] = useState(1);

  const [pdfBytes, setPdfBytes] = useState(null);
  const [openedFileName, setOpenedFileName] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const [blocks, setBlocks] = useState([]);

  const nativeApi = window.pdfEditorNative;
  const isNative = !!nativeApi?. isNative;
const hasDocument = pdfBytes instanceof Uint8Array && pdfBytes.byteLength > 0;

  // ✅ Keep ref in sync with state
useEffect(() => {
  pdfBytesRef.current = pdfBytes;
  console.log("[DIAG][App] pdfBytesRef updated, byteLength:", pdfBytes?. byteLength || 0, pdfBytes);
}, [pdfBytes]);

  /* ---------------------------------------------------------
     SAVE / EXPORT
  --------------------------------------------------------- */
const handleSaveAsPdf = useCallback(async () => {
  const currentPdfBytes = pdfBytesRef.current;
  
  console.log("[DIAG][handleSaveAsPdf] pdfBytes at save time:", currentPdfBytes);
  console.log("[DIAG][handleSaveAsPdf] byteLength:", currentPdfBytes?.byteLength);
  console.log("[DIAG][handleSaveAsPdf] buffer:", currentPdfBytes?.buffer);

  if (! currentPdfBytes || currentPdfBytes.byteLength === 0) {
    alert("PDF is not ready to save.   Please make sure a PDF is loaded and try again.");
    return;
  }
  
  // ...  rest stays the same

  // ✅ FIX:   Create a proper copy to avoid detached buffer
  let outU8;
  try {
    outU8 = new Uint8Array(currentPdfBytes);
  } catch (err) {
    console.error("[Save] Failed to copy PDF bytes:", err);
    alert("Failed to prepare PDF for saving. The buffer may be corrupted.");
    return;
  }

  console.log("[Save] pdfBytes type:", Object.prototype.toString.call(currentPdfBytes));
  console.log("[Save] outU8:", outU8?. constructor?.name, "byteLength:", outU8?.byteLength);

  if (!outU8 || outU8.byteLength <= 0) {
    alert("PDF is not ready to save.  Please make sure a PDF is loaded and try again.");
    return;
  }

  const header = String.fromCharCode(...outU8. slice(0, 5));
  if (! header.startsWith("%PDF-")) {
    alert(`Current bytes do not look like a valid PDF.   Header="${header}"`);
    return;
  }
  
  // ...  rest of function stays the same

    try {
      setIsExporting(true);
      setExportProgress(25);

      try {
        diagnosePdfDna(outU8);
      } catch (e) {
        console.warn("Diagnostic failed:", e);
      }

      setExportProgress(75);

      const fileName = `${openedFileName || "redacted"}-edited.pdf`;

      if (isNative && nativeApi?.savePdfAsDialog) {
        const res = await nativeApi.savePdfAsDialog(fileName);
        if (res?. path) {
          await nativeApi.writeBytes({ path: res.path, bytes: outU8 });
        }
      } else {
        // ✅ FIX:  Create blob directly from Uint8Array
        const blob = new Blob([outU8], { type: "application/pdf" });
        const url = URL. createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        
        // ✅ FIX:  Ensure the download is triggered
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);

        setOpenedFileName(fileName. replace(/\.[^. ]+$/, ""));
      }

      setExportProgress(100);
    } catch (err) {
      console.error("Save failure:", err);
      if (typeof logSaveError === "function") logSaveError(err);
      alert("Save failed.  Check console for details.");
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportProgress(0), 800);
    }
  }, [openedFileName, isNative, nativeApi]);

  const handleSave = useCallback(async () => {
    await handleSaveAsPdf();
  }, [handleSaveAsPdf]);

 /* ---------------------------------------------------------
   BACKEND UPLOAD + EXTRACT
 --------------------------------------------------------- */

const uploadAndExtract = useCallback(async (file) => {
  console.log("[DIAG][uploadAndExtract] Starting to load file:", file?. name);
  
  try {
    // ✅ NEW APPROACH: Use FileReader to get bytes
    const fileReader = new FileReader();
    
    const uint8 = await new Promise((resolve, reject) => {
      fileReader. onload = (e) => {
        console.log("[DIAG][FileReader] onload triggered");
        try {
          const arrayBuffer = e.target.result;
          console.log("[DIAG][FileReader] arrayBuffer byteLength:", arrayBuffer?. byteLength);
          
          // ✅ CREATE COMPLETELY NEW BUFFER (not a view)
          const newBuffer = new ArrayBuffer(arrayBuffer.byteLength);
          const newView = new Uint8Array(newBuffer);
          newView.set(new Uint8Array(arrayBuffer));
          
          console.log("[DIAG][FileReader] Created new buffer, byteLength:", newView.byteLength);
          resolve(newView);
        } catch (err) {
          console. error("[DIAG][FileReader] Error in onload:", err);
          reject(err);
        }
      };
      
      fileReader.onerror = (err) => {
        console.error("[DIAG][FileReader] onerror:", err);
        reject(err);
      };
      
      console.log("[DIAG][FileReader] Starting readAsArrayBuffer");
      fileReader.readAsArrayBuffer(file);
    });

    console.log("[DIAG][uploadAndExtract] FileReader loaded bytes:", uint8.byteLength, uint8);
    console.log("[DIAG][uploadAndExtract] First 10 bytes:", Array. from(uint8.slice(0, 10)));

    setOpenedFileName(file.name. replace(/\.[^. ]+$/, ""));
    setPdfBytes(uint8);
    console.log("[DIAG][uploadAndExtract] setPdfBytes called with byteLength:", uint8.byteLength, uint8);

    // Send to backend
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("http://localhost:8000/extract/", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Backend extract failed");
    const data = await response.json();

    setBlocks(data.blocks || []);
    if (typeof data.pageCount === "number") {
      setPageCount(data.pageCount);
    }

    setCurrentPage(1);
    
    console.log("[DIAG][uploadAndExtract] Successfully completed!");
    
  } catch (err) {
    console.error("[DIAG][uploadAndExtract] ERROR:", err);
    console.error("[DIAG][uploadAndExtract] Error stack:", err.stack);
    alert("Failed to load/extract PDF:  " + err.message);
  }
}, []);
  /* ---------------------------------------------------------
     OPEN FILE (WEB + ELECTRON)
  --------------------------------------------------------- */
  const handleOpenFile = useCallback(async () => {
    try {
      if (isNative && typeof nativeApi?.openPdfDialog === "function") {
        const result = await nativeApi.openPdfDialog();
        if (!result?. bytes) return;

        const baseName = (result.path || "document")
          .split(/[\\/]/)
          .pop()
          .replace(/\.[^.]+$/, "");

        const u8 = toExactUint8(result. bytes);
        if (!u8 || u8.length === 0) {
          alert("Open failed:  empty PDF bytes.");
          return;
        }

        setOpenedFileName(baseName);
        setPdfBytes(u8);
        setCurrentPage(1);
        setBlocks([]);
        return;
      }

      fileInputRef.current?.click();
    } catch (err) {
      console.error("Open Error:", err);
    }
  }, [isNative, nativeApi]);

  /* ---------------------------------------------------------
     NAV / ZOOM
  --------------------------------------------------------- */
  const handleNextPage = () => pdfViewerRef.current?.nextPage?. ();
  const handlePrevPage = () => pdfViewerRef.current?.prevPage?.();

  const zoomIn = () => setZoom((z) => Math.min(z + 0.2, MAX_ZOOM));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.2, MIN_ZOOM));
  const resetZoom = () => setZoom(1);

  /* ---------------------------------------------------------
     ERASE / UNDO / CLOSE
  --------------------------------------------------------- */
  const handleUndo = () => pdfViewerRef.current?. undo?.();

  const handleApplyEraseCurrentPage = () =>
    pdfViewerRef. current?.applyEraseCurrentPage?.();
  const handleApplyEraseAllPages = () =>
    pdfViewerRef.current?.applyEraseAllPages?.();
  const handleClearEraseCurrentPage = () =>
    pdfViewerRef.current?.clearEraseCurrentPage?.();
  const handleClearEraseAllPages = () =>
    pdfViewerRef.current?.clearEraseAllPages?.();

  const handleCloseFile = () => {
    setPdfBytes(null);
    setOpenedFileName(null);
    setZoom(1);
    setCurrentPage(1);
    setPageCount(0);
    setBlocks([]);
    setCurrentTool("ERASE");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExit = useCallback(() => {
    if (isNative && typeof nativeApi?.quitApp === "function") {
      nativeApi.quitApp();
      return;
    }
    if (window.confirm("Are you sure you want to exit?")) {
      handleCloseFile();
      window.location.href = "about:blank";
    }
  }, [isNative, nativeApi]);

  /* ---------------------------------------------------------
     KEYBOARD SHORTCUTS
  --------------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isExporting) return;

      const key = e.key.toLowerCase();

      if (e.key === "Escape") {
        e.preventDefault();
        handleUndo();
      }

      if ((e.ctrlKey || e.metaKey) && key === "s") {
        e.preventDefault();
        handleSaveAsPdf();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExporting, handleSaveAsPdf]);

  /* ---------------------------------------------------------
     RENDER
  --------------------------------------------------------- */
  return (
    <div className="app-container">
      <input
        type="file"
        accept="application/pdf"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (! file) return;
          await uploadAndExtract(file);
          e.target.value = "";
        }}
      />

      <TopBar
        openedFileName={openedFileName}
        hasDocument={hasDocument}
        onOpen={handleOpenFile}
        onClose={handleCloseFile}
        onSave={handleSave}
        onSaveAs={handleSaveAsPdf}
        onExit={handleExit}
        onUndo={handleUndo}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        currentPage={currentPage}
        pageCount={pageCount}
        isExporting={isExporting}
        pdfBytesLength={pdfBytes ?  pdfBytes.length : 0}
      />

      <div className="main-body">
        <LeftSidebar
          currentTool={currentTool}
          onToolChange={setCurrentTool}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          isExporting={isExporting}
          showDebugOverlay={showDebugOverlay}
          setShowDebugOverlay={setShowDebugOverlay}
        />

        <Workspace
          pdfViewerRef={pdfViewerRef}
          currentTool={currentTool}
          pdfBytes={pdfBytes}
          onPdfBytesChange={setPdfBytes}
          zoom={zoom}
          onPageInfo={setPageCount}
          onPageChange={setCurrentPage}
          isExporting={isExporting}
          currentPage={currentPage}
          pageCount={pageCount}
          blocks={blocks}
          showDebugOverlay={showDebugOverlay}
        />

        <RightSidebar
          currentTool={currentTool}
          onSaveAs={handleSaveAsPdf}
          hasDocument={hasDocument}
          canUseEraseActions={hasDocument && ! isExporting}
          isExporting={isExporting}
          exportProgress={exportProgress}
          currentPage={currentPage}
          pageCount={pageCount}
          onApplyEraseCurrentPage={handleApplyEraseCurrentPage}
          onApplyEraseAllPages={handleApplyEraseAllPages}
          onClearEraseCurrentPage={handleClearEraseCurrentPage}
          onClearEraseAllPages={handleClearEraseAllPages}
        />
      </div>
    </div>
  );
}