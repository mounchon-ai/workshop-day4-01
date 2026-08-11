#!/usr/bin/env python3
"""ประกอบบล็อก markdown เป็นไฟล์ PDF

ทำผ่าน HTML แล้วให้ Chrome แบบ headless สั่ง print-to-pdf เพราะ Chrome จัดวาง
สระบนสระล่างและวรรณยุกต์ไทยได้ถูกต้อง (มี HarfBuzz อยู่ในตัว) ต่างจากไลบรารี
สร้าง PDF ทั่วไปที่วางกลไกตามความกว้างอักษรอย่างเดียวแล้วทำให้วรรณยุกต์ชนกัน
Chromium ที่ mermaid-cli ดาวน์โหลดไว้แล้วถูกนำมาใช้ซ้ำ จึงไม่ต้องติดตั้งอะไรเพิ่ม
"""

from __future__ import annotations

import base64
import html
import os
import shutil
import subprocess
import sys
from pathlib import Path

from mdblocks import fit_inches, is_caption, iter_inline, png_size_px, split_table_row

A4_W_IN, A4_H_IN = 8.27, 11.69

WIN_CHROME_PATHS = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
)
MAC_CHROME_PATHS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
)


# ---------------------------------------------------------------- หา Chrome

def _puppeteer_chromes() -> list[Path]:
    """Chromium ที่ puppeteer (ผ่าน mermaid-cli) ดาวน์โหลดไว้แล้ว

    เอา chrome-headless-shell ก่อน เพราะสร้างมาเพื่องานนี้โดยเฉพาะ ใช้โปรไฟล์
    ชั่วคราวของตัวเอง จึงไม่ชนกับ Chrome ที่ผู้ใช้เปิดค้างไว้ และเริ่มเร็วกว่า
    """
    cache = Path(os.environ.get("PUPPETEER_CACHE_DIR") or (Path.home() / ".cache" / "puppeteer"))
    found: list[Path] = []
    for kind in ("chrome-headless-shell", "chrome"):
        base = cache / kind
        if not base.is_dir():
            continue
        for version in sorted(base.iterdir(), reverse=True):  # รุ่นใหม่ก่อน
            for pattern in ("*/chrome.exe", "*/chrome", "*/chrome-headless-shell.exe",
                            "*/chrome-headless-shell", "*/Chromium.app/Contents/MacOS/Chromium"):
                found.extend(sorted(version.glob(pattern)))
    return found


def find_chrome(explicit: str | None = None) -> Path:
    candidates: list[Path] = []
    for value in (explicit, os.environ.get("CHROME_PATH")):
        if value:
            candidates.append(Path(value))
    candidates += _puppeteer_chromes()
    for name in ("chrome", "google-chrome", "google-chrome-stable", "chromium",
                 "chromium-browser", "msedge"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))
    candidates += [Path(p) for p in (WIN_CHROME_PATHS if os.name == "nt" else MAC_CHROME_PATHS)]

    for path in candidates:
        if path.is_file():
            return path
    raise RuntimeError(
        "ไม่พบ Chrome/Chromium สำหรับสร้าง PDF\n"
        "  • รันการส่งออกแบบ .docx สักครั้งก่อน เพื่อให้ mermaid-cli ดาวน์โหลด Chromium ให้ หรือ\n"
        "  • ระบุเองด้วย --chrome <พาธของ chrome.exe> หรือตัวแปรแวดล้อม CHROME_PATH"
    )


# ---------------------------------------------------------------- สร้าง HTML

def _inline(text: str, mono: str) -> str:
    out = []
    for chunk, fmt in iter_inline(text):
        if not chunk:
            continue
        safe = html.escape(chunk).replace("&lt;br/&gt;", "<br>").replace("&lt;br&gt;", "<br>")
        if fmt.get("code"):
            out.append(f"<code>{safe}</code>")
        elif fmt.get("bold"):
            out.append(f"<strong>{safe}</strong>")
        elif fmt.get("italic"):
            out.append(f"<em>{safe}</em>")
        else:
            out.append(safe)
    return "".join(out)


