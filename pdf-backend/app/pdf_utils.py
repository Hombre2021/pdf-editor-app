import json
import fitz  # PyMuPDF
from typing import List, Tuple, Dict, Any, Optional

RectXYWH = Tuple[float, float, float, float]  # x, y, w, h


def redact_pdf_bytes_by_rects(
    pdf_bytes: bytes,
    page_1_based: int,
    rects_xywh: List[RectXYWH],
    *,
    fill_rgb: Tuple[float, float, float] = (0, 0, 0),  # black
    expand: float = 1.0,  # expand each side to catch OCR misalignment
) -> bytes:
    """
    Privacy-correct area redaction.
    Input rects are (x, y, w, h) in page coordinates.
    Returns edited PDF bytes.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    if page_1_based < 1 or page_1_based > doc.page_count:
        doc.close()
        raise ValueError(f"page out of range: {page_1_based}")

    page = doc[page_1_based - 1]

    added = 0
    for (x, y, w, h) in rects_xywh:
        if w <= 0 or h <= 0:
            continue

        rect = fitz.Rect(x, y, x + w, y + h)

        if expand and expand > 0:
            rect = rect + (-expand, -expand, expand, expand)

        page.add_redact_annot(rect, fill=fill_rgb)
        added += 1

    if added == 0:
        doc.close()
        raise ValueError("no valid rectangles to redact")

    # destructive removal
    page.apply_redactions()

    # privacy: rewrite with cleanup
    out = doc.write(garbage=4, deflate=True, clean=True)
    doc.close()
    return out


def parse_rects_field(rects_raw: str) -> List[RectXYWH]:
    """
    Helper: parse the Flask form field 'rects' which is a JSON string like:
      [[x, y, w, h], [x, y, w, h], ...]
    """
    if not rects_raw:
        return []

    data = json.loads(rects_raw)
    if not isinstance(data, list):
        return []

    rects: List[RectXYWH] = []
    for r in data:
        if not (isinstance(r, list) or isinstance(r, tuple)) or len(r) != 4:
            continue
        try:
            x = float(r[0]); y = float(r[1]); w = float(r[2]); h = float(r[3])
        except Exception:
            continue
        rects.append((x, y, w, h))

    return rects


def extract_blocks_for_page_bytes(pdf_bytes: bytes, page_1_based: int) -> Dict[str, Any]:
    """
    Optional: backend extraction helper (diagnostics).
    Returns bboxes as [x0,y0,x1,y1] (PyMuPDF native).
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if page_1_based < 1 or page_1_based > doc.page_count:
        doc.close()
        raise ValueError(f"page out of range: {page_1_based}")

    page = doc[page_1_based - 1]
    page_dict = page.get_text("dict")

    blocks = []
    for i, block in enumerate(page_dict.get("blocks", [])):
        bbox = block.get("bbox")
        if not bbox:
            continue
        blocks.append(
            {
                "id": f"block-{page_1_based}-{i}",
                "type": "text" if block.get("type") == 0 else "image",
                "bbox": list(bbox),  # [x0, y0, x1, y1]
            }
        )

    doc.close()
    return {"page": page_1_based, "blocks": blocks}
