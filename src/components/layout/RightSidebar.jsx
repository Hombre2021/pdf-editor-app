import React from "react";

function RightSidebar({
  currentTool,
  onSaveAs,
  canUseEraseActions,
  hasDocument,
  isExporting,
  onApplyEraseCurrentPage,
  onApplyEraseAllPages,
  onClearEraseCurrentPage,
  onClearEraseAllPages,
  currentPage,
  pageCount,
  exportProgress,
}) {
  console.log('[DIAG][RightSidebar] Save/Download button enabled:', canUseEraseActions, 'hasDocument:', hasDocument, 'isExporting:', isExporting);
  
  const isNative = !!window.pdfEditorNative?. isNative;

  // Helper to get tool-specific descriptions
  const getToolDescription = () => {
    switch (currentTool) {
      case "ERASE":
        return {
          title: "Redaction Tool (E)",
          desc: 
            "Click and drag to mark redaction regions. Use Apply to permanently redact via backend.  Press Esc to undo the last rectangle.",
        };
      case "REMOVE_TEXT":
        return {
          title: "Remove Text (T)",
          desc:
            "Click a text block to select it, then press Delete to permanently remove it via backend redaction.",
        };
      case "REMOVE_IMAGES":
        return {
          title: "Remove Images (I)",
          desc:
            "Click an image block to select it, then press Delete to permanently remove it via backend redaction.",
        };
      case "HAND": 
        return {
          title:  "Hand Tool (H)",
          desc:
            "Click and drag the workspace to move the document view around. Use this to navigate large documents.",
        };
      default:
        return {
          title: "No Tool Selected",
          desc: "Select a tool from the left sidebar to begin editing your PDF document.",
        };
    }
  };

  const toolInfo = getToolDescription();
  const showEraseCard = currentTool === "ERASE";

  return (
    <div style={styles.sidebar}>
      <div style={styles.topSection}>
        <h4 style={styles.header}>Properties</h4>

        <div style={styles.propertyCard}>
          <p style={styles.toolTitle}>
            <strong>{toolInfo.title}</strong>
          </p>
          <p style={styles.toolDesc}>{toolInfo.desc}</p>
        </div>

        {/* ERASE actions (only when ERASE tool is active) */}
        {showEraseCard && (
          <div style={styles.card}>
            <p style={styles.cardHeader}>ERASE Actions</p>

            <button
              disabled={!canUseEraseActions}
              style={{
                ...styles.secondaryButton,
                opacity: canUseEraseActions ? 1 : 0.6,
                cursor: canUseEraseActions ? "pointer" : "not-allowed",
              }}
              onClick={() => onApplyEraseCurrentPage?. ()}
              title="Apply ERASE rectangles on the current page (permanent backend redaction)"
            >
              ✅ Apply ERASE (This Page{typeof currentPage === "number" ? `: ${currentPage}` : ""})
            </button>

            <button
              disabled={!canUseEraseActions}
              style={{
                ...styles.dangerButton,
                opacity: canUseEraseActions ? 1 : 0.6,
                cursor: canUseEraseActions ? "pointer" : "not-allowed",
              }}
              onClick={() => {
                const ok = window.confirm(
                  "Apply ERASE redactions across ALL pages?  This is permanent."
                );
                if (ok) onApplyEraseAllPages?. ();
              }}
              title="Apply ERASE rectangles across all pages (permanent backend redaction)"
            >
              ✅ Apply ERASE (All Pages
              {typeof pageCount === "number" && pageCount > 0 ? `: ${pageCount}` : ""})
            </button>

            <div style={styles.divider} />

            <button
              disabled={!canUseEraseActions}
              style={{
                ... styles.secondaryButton,
                opacity: canUseEraseActions ? 1 : 0.6,
                cursor: canUseEraseActions ? "pointer" : "not-allowed",
              }}
              onClick={() => onClearEraseCurrentPage?.()}
              title="Clear ERASE rectangles from the current page (local preview only)"
            >
              🧹 Clear ERASE (This Page)
            </button>

            <button
              disabled={!canUseEraseActions}
              style={{
                ...styles.secondaryButton,
                opacity: canUseEraseActions ? 1 : 0.6,
                cursor: canUseEraseActions ? "pointer" : "not-allowed",
              }}
              onClick={() => {
                const ok = window.confirm(
                  "Clear ERASE rectangles for ALL pages? (This does not undo already-applied redactions. )"
                );
                if (ok) onClearEraseAllPages?.();
              }}
              title="Clear ERASE rectangles from all pages (local preview only)"
            >
              🧹 Clear ERASE (All Pages)
            </button>

            <p style={styles.note}>
              Tip:  ERASE rectangles are only permanent after you click Apply. 
            </p>
          </div>
        )}

        {/* Keyboard Shortcuts Reference */}
        <div style={styles.shortcutsCard}>
          <p style={styles.shortcutsHeader}>Keyboard Shortcuts</p>
          <div style={styles.shortcutRow}>
            <kbd style={styles.kbd}>E</kbd>
            <span style={styles.shortcutLabel}>Redact Tool</span>
          </div>
          <div style={styles. shortcutRow}>
            <kbd style={styles.kbd}>T</kbd>
            <span style={styles.shortcutLabel}>Remove Text</span>
          </div>
          <div style={styles.shortcutRow}>
            <kbd style={styles.kbd}>I</kbd>
            <span style={styles.shortcutLabel}>Remove Images</span>
          </div>
          <div style={styles.shortcutRow}>
            <kbd style={styles.kbd}>H</kbd>
            <span style={styles.shortcutLabel}>Hand Tool</span>
          </div>
          <div style={styles.shortcutRow}>
            <kbd style={styles.kbd}>Esc</kbd>
            <span style={styles.shortcutLabel}>Undo Last (ERASE)</span>
          </div>
          <div style={styles.shortcutRow}>
            <kbd style={styles.kbd}>Ctrl+S</kbd>
            <span style={styles.shortcutLabel}>Save PDF</span>
          </div>
          <div style={styles.shortcutRow}>
            <kbd style={styles.kbd}>Del</kbd>
            <span style={styles.shortcutLabel}>Delete Selected (Text/Image)</span>
          </div>
        </div>
      </div>

      <div style={styles.bottomSection}>
        {/* EXPORTING FEEDBACK */}
        {isExporting && (
          <div style={styles.progressWrapper}>
            <div style={styles.progressText}>
              <span>
                {exportProgress < 40
                  ? "📸 Capturing Pages..."
                  : exportProgress < 80
                  ? "🏗️ Building PDF..."
                  : "✅ Finalizing...  "}
              </span>
              {exportProgress > 0 && (
                <span style={styles.progressPercent}>{exportProgress}%</span>
              )}
            </div>
            <div style={styles.progressBarBg}>
              <div
                style={{
                  ... styles.progressBarFill,
                  width: exportProgress > 0 ? `${exportProgress}%` : "40%",
                  animation: 
                    exportProgress === 0 ? "pulse 1.5s infinite ease-in-out" : "none",
                }}
              />
            </div>
            <p style={styles.progressHint}>Please wait, do not close the application... </p>
          </div>
        )}

        <button
          onClick={onSaveAs}
          disabled={isExporting || !hasDocument}
          style={{
            ...styles.actionButton,
            background: isExporting || !hasDocument ? "#999" : "#1a73e8",
            cursor: isExporting || !hasDocument ? "not-allowed" : "pointer",
            opacity: isExporting || !hasDocument ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (! isExporting && hasDocument) {
              e.currentTarget.style.background = "#1557b0";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(26,115,232,0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isExporting && hasDocument) {
              e.currentTarget.style. background = "#1a73e8";
              e.currentTarget. style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }
          }}
        >
          {isExporting
            ? "⏳ Exporting..."
            : `💾 ${isNative ? "Export to PC" : "Download PDF"}`}
        </button>

        <p style={styles.disclaimer}>
          ⚠️ Redactions are permanent once applied on the backend.  Exporting saves the current PDF bytes. 
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; transform: translateX(-100%); }
          50% { opacity: 1; transform: translateX(0%); }
          100% { opacity: 0.6; transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 260,
    background: "#ffffff",
    borderLeft: "1px solid #e0e0e0",
    padding: "20px 15px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    fontFamily: "system-ui, sans-serif",
    zIndex: 10,
    overflowY: "auto",
  },
  topSection: { flex: 1, overflowY: "auto" },
  header: {
    marginTop: 0,
    color: "#5f6368",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: "15px",
    fontWeight: "700",
  },
  propertyCard: {
    padding: "15px",
    background: "#f8f9fa",
    border:  "1px solid #e8eaed",
    borderRadius:  10,
    marginBottom: 15,
  },
  toolTitle: { margin: "0 0 8px 0", fontSize: 14, color: "#202124" },
  toolDesc:  { margin: 0, fontSize: 12, color: "#5f6368", lineHeight: 1.5 },

  card: {
    padding: "12px 15px",
    background: "#fff",
    border: "1px solid #e8eaed",
    borderRadius: 10,
    marginBottom: 15,
  },
  cardHeader: {
    margin: "0 0 10px 0",
    fontSize: 11,
    color: "#5f6368",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: "700",
  },
  secondaryButton: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #dadce0",
    background: "#f8f9fa",
    fontSize: 12,
    fontWeight: 700,
    color: "#202124",
    marginBottom: 8,
    transition: "all 0.15s ease",
  },
  dangerButton: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #f1b7b7",
    background: "#fff5f5",
    fontSize: 12,
    fontWeight: 800,
    color: "#b42318",
    marginBottom: 8,
    transition: "all 0.15s ease",
  },
  divider: { height: 1, background: "#e8eaed", margin: "8px 0" },
  note: {
    margin: "6px 0 0 0",
    fontSize:  10,
    color: "#9aa0a6",
    lineHeight: 1.4,
    textAlign: "center",
  },

  shortcutsCard: {
    padding: "12px 15px",
    background: "#fff",
    border:  "1px solid #e8eaed",
    borderRadius:  10,
  },
  shortcutsHeader: {
    margin: "0 0 10px 0",
    fontSize: 11,
    color: "#5f6368",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: "700",
  },
  shortcutRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  kbd: {
    display: "inline-block",
    padding: "3px 7px",
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "600",
    color: "#202124",
    background: "#f1f3f4",
    border: "1px solid #dadce0",
    borderRadius:  4,
    minWidth: 30,
    textAlign: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  shortcutLabel: { fontSize: 12, color: "#5f6368" },

  bottomSection: { marginBottom: 10, paddingTop: 15, borderTop: "1px solid #e8eaed" },
  progressWrapper: {
    marginBottom: 20,
    padding: "12px",
    background: "#f8f9fa",
    borderRadius: 8,
    border: "1px solid #e8eaed",
  },
  progressText: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    marginBottom: 10,
    color: "#1a73e8",
    fontWeight: "600",
  },
  progressPercent: { fontFamily: "monospace", fontSize: 13 },
  progressBarBg:  {
    width: "100%",
    height: 8,
    background: "#e8eaed",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  progressBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, #1a73e8, #4285f4)",
    transition: "width 0.3s ease",
    borderRadius: 4,
  },
  progressHint: {
    margin: "8px 0 0 0",
    fontSize: 10,
    color: "#9aa0a6",
    fontStyle: "italic",
    textAlign: "center",
  },
  actionButton: {
    width:  "100%",
    padding:  "14px",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: "600",
    transition: "all 0.2s ease",
  },
  disclaimer: {
    textAlign: "center",
    fontSize: 10,
    color: "#9aa0a6",
    marginTop: 12,
    lineHeight: 1.4,
  },
};

export default RightSidebar;