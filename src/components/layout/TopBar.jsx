import React, { useState, useEffect, useRef } from "react";

const TopBar = ({
  openedFileName,
  hasDocument,
  onOpen,
  onClose,
  onSave,
  onSaveAs,
  onExit,
  onUndo,
  onZoomIn,
  onZoomOut,
  onResetZoom,

  // NEW: Apply/Clear ERASE (backend redaction + local clear)
  onApplyEraseCurrentPage,
  onApplyEraseAllPages,
  onClearEraseCurrentPage,
  onClearEraseAllPages,

  // Page navigation
  onNextPage,
  onPrevPage,
  currentPage,
  pageCount,
  isExporting,
}) => {
  const [activeMenu, setActiveMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isFileOpen = Boolean(openedFileName) || hasDocument;
  // ...existing code...

  const menuConfig = {
    file: [
      { label: "Open File...", onClick: onOpen, disabled: isExporting },
      {
        label: "Close File",
        onClick: onClose,
        disabled: !isFileOpen || isExporting,
        color: !isFileOpen ? "#666" : "#ffb3b3",
      },
      { divider: true },
      {
        label: isExporting ? "Processing..." : "Save",
        onClick: onSave,
        disabled: !isFileOpen || isExporting,
      },
      {
        label: "Save As PDF...",
        onClick: onSaveAs,
        disabled: !isFileOpen || isExporting,
      },
      { divider: true },
      { label: "Exit Application", onClick: onExit, disabled: false, color: "#ff4d4d" },
    ],

    edit: [
      { label: "Undo Action (Esc)", onClick: onUndo, disabled: !isFileOpen || isExporting },

      { divider: true },

      // ✅ Multi-page ERASE -> backend redaction
      {
        label: "Apply ERASE (This Page)",
        onClick: onApplyEraseCurrentPage,
        disabled: !isFileOpen || isExporting,
      },
      {
        label: "Apply ERASE (All Pages)",
        onClick: () => {
          if (window.confirm("Apply ERASE redactions across ALL pages? This will permanently redact.")) {
            onApplyEraseAllPages?.();
          }
        },
        disabled: !isFileOpen || isExporting,
        color: "#ffd666",
      },

      { divider: true },

      // ✅ Clear local ERASE rectangles (does NOT restore already-applied backend redaction)
      {
        label: "Clear ERASE (This Page)",
        onClick: onClearEraseCurrentPage,
        disabled: !isFileOpen || isExporting,
      },
      {
        label: "Clear ERASE (All Pages)",
        onClick: () => {
          if (window.confirm("Clear ERASE rectangles for ALL pages (local preview only)?")) {
            onClearEraseAllPages?.();
          }
        },
        disabled: !isFileOpen || isExporting,
      },
    ],

    view: [
      { label: "Zoom In", onClick: onZoomIn, disabled: !isFileOpen || isExporting },
      { label: "Zoom Out", onClick: onZoomOut, disabled: !isFileOpen || isExporting },
      { label: "Reset Zoom", onClick: onResetZoom, disabled: !isFileOpen || isExporting },
      { divider: true },
      {
        label: "Next Page",
        onClick: onNextPage,
        disabled: !isFileOpen || isExporting || currentPage >= pageCount || pageCount === 0,
      },
      {
        label: "Previous Page",
        onClick: onPrevPage,
        disabled: !isFileOpen || isExporting || currentPage <= 1,
      },
    ],

    window: [
      {
        label: "Minimize",
        onClick: () => {
          if (window.pdfEditorNative?.minimize) {
            window.pdfEditorNative.minimize();
          }
        },
        disabled: false,
      },
      {
        label: "Toggle Full Screen",
        onClick: () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
              console.warn("Fullscreen request failed:", err);
            });
          } else if (document.exitFullscreen) {
            document.exitFullscreen().catch((err) => {
              console.warn("Exit fullscreen failed:", err);
            });
          }
        },
        disabled: false,
      },
    ],
  };

  const renderDropdown = (menuKey) => (
    <div style={styles.dropdown}>
      {menuConfig[menuKey].map((item, i) =>
        item.divider ? (
          <div key={`divider-${i}`} style={styles.divider} />
        ) : (
          <button
            key={`${menuKey}-${i}-${item.label}`}
            disabled={item.disabled}
            style={{
              ...styles.dropItem,
              color: item.color || "white",
              opacity: item.disabled ? 0.4 : 1,
              cursor: item.disabled ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.style.background = "#3a3a3a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
                setActiveMenu(null);
              }
            }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      {/* DEBUG: TopBar state */}
      <div style={{ color: "yellow", background: "#222", fontSize: 10, padding: 2 }}>
        TopBar: currentPage={currentPage} pageCount={pageCount}
        <span style={{ marginLeft: 12, color: "#00ff99" }}>
          [PDF bytes: {typeof pdfBytesLength === 'number' ? pdfBytesLength : 0}]
        </span>
      </div>

      <div style={styles.leftSection} ref={menuRef}>
        <div style={styles.logo}>🛡️ PDF Redactor Pro</div>
        {["file", "edit", "view", "window"].map((menuKey) => (
          <div key={menuKey} style={styles.menuWrapper}>
            <button
              disabled={isExporting && menuKey !== "window"}
              style={{
                ...styles.menuButton,
                backgroundColor: activeMenu === menuKey ? "#444" : "transparent",
                textTransform: "capitalize",
                opacity: isExporting && menuKey !== "window" ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!(isExporting && menuKey !== "window")) {
                  e.currentTarget.style.backgroundColor = "#444";
                }
              }}
              onMouseLeave={(e) => {
                if (activeMenu !== menuKey) e.currentTarget.style.backgroundColor = "transparent";
              }}
              onClick={() => {
                if (!(isExporting && menuKey !== "window")) {
                  setActiveMenu(activeMenu === menuKey ? null : menuKey);
                }
              }}
            >
              {menuKey}
            </button>
            {activeMenu === menuKey && renderDropdown(menuKey)}
          </div>
        ))}
      </div>

      {/* CENTER SECTION: NAVIGATION & FILENAME */}
      <div style={styles.centerSection}>
        {isFileOpen && !isExporting && pageCount > 0 && (
          <div style={styles.navControls}>
            <button
              onClick={onPrevPage}
              disabled={currentPage <= 1}
              style={{
                ...styles.navButton,
                opacity: currentPage <= 1 ? 0.4 : 1,
                cursor: "pointer",
              }}
              title={currentPage <= 1 ? "Go to first page" : "Go to previous page"}
              onMouseEnter={(e) => {
                if (currentPage > 1) e.currentTarget.style.background = "#444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#333";
              }}
            >
              ◀
            </button>

            <span style={styles.pageInfo}>
              PAGE {currentPage} / {pageCount}
            </span>

            <button
              onClick={onNextPage}
              disabled={currentPage >= pageCount}
              style={{
                ...styles.navButton,
                opacity: currentPage >= pageCount ? 0.4 : 1,
                cursor: currentPage >= pageCount ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (currentPage < pageCount) e.currentTarget.style.background = "#444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#333";
              }}
            >
              ▶
            </button>
          </div>
        )}

        <div style={styles.fileName}>
          {isExporting ? (
            <span style={{ color: "#3498db" }}>🔒 Securing & Applying Redactions...</span>
          ) : openedFileName ? (
            `📄 ${openedFileName}.pdf`
          ) : (
            "No file open"
          )}
        </div>
      </div>

      <div style={styles.rightSection}></div>
    </div>
  );
};

const styles = {
  container: {
    height: "45px",
    background: "#1e1e1e",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 15px",
    fontSize: "13px",
    zIndex: 1000,
    position: "relative",
    borderBottom: "1px solid #333",
    userSelect: "none",
  },
  leftSection: { display: "flex", alignItems: "center", gap: "5px" },
  logo: { fontWeight: "bold", color: "#3498db", marginRight: "15px", fontSize: "14px" },
  menuWrapper: { position: "relative" },
  menuButton: {
    background: "transparent",
    border: "none",
    color: "white",
    padding: "6px 12px",
    cursor: "pointer",
    borderRadius: "4px",
    fontSize: "13px",
    transition: "background-color 0.15s ease",
  },
  dropdown: {
    position: "absolute",
    top: "38px",
    left: "0",
    background: "#2d2d2d",
    borderRadius: "6px",
    minWidth: "220px",
    display: "flex",
    flexDirection: "column",
    padding: "6px 0",
    zIndex: 1001,
    border: "1px solid #444",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },
  dropItem: {
    background: "transparent",
    border: "none",
    color: "white",
    textAlign: "left",
    padding: "8px 16px",
    fontSize: "13px",
    width: "100%",
    transition: "background-color 0.15s ease",
  },
  divider: { height: "1px", background: "#444", margin: "4px 0" },
  centerSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  navControls: { display: "flex", alignItems: "center", gap: "10px" },
  navButton: {
    background: "#333",
    border: "1px solid #444",
    color: "white",
    borderRadius: "4px",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: "bold",
    transition: "all 0.15s ease",
  },
  pageInfo: {
    fontSize: "11px",
    fontWeight: "bold",
    color: "#3498db",
    minWidth: "90px",
    textAlign: "center",
    letterSpacing: "0.5px",
  },
  fileName: { color: "#888", fontSize: "12px", fontWeight: "500" },
  rightSection: { width: "150px" },
};

export default TopBar;