def _img_tag(path: Path, scale: int, max_w: float, max_h: float) -> str:
    if not path.is_file():
        return f'<p class="missing">[ไม่พบไฟล์ภาพ: {html.escape(path.name)}]</p>'
    size = png_size_px(path)
    style = ""
    if size:
        w_in, _ = fit_inches(size[0], size[1], scale, max_w, max_h)
        style = f' style="width:{w_in:.2f}in"'
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f'<img src="data:image/png;base64,{data}" alt=""{style}>'


def _table_html(rows: list[str], mono: str) -> str:
    header = split_table_row(rows[0])
    body = [split_table_row(r) for r in rows[2:] if r.strip("| ")]
    cols = max([len(header)] + [len(r) for r in body])
    header += [""] * (cols - len(header))

    parts = ["<table><thead><tr>"]
    parts += [f"<th>{_inline(c, mono)}</th>" for c in header]
    parts.append("</tr></thead><tbody>")
    for cells in body:
        cells = cells + [""] * (cols - len(cells))
        parts.append("<tr>" + "".join(f"<td>{_inline(c, mono)}</td>" for c in cells[:cols]) + "</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def build_html(blocks, args, title: str, resolve_image) -> str:
    max_w = min(args.max_width, A4_W_IN - 2 * args.margin)
    usable_h = A4_H_IN - 2 * args.margin
    max_h = min(args.max_height, usable_h - 1.2)  # เผื่อที่ให้คำบรรยายใต้ภาพ

    body: list[str] = []
    i, n = 0, len(blocks)
    while i < n:
        kind, payload = blocks[i]
        if kind == "heading":
            level = min(payload["level"], 4)
            body.append(f"<h{level}>{_inline(payload['text'], args.mono_font)}</h{level}>")
        elif kind == "image":
            # จับภาพกับคำบรรยายไว้ใน <figure> เดียวกัน จะได้ไม่ถูกตัดคนละหน้า
            tag = _img_tag(resolve_image(payload["src"]), args.scale, max_w, max_h)
            caption = ""
            if i + 1 < n and blocks[i + 1][0] == "para" and is_caption(blocks[i + 1][1]):
                caption = f"<figcaption>{_inline(blocks[i + 1][1], args.mono_font)}</figcaption>"
                i += 1
            body.append(f"<figure>{tag}{caption}</figure>")
        elif kind == "para":
            cls = ' class="caption"' if is_caption(payload) else ""
            body.append(f"<p{cls}>{_inline(payload, args.mono_font)}</p>")
        elif kind == "list":
            tag = "ol" if payload and payload[0]["ordered"] else "ul"
            items = "".join(f"<li>{_inline(it['text'], args.mono_font)}</li>" for it in payload)
            body.append(f"<{tag}>{items}</{tag}>")
        elif kind == "table":
            body.append(_table_html(payload, args.mono_font))
        elif kind == "code":
            body.append(f"<pre>{html.escape(payload['text'])}</pre>")
        elif kind == "hr":
            body.append("<hr>")
        i += 1

    size = args.size
    # Chrome เกลี่ยช่องไฟได้เฉพาะที่ช่องว่าง ข้อความไทยมีช่องว่างน้อย จัดชิดขอบสองด้าน
    # แล้วจะเกิดช่องโหว่กว้างกลางบรรทัด จึงชิดซ้ายเป็นค่าเริ่มต้นใน PDF
    align = "justify" if args.align == "justify" else "left"
    return f"""<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>
@page {{
  size: A4;
  margin: {args.margin}in;
  @bottom-center {{
    content: "{args.page_label} " counter(page);
    font-family: "{args.font}", "Leelawadee UI", Tahoma, sans-serif;
    font-size: {size - 3}pt;
    color: #666;
  }}
}}
body {{
  font-family: "{args.font}", "Leelawadee UI", Tahoma, "Noto Sans Thai", sans-serif;
  font-size: {size}pt; line-height: 1.55; color: #1a1a1a;
  text-align: {align}; margin: 0;
}}
h1, h2, h3, h4 {{ color: #1f3a5f; break-after: avoid; text-align: left; line-height: 1.3; }}
h1 {{ font-size: {size + 8}pt; text-align: center; margin: 0 0 18px; }}
h2 {{ font-size: {size + 4}pt; margin: 22px 0 8px; }}
h3 {{ font-size: {size + 2}pt; margin: 16px 0 6px; }}
h4 {{ font-size: {size + 1}pt; margin: 12px 0 4px; }}
p {{ margin: 0 0 9px; orphans: 2; widows: 2; }}
figure {{ break-inside: avoid; margin: 14px 0 18px; text-align: center; }}
figure img {{ max-width: 100%; max-height: {max_h:.2f}in; }}
figcaption, p.caption {{
  font-size: {size - 1}pt; color: #444; text-align: {align};
  margin: 8px 0.3in 0; line-height: 1.5;
}}
p.caption {{ margin: 2px 0.3in 14px; }}
table {{
  width: 100%; border-collapse: collapse; margin: 8px 0 16px;
  font-size: {size - 1}pt; break-inside: auto;
}}
thead {{ display: table-header-group; }}
tr {{ break-inside: avoid; }}
th, td {{ border: 1px solid #9aa3ae; padding: 4px 7px; text-align: left; vertical-align: top; }}
th {{ background: #e8eef7; font-weight: 700; text-align: center; }}
code {{
  font-family: "{args.mono_font}", "Cascadia Mono", Consolas, monospace;
  font-size: 0.9em; background: #f3f4f6; padding: 1px 4px; border-radius: 3px;
}}
pre {{
  background: #f3f4f6; padding: 9px 11px; border-radius: 4px; break-inside: avoid;
  font-family: "{args.mono_font}", Consolas, monospace; font-size: {size - 2}pt;
  white-space: pre-wrap; text-align: left;
}}
ul, ol {{ margin: 0 0 9px; padding-left: 1.6em; }}
li {{ margin-bottom: 3px; }}
hr {{ border: 0; border-top: 1px solid #c9ced6; margin: 16px 0; }}
.missing {{ color: #b00020; }}
</style></head>
<body>
{chr(10).join(body)}
</body></html>
"""


# ---------------------------------------------------------------- พิมพ์ PDF

def print_to_pdf(html_path: Path, out: Path, chrome: Path, timeout: int = 120) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    is_shell = "headless-shell" in chrome.name.lower()
    cmd = [str(chrome)]
    if not is_shell:
        cmd += ["--headless", "--no-first-run", "--no-default-browser-check", "--disable-extensions"]
    # อย่าใส่ --user-data-dir: บน Windows ทำให้ network service ของ Chrome พังแล้วค้างยาว
    # ไม่ใส่แล้ว Chrome จะใช้โปรไฟล์ชั่วคราวเอง และอยู่ร่วมกับ Chrome ที่ผู้ใช้เปิดค้างได้
    cmd += [
        "--disable-gpu",
        "--no-pdf-header-footer",       # ปิดหัว/ท้ายกระดาษของ Chrome เอง ใช้ของ CSS แทน
        "--virtual-time-budget=15000",  # รอให้ภาพและฟอนต์โหลดครบก่อนพิมพ์
        f"--print-to-pdf={out}",
        html_path.as_uri(),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)
    if not out.is_file() or out.stat().st_size == 0:
        raise RuntimeError(
            "Chrome สร้าง PDF ไม่สำเร็จ\n"
            f"คำสั่ง: {' '.join(cmd)}\n{(proc.stderr or proc.stdout or '').strip()[-2000:]}"
        )


def write_pdf(blocks, args, out: Path, title: str, source: Path, resolve_image,
              build_dir: Path) -> Path:
    chrome = find_chrome(args.chrome)
    page = build_html(blocks, args, title, resolve_image)
    html_path = build_dir / f"{out.stem}.html"
    html_path.write_text(page, encoding="utf-8")
    print(f"ใช้ Chrome: {chrome}", file=sys.stderr)
    print_to_pdf(html_path, out, chrome)
    return out
