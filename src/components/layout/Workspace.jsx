import React, { useRef, useEffect, useCallback } from "react";
import PdfViewer from "../PdfViewer/PdfViewer";

export default function Workspace({
  pdfViewerRef,
  currentTool,
  pdfBytes,
  zoom,

  // Page plumbing
  onPageInfo,
  onPageChange,
  isExporting,
  currentPage,
  pageCount,

  // Backend bytes plumbing (NEW)
  onPdfBytesChange,

  // Selection callback
  onSelectedObjectChange,

  showDebugOverlay,
}) {
  const scrollContainerRef = useRef(null);
  const isNative = !!window.pdfEditorNative?.isNative;

  // ---------------------------------------------------------
  // Center the document when a new PDF loads
  // ---------------------------------------------------------
  useEffect(() => {
    if (!pdfBytes || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const t = setTimeout(() => {
      container.scrollTop = container.scrollHeight / 2 - container.clientHeight / 2;
      container.scrollLeft = container.scrollWidth / 2 - container.clientWidth / 2;
    }, 50);

    return () => clearTimeout(t);
  }, [pdfBytes]);

  // ---------------------------------------------------------
  // DRAG-TO-SCROLL (Hand Tool)
  // ---------------------------------------------------------
  const handleMouseDown = useCallback(
    (e) => {
      if (currentTool !== "HAND" || isExporting) return;

      const slider = scrollContainerRef.current;
      if (!slider) return;

      const startX = e.pageX - slider.offsetLeft;
      const startY = e.pageY - slider.offsetTop;
      const scrollLeft = slider.scrollLeft;
      const scrollTop = slider.scrollTop;

      const onMouseMove = (moveEvent) => {
        moveEvent.preventDefault();
        const x = moveEvent.pageX - slider.offsetLeft;
        const y = moveEvent.pageY - slider.offsetTop;

        slider.scrollLeft = scrollLeft - (x - startX);
        slider.scrollTop = scrollTop - (y - startY);
      };

      const onMouseUp = () => {
        slider.style.cursor = isExporting ? "wait" : "grab";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      slider.style.cursor = "grabbing";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [currentTool, isExporting]
  );

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div
      ref={scrollContainerRef}
      onMouseDown={handleMouseDown}
      className="workspace-area"
      style={{
        flex: 1,
        overflow: isExporting ? "hidden" : "auto",
        background: "#525659",
        position: "relative",
        cursor: isExporting ? "wait" : currentTool === "HAND" ? "grab" : "default",
        display: "block",
        userSelect: "none",
      }}
    >
      {pdfBytes ? (
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "100vh 100vw",
            minWidth: "fit-content",
            opacity: isExporting ? 0.8 : 1,
            transition: "opacity 0.3s ease",
            pointerEvents: isExporting ? "none" : "auto",
          }}
        >
          <PdfViewer
            ref={pdfViewerRef}
            currentTool={currentTool}
            pdfBytes={pdfBytes}
            onPdfBytesChange={onPdfBytesChange} // ✅ critical: apply backend-returned PDF
            zoom={zoom}
            onPageInfo={onPageInfo}
            onPageChange={onPageChange}
            currentPage={currentPage}
            showDebugOverlay={showDebugOverlay}
            onSelectedObjectChange={onSelectedObjectChange}
          />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            width: "100%",
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "60px",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              border: "1px solid #ddd",
              maxWidth: "400px",
            }}
          >
            <div style={{ fontSize: "50px", marginBottom: "16px" }}>📄</div>
            <h3
              style={{
                margin: "0 0 12px 0",
                color: "#202124",
                fontFamily: "system-ui",
                fontSize: "20px",
              }}
            >
              Ready to Redact
            </h3>
            <p
              style={{
                color: "#5f6368",
                fontFamily: "system-ui, sans-serif",
                fontSize: "15px",
                lineHeight: "1.6",
                margin: 0,
              }}
            >
              {isNative
                ? "Use the File menu or the Open button to select a secure PDF document."
                : "Click the Open button in the top bar to select a PDF document."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
