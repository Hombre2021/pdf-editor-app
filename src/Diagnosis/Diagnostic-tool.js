// --- Save/Export Error Diagnostics ---
export function logSaveError(message, pdfBytes) {
  console.error(`[DIAG][SAVE ERROR] ${message}`);
  logPdfBytesState(pdfBytes);
}
// --- Diagnostic Logging Utilities ---
export function logToolChange(tool) {
  console.log(`[DIAG] Tool changed: ${tool}`);
}

export function logBlockClick(block, tool) {
  if (!block) {
    console.warn(`[DIAG] Block click: No block found (tool: ${tool})`);
    return;
  }
  console.log(`[DIAG] Block clicked:`, block, `with tool: ${tool}`);
}

export function logApiRequest(endpoint, payload) {
  console.log(`[DIAG] API Request to ${endpoint}:`, payload);
}

export function logApiResponse(endpoint, response, error) {
  if (error) {
    console.error(`[DIAG] API Response from ${endpoint}: ERROR`, error);
  } else {
    console.log(`[DIAG] API Response from ${endpoint}:`, response);
  }
}

// --- App State Diagnostics ---
export function logPdfBytesState(pdfBytes) {
  if (!pdfBytes) {
    console.warn('[DIAG] pdfBytes is null or undefined');
    return;
  }
  if (pdfBytes instanceof Uint8Array) {
    console.log(`[DIAG] pdfBytes: Uint8Array, length=${pdfBytes.length}`);
  } else if (pdfBytes instanceof ArrayBuffer) {
    console.log(`[DIAG] pdfBytes: ArrayBuffer, byteLength=${pdfBytes.byteLength}`);
  } else {
    console.log(`[DIAG] pdfBytes: type=${typeof pdfBytes}, value=`, pdfBytes);
  }
}

export function logExportState(isExporting, exportProgress) {
  console.log(`[DIAG] Exporting: ${isExporting}, Progress: ${exportProgress}`);
}

export function logUiState({ currentPage, pageCount, openedFileName, currentTool }) {
  console.log(`[DIAG] UI State: page=${currentPage}/${pageCount}, file='${openedFileName}', tool='${currentTool}'`);
}
// ============================================
// PDF DNA DIAGNOSTIC v6.0 - jsPDF Compatible
// ============================================

