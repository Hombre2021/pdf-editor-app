import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import pdfjsLib from "../../utils/pdfWorkerConfig";

// Backend endpoints
const API_DELETE_MULTI = "http://localhost:8000/delete_multi/";

// Small expansion to catch OCR "halo" / anti-aliased edges
const OCR_PAD = 1.5;

function clampRect(r) {
  const x = Number(r?. x ??  0);
  const y = Number(r?.y ?? 0);
  const width = Number(r?.width ?? 0);
  const height = Number(r?.height ?? 0);
  if (
    ! Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function padRect(r, pad = OCR_PAD) {
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height:  r.height + pad * 2,
  };
}

const PdfViewer = forwardRef(function PdfViewer(
  {
    pdfBytes,
    onPdfBytesChange, // ✅ REQUIRED:  App must pass setPdfBytes here
    onPageInfo,
    onPageChange,
    zoom = 1,
    currentTool = "REMOVE_TEXT",
    currentPage = 1,
    showDebugOverlay = false,
  },
  ref
) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageCount, setPageCount] = useState(0);

  // Stored in PDF units (scale=1), per page: 
  // { [pageNum]: [{x,y,width,height}, ...] }
  const [eraseRectsByPage, setEraseRectsByPage] = useState({});
  const eraseRectsRef = useRef({});
  useEffect(() => {
    eraseRectsRef.current = eraseRectsByPage;
  }, [eraseRectsByPage]);

  // Current-page extracted objects for selection (PDF units, scale=1)
  const [pageObjects, setPageObjects] = useState([]); // [{type:'text'|'image', bbox:{x,y,width,height}, id}]
  const [selectedObject, setSelectedObject] = useState(null); // {type,bbox,id}
  const [hoveredObjectId, setHoveredObjectId] = useState(null);

  // Drawing state (ERASE)
  const [previewRect, setPreviewRect] = useState(null); // PDF units
  const drawingRef = useRef(false);
  const dragStartRef = useRef(null); // {x,y} in PDF units

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const renderTaskRef = useRef(null);

  const dpr = useMemo(() => window.devicePixelRatio || 1, []);

  // ---------------------------------------------------------
  // 1) LOAD PDF
  // ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (! pdfBytes || pdfBytes.length === 0) {
          setPdfDoc(null);
          setPageCount(0);
          onPageInfo?.(0);
          return;
        }

// ✅ CREATE TRUE COPY - pdf.js will transfer/detach the buffer
let dataCopy;
if (pdfBytes instanceof Uint8Array) {
  const newBuffer = new ArrayBuffer(pdfBytes.byteLength);
  dataCopy = new Uint8Array(newBuffer);
  dataCopy.set(pdfBytes);
} else {
  dataCopy = new Uint8Array(pdfBytes);
}

