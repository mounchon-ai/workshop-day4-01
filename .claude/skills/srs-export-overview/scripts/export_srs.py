#!/usr/bin/env python3
"""ส่งออกบท SRS (markdown + mermaid) เป็นไฟล์ Word และ/หรือ PDF

ขั้นตอน
  1. เรียก mermaid-cli (mmdc) แปลงทุกบล็อก ```mermaid ในไฟล์เป็น PNG
  2. อ่าน markdown ที่ mmdc แปลงแล้ว (บล็อก mermaid กลายเป็น ![](...png))
  3. ส่งบล็อกที่แยกได้ให้ตัวเขียน .docx (python-docx) และ/หรือ .pdf (headless Chrome)

ตัวอย่าง
  python export_srs.py                                   # ได้ .docx
  python export_srs.py --format pdf                      # ได้ .pdf
  python export_srs.py --format both                     # ได้ทั้งสองไฟล์
  python export_srs.py docs/sds/03-functional-requirements.md --format both
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mdblocks import count_kinds, parse_blocks, strip_trailing_nav  # noqa: E402

ASSETS = Path(__file__).resolve().parent.parent / "assets"

# console ของ Windows มักเป็น cp1252 ทำให้ print ภาษาไทยแล้วพัง
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover
        pass


def render_mermaid(src: Path, build_dir: Path, *, scale: int, background: str,
                   config: Path, mmdc_pkg: str) -> Path:
    """เรียก mmdc แปลงบล็อก mermaid ทั้งไฟล์เป็น PNG แล้วคืน markdown ที่แปลงแล้ว"""
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx is None:
        raise RuntimeError("ไม่พบคำสั่ง npx — ต้องติดตั้ง Node.js ก่อนจึงจะเรนเดอร์ diagram ได้")

    out_md = build_dir / "rendered.md"
    cmd = [
        npx, "-y", mmdc_pkg,
        "-i", str(src), "-o", str(out_md),
        "-e", "png", "-s", str(scale), "-b", background,
    ]
    if config.is_file():
        cmd += ["-c", str(config)]

    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0 or not out_md.is_file():
        raise RuntimeError(
            "mermaid-cli ทำงานไม่สำเร็จ\n"
            f"คำสั่ง: {' '.join(cmd)}\n{(proc.stderr or proc.stdout or '').strip()[-2000:]}"
        )
    print((proc.stdout or "").strip(), file=sys.stderr)
    return out_md


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description="แปลงบท SRS (markdown + mermaid) เป็น Word / PDF")
    ap.add_argument("input", nargs="?", default="docs/sds/02-system-overview.md",
                    help="ไฟล์ markdown ต้นทาง (ค่าเริ่มต้น: docs/sds/02-system-overview.md)")
    ap.add_argument("-f", "--format", choices=["docx", "pdf", "both"], default="docx",
                    help="รูปแบบไฟล์ผลลัพธ์ (ค่าเริ่มต้น: docx)")
    ap.add_argument("-o", "--output",
                    help="ไฟล์ปลายทาง — ถ้า --format both จะใช้เป็นชื่อฐานแล้วเติมนามสกุลเอง "
                         "(ค่าเริ่มต้น: docs/sds/exports/<ชื่อไฟล์>.<นามสกุล>)")
    ap.add_argument("--font", default="Leelawadee UI", help="ฟอนต์หลัก (ต้องมีในเครื่องที่เปิดไฟล์)")
    ap.add_argument("--mono-font", default="Consolas", help="ฟอนต์สำหรับ inline code")
    ap.add_argument("--size", type=float, default=12, help="ขนาดตัวอักษรเนื้อความ (pt)")
    ap.add_argument("--align", choices=["auto", "justify", "left"], default="auto",
                    help="auto = ชิดขอบสองด้านใน Word และชิดซ้ายใน PDF (ดูเหตุผลใน SKILL.md)")
    ap.add_argument("--margin", type=float, default=1.0, help="ขอบกระดาษ (นิ้ว)")
    ap.add_argument("--max-width", type=float, default=6.3, help="ความกว้างภาพสูงสุด (นิ้ว)")
    ap.add_argument("--max-height", type=float, default=8.0, help="ความสูงภาพสูงสุด (นิ้ว)")
    ap.add_argument("--page-label", default="หน้า", help="คำนำหน้าเลขหน้าใน PDF")
    ap.add_argument("--chrome", help="พาธของ Chrome/Chromium สำหรับสร้าง PDF (ปกติหาเองได้)")
    ap.add_argument("--scale", type=int, default=3, help="ตัวคูณความละเอียด PNG ของ diagram")
    ap.add_argument("--background", default="white", help="สีพื้นหลัง diagram")
    ap.add_argument("--mermaid-config", default=str(ASSETS / "mermaid-config.json"))
    ap.add_argument("--mmdc-package", default="@mermaid-js/mermaid-cli@11")
    ap.add_argument("--no-render", action="store_true",
                    help="ข้ามการเรนเดอร์ diagram (บล็อก mermaid จะกลายเป็นบล็อกโค้ด)")
    ap.add_argument("--keep-build", action="store_true",
                    help="เก็บ PNG และไฟล์กลาง (markdown/HTML) ไว้ข้าง ๆ ไฟล์ผลลัพธ์")
    ap.add_argument("--keep-nav", action="store_true", help="ไม่ตัดแถบลิงก์ท้ายไฟล์")
    return ap.parse_args(argv)


def target_paths(args, src: Path) -> dict[str, Path]:
    formats = ["docx", "pdf"] if args.format == "both" else [args.format]
    if args.output:
        given = Path(args.output).resolve()
        if args.format == "both" or given.suffix.lower() not in (".docx", ".pdf"):
            base = given.with_suffix("") if given.suffix else given
            return {f: base.with_suffix(f".{f}") for f in formats}
        return {formats[0]: given}
    base = src.parent / "exports" / src.stem
    return {f: base.with_suffix(f".{f}") for f in formats}


def main(argv=None) -> int:
    args = parse_args(argv)

    src = Path(args.input).resolve()
    if not src.is_file():
        sys.exit(f"ไม่พบไฟล์ต้นทาง: {src}")
    outputs = target_paths(args, src)

    tmp = None
    if args.keep_build:
        build_dir = next(iter(outputs.values())).parent / f"{src.stem}-build"
        build_dir.mkdir(parents=True, exist_ok=True)
    else:
        tmp = tempfile.TemporaryDirectory(prefix="srs-export-")
        build_dir = Path(tmp.name)

    try:
        if args.no_render:
            md_path, base_dir = src, src.parent
        else:
            md_path = render_mermaid(
                src, build_dir,
                scale=args.scale, background=args.background,
                config=Path(args.mermaid_config), mmdc_pkg=args.mmdc_package,
            )
            base_dir = md_path.parent

        blocks = parse_blocks(md_path.read_text(encoding="utf-8"))
        if not args.keep_nav:
            blocks = strip_trailing_nav(blocks)
        title = next((b[1]["text"] for b in blocks
                      if b[0] == "heading" and b[1]["level"] == 1), src.stem)

        def resolve_image(ref: str) -> Path:
            path = Path(ref.split(" ")[0].strip("<>"))
            return path if path.is_absolute() else (base_dir / path).resolve()

        written = []
        if "docx" in outputs:
            from docx_writer import write_docx
            written.append(write_docx(blocks, args, outputs["docx"], title, src, resolve_image))
        if "pdf" in outputs:
            from pdf_writer import write_pdf
            written.append(write_pdf(blocks, args, outputs["pdf"], title, src,
                                     resolve_image, build_dir))
    finally:
        if tmp is not None:
            tmp.cleanup()

    counts = count_kinds(blocks)
    for path in written:
        print(f"เขียนไฟล์: {path}  ({path.stat().st_size / 1024:.0f} KB)")
    print("  หัวข้อ {h} · ย่อหน้า {p} · ตาราง {t} · ภาพ {i}".format(
        h=counts.get("heading", 0), p=counts.get("para", 0),
        t=counts.get("table", 0), i=counts.get("image", 0)))
    if args.keep_build:
        print(f"  ไฟล์กลาง: {build_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
