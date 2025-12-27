import React from "react";
import styles from "./LeftSidebar.module.css";

function LeftSidebar({
  currentTool,
  onToolChange,
  onZoomIn,
  onZoomOut,
  isExporting,
  showDebugOverlay,
  setShowDebugOverlay,
}) {
  const tools = [
    { id: "ERASE", label: "Erase", sub: "Rect", icon: "\ud83e\uddfd", hotkey: "E" },
    { id: "REMOVE_TEXT", label: "Remove", sub: "Text", icon: "\u2702\ufe0f", hotkey: "T" },
    { id: "REMOVE_IMAGES", label: "Remove", sub: "Images", icon: "\ud83d\uddbc\ufe0f", hotkey: "I" },
    { id: "HAND", label: "Hand", sub: "Pan", icon: "\ud83e\udd1a", hotkey: "H" },
  ];

  const disabled = !!isExporting;

  return (
    <div
      className={styles.sidebar}
      style={{ pointerEvents: disabled ? "none" : "auto", opacity: disabled ? 0.6 : 1 }}
    >
      <div className={styles.sectionLabel}>Tools</div>

      {/* Debug overlay toggle */}
      <button
        type="button"
        onClick={() => setShowDebugOverlay((v) => !v)}
        disabled={disabled}
        title="Toggle debug overlay (block bounding boxes)"
        className={styles.toggleButton}
        style={{
          background: showDebugOverlay ? "#1a73e8" : "#f8f9fa",
          color: showDebugOverlay ? "#fff" : "#5f6368",
          borderColor: showDebugOverlay ? "#1a73e8" : "#dadce0",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{showDebugOverlay ? "\ud83d\udc41\ufe0f" : "\ud83d\udc41\ufe0f\u200d\ud83d\udde8\ufe0f"}</span>
        <span className={styles.toggleText}>{showDebugOverlay ? "Overlay ON" : "Overlay OFF"}</span>
      </button>

      <div className={styles.group}>
        {tools.map((tool) => {
          const active = currentTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onToolChange(tool.id)}
              title={`${tool.label} ${tool.sub} (${tool.hotkey})`}
              className={styles.toolButton}
              style={{
                background: active ? "#e8f0fe" : "#fff",
                borderColor: active ? "#1a73e8" : "#e8eaed",
                color: active ? "#1a73e8" : "#5f6368",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (disabled) return;
                if (!active) e.currentTarget.style.background = "#f8f9fa";
              }}
              onMouseLeave={(e) => {
                if (disabled) return;
                if (!active) e.currentTarget.style.background = "#fff";
              }}
            >
              {/* Left accent bar */}
              <span
                className={styles.accent}
                style={{ background: active ? "#1a73e8" : "transparent" }}
              />
              <div className={styles.toolInner}>
                <div className={styles.iconWrap}>
                  <span className={styles.icon}>{tool.icon}</span>
                </div>
                <div className={styles.textWrap}>
                  <div
                    className={styles.toolLabel}
                    style={{ color: active ? "#1a73e8" : "#202124" }}
                  >
                    {tool.label}
                  </div>
                  <div className={styles.toolSub}>{tool.sub}</div>
                  <div className={styles.hotkey}>{tool.hotkey}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.divider} />

      <div className={styles.sectionLabel}>View</div>

      <div className={styles.group}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onZoomIn()}
          title="Zoom In"
          className={styles.viewButton}
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.background = "#f8f9fa";
          }}
          onMouseLeave={(e) => {
            if (!disabled) e.currentTarget.style.background = "#fff";
          }}
        >
          <span className={styles.viewIcon}>＋</span>
          <span className={styles.viewText}>Zoom In</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onZoomOut()}
          title="Zoom Out"
          className={styles.viewButton}
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.background = "#f8f9fa";
          }}
          onMouseLeave={(e) => {
            if (!disabled) e.currentTarget.style.background = "#fff";
          }}
        >
          <span className={styles.viewIcon}>－</span>
          <span className={styles.viewText}>Zoom Out</span>
        </button>
      </div>
    </div>
  );
}

export default LeftSidebar;