console.log("[DIAG][PdfViewer] Created dataCopy, byteLength:", dataCopy. byteLength);

        const loadingTask = pdfjsLib. getDocument({
          data: dataCopy,
          isEvalSupported: false,
          stopAtErrors: true,
        });

        const doc = await loadingTask.promise;
        if (cancelled) return;

        const n = doc.numPages || 0;
        setPdfDoc(doc);
        setPageCount(n);
        onPageInfo?.(n);

        // Normalize current page if it drifted out of range
        if (n > 0) {
          if (currentPage < 1 || currentPage > n) onPageChange?.(1);
        }
      } catch (err) {
        console.error("[PdfViewer] PDF Load Error:", err);
        setPdfDoc(null);
        setPageCount(0);
        onPageInfo?.(0);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // Intentionally depend only on pdfBytes to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes]);

  // ---------------------------------------------------------
  // Coordinate helpers
  //
  // Overlay is sized in device pixels but drawn in viewport units: 
  //  - ctx.scale(dpr, dpr)
  //  - so draw calls use CSS pixels (viewport units)
  //
  // Invariants:
  //  - Stored rects/objects are in PDF units @ scale=1
  //  - Rendering multiplies by zoom
  //  - Hit-testing divides by zoom
  // ---------------------------------------------------------
  const clientToViewport = useCallback(
    (clientX, clientY) => {
      const overlay = overlayRef.current;
      if (!overlay) return null;

      const rect = overlay.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      // overlay. width/height are device pixels; rect is CSS pixels
      const scaleX = overlay.width / rect.width;
      const scaleY = overlay. height / rect.height;

      // convert to device pixels, then to viewport units by dividing by dpr
      const vx = ((clientX - rect.left) * scaleX) / dpr;
      const vy = ((clientY - rect.top) * scaleY) / dpr;

      if (! Number.isFinite(vx) || !Number.isFinite(vy)) return null;
      return { vx, vy };
    },
    [dpr]
  );

  const viewportToPdf = useCallback(
    ({ vx, vy }) => {
      return { x: vx / zoom, y: vy / zoom };
    },
    [zoom]
  );

  // ---------------------------------------------------------
  // 2) Render current page + extract objects for current page only
  // ---------------------------------------------------------
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !overlayRef.current) return;

    // Cancel any in-flight render
    try {
      renderTaskRef.current?. cancel?. ();
    } catch (_) {}

    try {
      const page = await pdfDoc.getPage(currentPage);

      // Render at current zoom
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // Main canvas (device pixels)
      canvas.width = Math.ceil(viewport.width * dpr);
      canvas.height = Math.ceil(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);

      // Overlay matches main canvas exactly
      overlay.width = canvas. width;
      overlay.height = canvas.height;
      overlay.style.width = canvas.style.width;
      overlay.style.height = canvas.style.height;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;

      // Extract objects at scale=1 (PDF units)
      // Important: We keep everything in the same coordinate orientation
      // as the canvas:  origin top-left, y down (matches PyMuPDF page coords).
      const textContent = await page.getTextContent();

      const textObjs = (textContent.items || [])
        .map((item, idx) => {
          // Approx bbox in "canvas-like" coordinates: 
          // x = e, yTop = f - height
          const x = item.transform?.[4];
          const yTop = (item.transform?.[5] ??  0) - (item.height ?? 0);
          const w = item.width ?? 0;
          const h = item. height ?? 0;

          const bbox = clampRect({ x, y: yTop, width: w, height: h });
          if (! bbox) return null;

          return {
            type: "text",
            id: `t-${currentPage}-${idx}`,
            bbox,
            content: item.str,
          };
        })
        .filter(Boolean);

      const opList = await page.getOperatorList();
      const imageObjs = [];
      for (let j = 0; j < opList.fnArray.length; j++) {
        const fn = opList.fnArray[j];
        if (
          fn === pdfjsLib.OPS.paintImageXObject ||
          fn === pdfjsLib.OPS.paintJpegXObject
        ) {
          const args = opList.argsArray[j];
          const matrix = args?.[1];
          if (! matrix || matrix.length < 6) continue;

          // Matrix is [a,b,c,d,e,f].  Approx width/height from |a|, |d|. 
          // Use top-left-ish y = f - h (canvas coords).
          const w = Math.abs(matrix[0]);
          const h = Math.abs(matrix[3]);
          const x = matrix[4];
          const yTop = matrix[5] - h;

          const bbox = clampRect({ x, y: yTop, width: w, height: h });
          if (!bbox) continue;

          imageObjs.push({
            type: "image",
            id: `i-${currentPage}-${j}`,
            bbox,
          });
        }
      }

      setPageObjects([...textObjs, ...imageObjs]);
      setHoveredObjectId(null);
      setSelectedObject(null);
      // Overlay redraw is handled by effects
    } catch (err) {
      if (err?. name !== "RenderingCancelledException") {
        console.error("[PdfViewer] Render error:", err);
      }
    }
  }, [pdfDoc, currentPage, zoom, dpr]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // ---------------------------------------------------------
  // 3) Draw overlay
  // ---------------------------------------------------------
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Draw in viewport units (CSS px), so scale by dpr
    ctx.save();
    ctx.scale(dpr, dpr);

    // A) ERASE rectangles (stored in PDF units => multiply by zoom)
    const rects = eraseRectsRef.current?.[currentPage] || [];
    ctx.fillStyle = "rgba(255,255,255,1)";
    rects.forEach((r) => {
      const rr = clampRect(r);
      if (! rr) return;
      ctx.fillRect(rr.x * zoom, rr.y * zoom, rr.width * zoom, rr.height * zoom);
    });

    // Preview rect (during draw)
    if (previewRect) {
      const pr = clampRect(previewRect);
      if (pr) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(pr.x * zoom, pr.y * zoom, pr.width * zoom, pr.height * zoom);
        ctx.strokeStyle = "rgba(120,120,120,0.8)";
        ctx.lineWidth = 2;
        ctx. setLineDash([6, 4]);
        ctx.strokeRect(pr.x * zoom, pr.y * zoom, pr.width * zoom, pr.height * zoom);
      }
    }

    // B) Debug overlay:  extracted objects
    if (showDebugOverlay) {
      pageObjects.forEach((obj) => {
        const b = obj.bbox;
        ctx.save();
        ctx.strokeStyle = obj.type === "text" ? "#ff00ff" : "#00c2ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(b.x * zoom, b.y * zoom, b.width * zoom, b.height * zoom);
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = obj.type === "text" ? "#ff00ff" :  "#00c2ff";
        ctx.fillText(obj.id, b.x * zoom + 2, b.y * zoom + 12);
        ctx.restore();
      });
    }

    // C) Hover highlight
    if (hoveredObjectId) {
      const obj = pageObjects.find((o) => o.id === hoveredObjectId);
      if (obj) {
        const b = obj.bbox;
        ctx.save();
        ctx.strokeStyle = obj.type === "text" ? "#ffe066" : "#8fd3ff";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(b.x * zoom, b.y * zoom, b.width * zoom, b.height * zoom);
        ctx.restore();
      }
    }

    // D) Selected highlight
    if (selectedObject) {
      const b = selectedObject. bbox;
      ctx.save();
      ctx.strokeStyle = selectedObject.type === "text" ?  "#ff4d4d" : "#3498db";
      ctx.lineWidth = 3;
      ctx. setLineDash([8, 5]);
      ctx.strokeRect(b.x * zoom, b. y * zoom, b.width * zoom, b.height * zoom);
      ctx.restore();
    }

    ctx.restore();
  }, [
    dpr,
    zoom,
    currentPage,
    pageObjects,
    previewRect,
    selectedObject,
    hoveredObjectId,
    showDebugOverlay,
  ]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // ---------------------------------------------------------
  // 4) Hit-testing objects (PDF units)
  // ---------------------------------------------------------
  const hitTestObject = useCallback(
    (pdfX, pdfY) => {
      for (let i = pageObjects.length - 1; i >= 0; i--) {
        const obj = pageObjects[i];
        const b = obj.bbox;
        const hit =
          pdfX >= b. x &&
          pdfX <= b.x + b.width &&
          pdfY >= b. y &&
          pdfY <= b.y + b.height;
        if (! hit) continue;

        if (currentTool === "REMOVE_TEXT" && obj.type !== "text") continue;
        if (currentTool === "REMOVE_IMAGES" && obj.type !== "image") continue;

        return obj;
      }
      return null;
    },
    [pageObjects, currentTool]
  );

  // ---------------------------------------------------------
  // 5) Mouse interaction (single path)
  // ---------------------------------------------------------
  const handleOverlayMouseDown = useCallback(
    (e) => {
      if (!overlayRef.current) return;

      // ERASE:  start drawing
      if (currentTool === "ERASE") {
        const vp = clientToViewport(e. clientX, e.clientY);
        if (! vp) return;
        const p = viewportToPdf(vp);

        drawingRef.current = true;
        dragStartRef.current = p;
        setPreviewRect(null);

        const onMove = (ev) => {
          if (!drawingRef.current) return;
          const vp2 = clientToViewport(ev.clientX, ev.clientY);
          if (!vp2) return;
          const p2 = viewportToPdf(vp2);

          const x = Math.min(p.x, p2.x);
          const y = Math.min(p.y, p2.y);
          const width = Math.abs(p2.x - p.x);
          const height = Math.abs(p2.y - p.y);

          setPreviewRect({ x, y, width, height });
        };

        const onUp = (ev) => {
          drawingRef.current = false;

          const vp2 = clientToViewport(ev.clientX, ev.clientY);
          const p2 = vp2 ?  viewportToPdf(vp2) : null;

          const start = dragStartRef.current;
          dragStartRef.current = null;

          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);

          setPreviewRect(null);

          if (! start || !p2) return;

          const x = Math.min(start.x, p2.x);
          const y = Math.min(start.y, p2.y);
          const width = Math.abs(p2.x - start. x);
          const height = Math.abs(p2.y - start.y);

          const rect = clampRect({ x, y, width, height });
          if (! rect || rect.width < 2 / zoom || rect.height < 2 / zoom) return;

          setEraseRectsByPage((prev) => {
            const next = { ...prev };
            const arr = Array.isArray(next[currentPage]) ? [...next[currentPage]] : [];
            arr. push(rect);
            next[currentPage] = arr;
            return next;
          });
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      // REMOVE_TEXT / REMOVE_IMAGES: click selects
      if (currentTool === "REMOVE_TEXT" || currentTool === "REMOVE_IMAGES") {
        const vp = clientToViewport(e.clientX, e.clientY);
        if (!vp) return;
        const p = viewportToPdf(vp);

        const obj = hitTestObject(p.x, p.y);
        setSelectedObject(obj);
        // overlay redraw happens via effect
      }
    },
    [currentTool, currentPage, clientToViewport, viewportToPdf, hitTestObject, zoom]
  );
  const handleOverlayMouseMove = useCallback(
    (e) => {
      if (!(currentTool === "REMOVE_TEXT" || currentTool === "REMOVE_IMAGES")) return;

      const vp = clientToViewport(e.clientX, e.clientY);
      if (!vp) return;
      const p = viewportToPdf(vp);

      const obj = hitTestObject(p. x, p.y);
      const nextHover = obj ? obj.id : null;

      setHoveredObjectId((prev) => (prev === nextHover ? prev : nextHover));
    },
    [currentTool, clientToViewport, viewportToPdf, hitTestObject]
  );

  // Clear hover when leaving selection tools
  useEffect(() => {
    if (!(currentTool === "REMOVE_TEXT" || currentTool === "REMOVE_IMAGES")) {
      setHoveredObjectId(null);
    }
  }, [currentTool]);

  // ---------------------------------------------------------
  // 6) Backend call (page -> rects)
  // ---------------------------------------------------------
  const postDeleteMulti = useCallback(
    async (pagesToRects) => {
      if (!pdfBytes || ! onPdfBytesChange) {
        console.warn("[PdfViewer] Missing pdfBytes or onPdfBytesChange");
        return;
      }

      const formData = new FormData();
      const fileBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const payloadStr = JSON.stringify({ pages: pagesToRects });
      formData.append("file", fileBlob, "document. pdf");
      formData.append("payload", payloadStr);

      // Diagnostic logging for outgoing request
      console.log("[DIAG][PdfViewer] Calling /delete_multi/", {
        fileSize: fileBlob.size,
        payload: payloadStr,
      });

     const res = await fetch(API_DELETE_MULTI, { method: "POST", body: formData });
if (!res.ok) {
  const text = await res.text().catch(() => "");
  console.error(`[DIAG][PdfViewer] /delete_multi/ failed:   ${res.status} - ${text}`);
  throw new Error(text || `Backend error (${res.status})`);
}

const arrayBuffer = await res.arrayBuffer();
const out = new Uint8Array(arrayBuffer);

// Diagnostic logging for backend response
console.log(`[DIAG][PdfViewer] Backend response - ArrayBuffer length: ${arrayBuffer.byteLength}, Uint8Array length: ${out. length}`);

if (! out || out.length === 0) {
  console.error("[DIAG][PdfViewer] Backend returned empty PDF bytes after edit.");
  alert("Backend returned an empty PDF.   Check backend logs.");
  return;
}

// Verify PDF header
const header = String.fromCharCode(...out.slice(0, 5));
if (! header.startsWith("%PDF-")) {
  console.error(`[DIAG][PdfViewer] Backend response is not a valid PDF.   Header: "${header}"`);
  alert("Backend returned invalid PDF data.");
  return;
}

console.log(`[DIAG][PdfViewer] Calling onPdfBytesChange with ${out.length} bytes`);
    onPdfBytesChange(out);
  }, [pdfBytes, onPdfBytesChange]);
  // ---------------------------------------------------------
  // 7) Delete key deletes selected object by RECT (page + bbox)
  // ---------------------------------------------------------
  useEffect(() => {
    const onKeyDown = async (e) => {
      if (e.key !== "Delete") return;
      if (!selectedObject) return;
      if (!(currentTool === "REMOVE_TEXT" || currentTool === "REMOVE_IMAGES")) return;

      try {
        const b = padRect(selectedObject.bbox, OCR_PAD);
        const pages = {
          [String(currentPage)]: [[b.x, b.y, b.width, b.height]],
        };
        console.log(`[DIAG][PdfViewer] Delete key pressed for ${currentTool} on page ${currentPage}: `, pages);
        await postDeleteMulti(pages);
        setSelectedObject(null);
      } catch (err) {
        console.error("[PdfViewer] Delete failed:", err);
        alert("Delete failed: " + (err?.message || String(err)));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedObject, currentTool, currentPage, postDeleteMulti]);

  // ---------------------------------------------------------
  // 8) Imperative API for App/Sidebar
// ---------------------------------------------------------
const applyEraseCurrentPage = useCallback(async () => {
  const rects = eraseRectsRef.current?.[currentPage] || [];
  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Called`);
  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Current page: ${currentPage}`);
  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Erase rects for page ${currentPage}:`, rects);
  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Number of rects: ${rects. length}`);
  
  if (! rects.length) {
    alert("No ERASE rectangles on this page.");
    return;
  }

  // ✅ FIX:  Get the current page dimensions and scale
  const page = await pdfDocRef.current?.getPage(currentPage);
  if (!page) {
    alert("Could not get page information");
    return;
  }

  const viewport = page.getViewport({ scale: 1.0 }); // Get base viewport at scale 1
  const pdfWidth = viewport.width;
  const pdfHeight = viewport.height;

  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] PDF dimensions: ${pdfWidth} x ${pdfHeight}`);
  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Current canvas scale: ${zoom}`);

  const payloadRects = rects
    .map(clampRect)
    .filter(Boolean)
    .map((r) => {
      // ✅ FIX: Convert canvas coordinates to PDF coordinates
      const pdfX = r.x / zoom;
      const pdfY = r.y / zoom;
      const pdfWidth = r.width / zoom;
      const pdfHeight = r.height / zoom;

      console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Canvas rect: `, r);
      console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] PDF rect:`, { x: pdfX, y:  pdfY, width: pdfWidth, height: pdfHeight });

      const pr = padRect({ x: pdfX, y:  pdfY, width: pdfWidth, height: pdfHeight }, OCR_PAD);
      return [pr.x, pr. y, pr.width, pr. height];
    });

  console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Payload rects after processing:`, payloadRects);

  try {
    const payload = { pages: { [String(currentPage)]: payloadRects } };
    console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] Calling postDeleteMulti with payload:`, JSON.stringify(payload));
    
    await postDeleteMulti(payload);

    console.log(`[DIAG][PdfViewer][applyEraseCurrentPage] postDeleteMulti completed successfully`);

    setEraseRectsByPage((prev) => {
      const next = { ...prev };
      next[currentPage] = [];
      return next;
    });
  } catch (err) {
    console.error("[PdfViewer][applyEraseCurrentPage] failed:", err);
    alert("Apply ERASE (page) failed: " + (err?.message || String(err)));
  }
}, [currentPage, postDeleteMulti, zoom]);