export function diagnosePdfDna(pdfBytes) {
  logPdfBytesState(pdfBytes);
  console.log("--- PDF DIAGNOSTIC REPORT (v6.0) ---");
  const pdfText = new TextDecoder("utf-8", { fatal: false }).decode(pdfBytes);
  // 7b) RECTANGLE/FILL OPERATORS (vector overlays)
  const rectOpMatches = [...pdfText.matchAll(/\sre\s/g)];
  const fillOpMatches = [...pdfText.matchAll(/\sf\s/g)];
  console.log(`\n7b. Rectangle Draw Operators (re): ${rectOpMatches.length}`);
  console.log(`7b. Fill Operators (f): ${fillOpMatches.length}`);
  if (rectOpMatches.length === 0 || fillOpMatches.length === 0) {
    console.warn(`⚠️ No vector rectangle overlays detected. Whiteout rectangles may not be present.`);
  } else {
    console.log(`✅ Detected ${rectOpMatches.length} rectangles and ${fillOpMatches.length} fills (likely overlays).`);
  }

  // 1) HEADER CHECK
  const headerMatch = pdfText.match(/%PDF-[\d. ]+/);
  const header = headerMatch ? headerMatch[0] : "❌ No header found";
  const firstLines = pdfText.substring(0, 100).split("\n").slice(0, 3).join("\n");
  console.log(`1.  Header: ${firstLines}`);

  // 2) FILE SIZE
  console.log(`2. File Size: ${(pdfBytes.length / (1024 * 1024)).toFixed(2)} MB`);

  // 3) EOF MARKER
  const hasEof = pdfText.includes("%%EOF");
  console.log(`3. EOF Marker: ${hasEof ?  "✅ Present" : "❌ Missing"}`);

  // 4) PAGE COUNT (ACTUAL pages, not catalog)
  const pageMatches = [... pdfText.matchAll(/\/Type\s*\/Page[^s]/g)];
  const pageCount = pageMatches.length;
  console.log(`4. Page Objects Found: ${pageCount}`);

  // 5) MEDIABOX CHECK (handles both integer and decimal formats)
  const mediaBoxRegex = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g;
  const mediaBoxes = [... pdfText.matchAll(mediaBoxRegex)];
  
  console.log(`\n5. MediaBox Definitions Found: ${mediaBoxes.length}`);
  
  if (mediaBoxes.length >= pageCount) {
    console.log(`✅ All ${pageCount} pages have MediaBox definitions`);
    mediaBoxes.slice(0, pageCount).forEach((box, i) => {
      console.log(`   Page ${i + 1}: [${box[1]} ${box[2]} ${box[3]} ${box[4]}]`);
    });
  } else {
    console.warn(`⚠️ Only ${mediaBoxes.length} MediaBox found for ${pageCount} pages`);
  }

  // 6) IMAGE XOBJECTS (PNG or JPEG)
  const imageXObjectRegex = /\/Type\s*\/XObject[^]*? \/Subtype\s*\/Image/g;
  const dctDecodeRegex = /\/Filter\s*\[?\s*\/DCTDecode/g; // JPEG filter
  const imageMatches = [...pdfText.matchAll(imageXObjectRegex)];
  const dctMatches = [...pdfText.matchAll(dctDecodeRegex)];
  const totalImageLike = imageMatches.length + dctMatches.length;
  console.log(`\n6. Image XObjects (PNG): ${imageMatches.length}, JPEG (/DCTDecode): ${dctMatches.length}`);
  if (totalImageLike < pageCount) {
    console.warn(`⚠️ Missing image XObjects or JPEGs for some pages.`);
    imageMatches.forEach((match, idx) => {
      const offset = match.index;
      const context = pdfText.substring(Math.max(0, offset - 40), Math.min(pdfText.length, offset + 120));
      console.warn(`  Image XObject ${idx + 1} at byte ${offset}:\n${context}\n---`);
    });
    dctMatches.forEach((match, idx) => {
      const offset = match.index;
      const context = pdfText.substring(Math.max(0, offset - 40), Math.min(pdfText.length, offset + 120));
      console.warn(`  JPEG XObject (DCTDecode) ${idx + 1} at byte ${offset}:\n${context}\n---`);
    });
  }

  // 7) CONTENT STREAMS WITH IMAGES
  const doOperatorMatches = [...pdfText.matchAll(/\bDo\b/g)];
  console.log(`\n7. Image Draw Operators (Do): ${doOperatorMatches.length}`);
  if (doOperatorMatches.length < pageCount) {
    console.warn(`⚠️ Missing draw commands for some pages.`);
    doOperatorMatches.forEach((match, idx) => {
      const offset = match.index;
      const context = pdfText.substring(Math.max(0, offset - 40), Math.min(pdfText.length, offset + 80));
      console.warn(`  Draw command ${idx + 1} at byte ${offset}:\n${context}\n---`);
    });
  }
  if (doOperatorMatches.length >= pageCount) {
    console.log(`✅ All ${pageCount} pages have image draw commands`);
  } else {
    console.warn(`⚠️ Only ${doOperatorMatches.length} draw commands for ${pageCount} pages`);
  }

  // 8) FINAL VERDICT
  console.log("\n--- FINAL VERDICT ---");
  
  const allGood = (
    hasEof &&
    pageCount > 0 &&
    mediaBoxes.length >= pageCount &&
    imageMatches.length >= pageCount &&
    doOperatorMatches.length >= pageCount
  );

  if (allGood) {
    console.log("✅ PDF STRUCTURE:  HEALTHY");
    console.log(`✅ ${pageCount} pages, ${imageMatches.length} images, ${doOperatorMatches.length} draw commands`);
  } else {
    console.warn("⚠️ PDF STRUCTURE:  Issues detected (but may still work in Adobe)");
  }

  console.log("Diagnostic complete.\n");
}

// AUDIT:  Validate PNG capture
export function auditCapture(dataUrl, pageNum) {
  if (!dataUrl || (!dataUrl.startsWith("data:image/png") && !dataUrl.startsWith("data:image/jpeg"))) {
    console.error(`❌ PAGE ${pageNum}:  Invalid image format (not PNG or JPEG)`);
    return;
  }
  if (dataUrl.length < 10000) {
    console.warn(`⚠️ PAGE ${pageNum}: Image too small (${dataUrl.length} chars)`);
    return;
  }
  console.log(`✅ PAGE ${pageNum}:  Healthy image (${dataUrl.length} chars).`);
}

// VISUAL VERIFY (not used but kept for compatibility)
export function visualVerify(canvas, pageNum) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  let nonWhitePixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
      nonWhitePixels++;
    }
  }

  const percentageContent = ((nonWhitePixels / (pixels.length / 4)) * 100).toFixed(2);
  console.log(`📊 Page ${pageNum}: ${percentageContent}% content pixels`);
}