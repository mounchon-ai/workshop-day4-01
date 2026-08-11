#!/usr/bin/env python3
"""ตัวแยกบล็อก markdown ที่ใช้ร่วมกันระหว่างตัวเขียน .docx และ .pdf

รองรับเท่าที่เอกสาร SRS ใช้จริง: heading, ย่อหน้า, ตาราง GFM, รายการ,
บล็อกโค้ด, เส้นคั่น, รูปภาพ และรูปแบบในบรรทัด **หนา** *เอียง* `โค้ด` [ลิงก์](url)
"""

from __future__ import annotations

import re

CAPTION_RE = re.compile(r"^\*\*(ภาพที่|รูปที่|ตารางที่|แผนภาพที่|Figure|Table)\s")
NAV_RE = re.compile(r"^(\[[^\]]*\]\([^)]*\)|\s|·|\|)+$")
IMAGE_RE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
HR_RE = re.compile(r"^(-{3,}|\*{3,}|_{3,})$")
LIST_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
TABLE_SEP_RE = re.compile(r"^\s*\|[\s:|-]+\|\s*$")
INLINE_RE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]*\)|(?<!\*)\*[^*\s][^*]*\*)")


def parse_blocks(text: str) -> list[tuple[str, object]]:
    lines = text.replace("\r\n", "\n").split("\n")
    blocks: list[tuple[str, object]] = []
    i, n = 0, len(lines)

    while i < n:
        raw = lines[i]
        line = raw.strip()

        if not line:
            i += 1
            continue

        if line.startswith("```"):
            lang = line[3:].strip()
            body, i = [], i + 1
            while i < n and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1
            blocks.append(("code", {"lang": lang, "text": "\n".join(body)}))
            continue

        m = HEADING_RE.match(line)
        if m:
            blocks.append(("heading", {"level": len(m.group(1)), "text": m.group(2).strip()}))
            i += 1
            continue

        if HR_RE.match(line):
            blocks.append(("hr", None))
            i += 1
            continue

        m = IMAGE_RE.match(line)
        if m:
            blocks.append(("image", {"alt": m.group(1), "src": m.group(2)}))
            i += 1
            continue

        if line.startswith("|") and i + 1 < n and TABLE_SEP_RE.match(lines[i + 1]):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            blocks.append(("table", rows))
            continue

        if LIST_RE.match(raw):
            items = []
            while i < n and LIST_RE.match(lines[i]):
                g = LIST_RE.match(lines[i])
                items.append({
                    "indent": min(len(g.group(1)) // 2, 3),
                    "ordered": g.group(2)[0].isdigit(),
                    "text": g.group(3).strip(),
                })
                i += 1
            blocks.append(("list", items))
            continue

        para = []
        while i < n and lines[i].strip():
            cur = lines[i].strip()
            if cur.startswith(("#", "|", "```")) or HR_RE.match(cur) or LIST_RE.match(lines[i]):
                break
            para.append(cur)
            i += 1
        blocks.append(("para", " ".join(para)))

    return blocks


def iter_inline(text: str):
    """แตกข้อความเป็น (ข้อความ, รูปแบบ) ตาม **bold** *italic* `code` [link](url)"""
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            yield part[2:-2], {"bold": True}
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            yield part[1:-1], {"code": True}
        elif part.startswith("[") and part.endswith(")"):
            m = re.match(r"\[([^\]]+)\]\(([^)]*)\)", part)
            yield (m.group(1) if m else part), {"link": True}
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            yield part[1:-1], {"italic": True}
        else:
            yield part, {}


def split_table_row(row: str) -> list[str]:
    inner = row.strip().strip("|")
    cells, buf, esc = [], "", False
    for ch in inner:
        if esc:
            buf += ch
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            cells.append(buf.strip())
            buf = ""
        else:
            buf += ch
    cells.append(buf.strip())
    return cells


def is_caption(text: str) -> bool:
    return bool(CAPTION_RE.match(text))


def strip_trailing_nav(blocks: list) -> list:
    """ตัดแถบลิงก์ไปบทถัดไป/ก่อนหน้าท้ายไฟล์ ซึ่งไม่มีความหมายในไฟล์ที่ส่งออก"""
    out = list(blocks)
    while out and out[-1][0] in ("para", "hr"):
        kind, payload = out[-1]
        if kind == "hr" or (isinstance(payload, str) and NAV_RE.match(payload) and "](" in payload):
            out.pop()
            continue
        break
    return out


def fit_inches(px_w: int, px_h: int, scale: int, max_w: float, max_h: float) -> tuple[float, float]:
    """ขนาดที่จะวางภาพลงเอกสาร (นิ้ว) — ย่อหรือขยายให้พอดีกรอบโดยคงอัตราส่วน

    PNG จาก mmdc ไม่มี dpi ฝังมา ขนาดจริงจึงเท่ากับ pixel หารด้วย 96 × scale
    ตัวเขียนทั้ง .docx และ .pdf ใช้สูตรเดียวกัน ภาพในสองไฟล์จะได้ขนาดเท่ากัน
    """
    w_in = px_w / (96.0 * scale)
    h_in = px_h / (96.0 * scale)
    if not w_in or not h_in:
        return max_w, max_h
    ratio = min(max_w / w_in, max_h / h_in)
    return w_in * ratio, h_in * ratio


def png_size_px(path) -> tuple[int, int] | None:
    """อ่านความกว้าง/สูงจาก IHDR ของไฟล์ PNG โดยไม่ต้องพึ่งไลบรารีภาพ"""
    with open(path, "rb") as fh:
        head = fh.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def count_kinds(blocks) -> dict[str, int]:
    counts: dict[str, int] = {}
    for kind, _ in blocks:
        counts[kind] = counts.get(kind, 0) + 1
    return counts