const clearEraseCurrentPage = useCallback(() => {
  console.log(`[DIAG][PdfViewer][clearEraseCurrentPage] Clearing erase rects for page ${currentPage}`);
  setEraseRectsByPage((prev) => {
    const next = { ... prev };
    next[currentPage] = [];
    return next;
  });
}, [currentPage]);

const clearEraseAllPages = useCallback(() => {
  console.log(`[DIAG][PdfViewer][clearEraseAllPages] Clearing all erase rects`);
  setEraseRectsByPage({});
}, []);

const undoErase = useCallback(() => {
  console.log(`[DIAG][PdfViewer][undoErase] Undoing last erase rect on page ${currentPage}`);
  setEraseRectsByPage((prev) => {
    const next = { ...prev };
    const arr = Array.isArray(next[currentPage]) ? [...next[currentPage]] : [];
    console.log(`[DIAG][PdfViewer][undoErase] Current rects before undo:`, arr.length);
    arr.pop();
    console.log(`[DIAG][PdfViewer][undoErase] Current rects after undo:`, arr. length);
    next[currentPage] = arr;
    return next;
  });
}, [currentPage]);


// Placeholder for applyEraseAllPages
const applyEraseAllPages = useCallback(() => {
  // TODO: Implement erase logic for all pages
  console.log('[PdfViewer] applyEraseAllPages called');
}, []);

