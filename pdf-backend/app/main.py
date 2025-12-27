from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import json
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Basic hardening:  limit uploads (adjust as needed)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB

# Allow cross-origin during development
CORS(app)


@app.route("/")
def home():
    return jsonify({"message": "PDF Editor API is running"})


@app.route("/health")
def health():
    return jsonify({"ok": True})


@app.route("/extract/", methods=["POST", "OPTIONS"])
def extract():
    """
    Optional helper endpoint. 
    NOTE:  Extracts blocks only from page 1 (doc[0]).
    Not required for rect-based deletion.
    """
    if request.method == "OPTIONS":
        return "", 200

    if "file" not in request.files:
        logger.warning("[extract] No file provided in request")
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not (file. filename or "").lower().endswith(".pdf"):
        logger.warning(f"[extract] Invalid file type: {file.filename}")
        return jsonify({"error": "File must be a PDF"}), 400

    doc = None
    try:
        pdf_bytes = file.read()
        logger.info(f"[extract] Received PDF file: {file.filename}, size: {len(pdf_bytes)} bytes")
        
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        if doc.page_count == 0:
            logger.error("[extract] PDF has no pages")
            return jsonify({"error": "PDF has no pages"}), 400

        total_pages = doc.page_count
        page = doc[0]

        page_dict = page.get_text("dict")
        page_width = float(page. rect.width)
        page_height = float(page.rect.height)

        blocks = []
        for i, block in enumerate(page_dict. get("blocks", [])):
            block_data = {
                "id": f"block-{i}",
                "bbox": list(block.get("bbox", [])),
                "type": "text" if block.get("type") == 0 else "image",
            }

            if block.get("type") == 0:
                text_lines = []
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text_lines.append(span.get("text", ""))
                block_data["text"] = " ".join(text_lines).strip()
            else:
                block_data["text"] = ""

            blocks.append(block_data)

        # ✅ FIX: image bbox must be requested by xref
        for img_index, img in enumerate(page.get_images(full=True)):
            try:
                xref = img[0]
                bbox = page.get_image_bbox(xref)
                blocks. append(
                    {
                        "id": f"image-{img_index}",
                        "bbox": [bbox. x0, bbox.y0, bbox.x1, bbox.y1],
                        "type":  "image",
                        "text": "",
                    }
                )
            except Exception as e: 
                # best-effort, ignore failures
                logger.warning(f"[extract] Failed to get image bbox for image {img_index}: {e}")
                pass

        logger.info(f"[extract] Successfully extracted {len(blocks)} blocks from page 1/{total_pages}")
        
        return jsonify(
            {
                "success": True,
                "blocks": blocks,
                "pageCount": total_pages,
                "pageSize": {"width": page_width, "height": page_height},
            }
        ), 200

    except Exception as e:
        logger.error(f"[extract] Error:  {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

    finally:
        try: 
            if doc is not None: 
                doc.close()
        except Exception as e:
            logger.warning(f"[extract] Error closing document: {e}")


def _parse_rect_list(rect_list):
    """
    rect_list: [[x,y,w,h], ...]
    Returns list of fitz.Rect
    """
    out = []
    if not isinstance(rect_list, list):
        return out

    for r in rect_list:
        if not (isinstance(r, (list, tuple)) and len(r) == 4):
            continue
        x, y, w, h = r
        try:
            x = float(x)
            y = float(y)
            w = float(w)
            h = float(h)
        except Exception:
            continue
        if w <= 0 or h <= 0:
            continue

        out.append(fitz. Rect(x, y, x + w, y + h))

    return out


@app.route("/delete/", methods=["POST", "OPTIONS"])
def delete_by_rects_single_page():
    """
    Single-page rect redaction. 

    Expects multipart/form-data:
      - file: PDF
      - page: 1-based page number
      - rects: JSON string like [[x,y,w,h], ...]

    Coordinates expected:  top-left origin, y downward (matches frontend convention).
    """
    if request. method == "OPTIONS":
        return "", 200

    if "file" not in request.files:
        logger.warning("[delete] No file provided in request")
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    doc = None

    try: 
        pdf_bytes = file.read()
        logger.info(f"[delete] Received PDF, size: {len(pdf_bytes)} bytes")
        
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        page_str = request.form.get("page", "1")
        try:
            page_num = int(page_str)
        except ValueError:
            logger.error(f"[delete] Invalid page value: {page_str}")
            return jsonify({"error": f"Invalid page value: {page_str}"}), 400

        if page_num < 1 or page_num > doc.page_count:
            logger.error(f"[delete] Page out of range: {page_num}, total pages: {doc.page_count}")
            return jsonify({"error": f"Page out of range: {page_num}"}), 400

        rects_raw = request.form.get("rects", "")
        if not rects_raw:
            logger.warning("[delete] No rects provided")
            return jsonify({"error": "No rects provided"}), 400

        try:
            rect_list = json.loads(rects_raw)
        except json.JSONDecodeError as e:
            logger.error(f"[delete] Invalid JSON in rects: {e}")
            return jsonify({"error": "rects must be valid JSON like [[x,y,w,h], ...]"}), 400

        rects = _parse_rect_list(rect_list)
        if not rects:
            logger.warning("[delete] No valid rects to redact")
            return jsonify({"error": "No valid rects to redact"}), 400

        page = doc[page_num - 1]

        for rect in rects: 
            # Expand slightly to catch OCR offsets / halos
            rect = rect + (-1, -1, 1, 1)
            # White fill (match your UI "erase")
            page.add_redact_annot(rect, fill=(1, 1, 1))

        page.apply_redactions()

        out = doc.write(garbage=4, deflate=True, clean=True)
        logger.info(f"[delete] Successfully redacted {len(rects)} rects on page {page_num}, output size: {len(out)} bytes")
        
        return out, 200, {
            "Content-Type":  "application/pdf",
            "Content-Disposition": "attachment; filename=edited.pdf",
        }

    except Exception as e: 
        logger.error(f"[delete] Error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

    finally:
        try:
            if doc is not None:
                doc.close()
        except Exception as e:
            logger.warning(f"[delete] Error closing document: {e}")


@app.route("/delete_multi/", methods=["POST", "OPTIONS"])
def delete_multi():
    """
    Multi-page redaction endpoint — matches PdfViewer.jsx.

    Expects multipart/form-data: 
      - file: PDF
      - payload: JSON string like:
          { "pages": { "1": [[x,y,w,h], ...], "2": [[x,y,w,h]] } }

    Pages are 1-based in payload keys.
    """
    if request.method == "OPTIONS":
        return "", 200

    if "file" not in request.files:
        logger.warning("[delete_multi] No file provided in request")
        return jsonify({"error": "No file provided"}), 400

    payload_raw = request.form.get("payload", "")
    if not payload_raw:
        logger.warning("[delete_multi] No payload provided")
        return jsonify({"error": "No payload provided"}), 400

    try:
        payload = json.loads(payload_raw)
        logger.info(f"[delete_multi] Received payload:  {payload}")
    except json.JSONDecodeError as e: 
        logger.error(f"[delete_multi] Invalid JSON in payload: {e}")
        return jsonify({"error": "payload must be valid JSON"}), 400

    pages = payload.get("pages")
    if not isinstance(pages, dict) or not pages:
        logger.error("[delete_multi] payload.pages must be a non-empty object")
        return jsonify({"error": "payload.pages must be a non-empty object"}), 400

    file = request. files["file"]
    doc = None

    try:
        pdf_bytes = file.read()
        logger.info(f"[delete_multi] Received PDF, size: {len(pdf_bytes)} bytes")
        
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        if doc.page_count == 0:
            logger.error("[delete_multi] PDF has no pages")
            return jsonify({"error": "PDF has no pages"}), 400

        total_added = 0

        # Add redactions across all requested pages
        for page_key, rect_list in pages.items():
            try:
                page_num = int(page_key)
            except Exception as e:
                logger.warning(f"[delete_multi] Invalid page key: {page_key}, error: {e}")
                continue

            if page_num < 1 or page_num > doc.page_count:
                logger.warning(f"[delete_multi] Page {page_num} out of range (1-{doc.page_count})")
                continue

            rects = _parse_rect_list(rect_list)
            if not rects:
                logger.warning(f"[delete_multi] No valid rects for page {page_num}")
                continue

            page = doc[page_num - 1]
            for rect in rects:
                rect = rect + (-1, -1, 1, 1)  # OCR halo padding
                page.add_redact_annot(rect, fill=(1, 1, 1))
                total_added += 1

            logger.info(f"[delete_multi] Added {len(rects)} redactions to page {page_num}")

        if total_added == 0:
            logger.error("[delete_multi] No valid rects to redact")
            return jsonify({"error": "No valid rects to redact"}), 400

        # Apply per page (safe)
        for p in doc: 
            p.apply_redactions()

        # Save with cleanup
        out = doc.write(garbage=4, deflate=True, clean=True)
        
        logger.info(f"[delete_multi] Successfully applied {total_added} redactions, output size: {len(out)} bytes")
        
        # ✅ ADDED:  Validation check
        if len(out) < 100:
            logger.error(f"[delete_multi] PDF bytes too short: {len(out)} bytes - likely corrupted")
            logger.error(f"[delete_multi] First bytes: {out[:50] if out else 'EMPTY'}")
            return jsonify({"error": "Generated PDF is corrupted or empty"}), 500
        
        # ✅ ADDED:  Verify PDF header
        if not out.startswith(b'%PDF-'):
            logger. error(f"[delete_multi] Invalid PDF header: {out[: 10]}")
            return jsonify({"error": "Generated file is not a valid PDF"}), 500
        
        return out, 200, {
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=edited. pdf",
        }

    except Exception as e:
        logger. error(f"[delete_multi] Error: {str(e)}", exc_info=True)
        return jsonify({"error":  str(e)}), 500

    finally:
        try: 
            if doc is not None: 
                doc.close()
        except Exception as e:
            logger. warning(f"[delete_multi] Error closing document: {e}")


if __name__ == "__main__": 
    logger.info("Starting PDF Editor API server on port 8000")
    app.run(host="0.0.0.0", port=8000, debug=True)