useImperativeHandle(
  ref,
  () => ({
    nextPage: () => {
      if (onPageChange && currentPage < pageCount) onPageChange(currentPage + 1);
    },
    prevPage: () => {
      if (onPageChange && currentPage > 1) onPageChange(currentPage - 1);
    },

    // Undo ERASE rectangle (Esc)
    undo: undoErase,

    // ERASE actions
    applyEraseCurrentPage,
    applyEraseAllPages,
    clearEraseCurrentPage,
    clearEraseAllPages,
  }),
  [
    onPageChange,
    currentPage,
    pageCount,
    undoErase,
    applyEraseCurrentPage,
    applyEraseAllPages,
    clearEraseCurrentPage,
    clearEraseAllPages,
  ]
);

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------
  if (showDebugOverlay) {
    console.log('[DIAG][PdfViewer] Rendering overlay blocks:', pageObjects);
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px",
    }}>
      <div style={{
        position: "relative",
        background: "white",
        boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
      }}>
        <canvas ref={canvasRef} />
        <canvas
          ref={overlayRef}
          onMouseDown={handleOverlayMouseDown}
          onMouseMove={handleOverlayMouseMove}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
            cursor:
              currentTool === "ERASE"
                ? "crosshair"
                : currentTool === "HAND"
                ? "grab"
                : currentTool === "REMOVE_TEXT" || currentTool === "REMOVE_IMAGES"
                ? "default"
                : "default",
          }}
        />
        {(currentTool === "REMOVE_TEXT" || currentTool === "REMOVE_IMAGES") && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: currentTool === "REMOVE_TEXT" ? "#fffbe6" : "#e6f7ff",
              color: "#333",
              padding: "8px 16px",
              borderRadius: 6,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              fontWeight: 600,
              fontSize: 14,
              pointerEvents: "none",
            }}
          >
            {selectedObject
              ? `Selected ${selectedObject.type}.  Press Delete to remove.`
              : `Click a ${currentTool === "REMOVE_TEXT" ? "text" : "image"} block to select, then press Delete. `}
          </div>
        )}
      </div>
    </div>
  );
});

export default PdfViewer;