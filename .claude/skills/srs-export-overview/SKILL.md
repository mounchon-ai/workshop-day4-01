---
name: srs-export-overview
description: ส่งออกบทที่ 2 ภาพรวมระบบ (docs/sds/02-system-overview.md) หรือบทอื่นในชุด SRS เป็นไฟล์ Word .docx และ/หรือ PDF พร้อมเนื้อหาครบและ mermaid diagram ที่เรนเดอร์เป็นรูปภาพฝังในไฟล์ — ใช้เมื่อขอ export SRS เป็น Word/docx/PDF, ส่งเอกสารให้ผู้ที่ไม่ได้เปิด markdown, หรือทำเล่มส่งผู้ว่าจ้าง
---

# ส่งออกบท SRS เป็น Word และ PDF

แปลงบท SRS ที่เขียนไว้ด้วยสกิล `srs` ให้เป็น `.docx` และ/หรือ `.pdf` โดย**เนื้อหาต้องครบเท่าต้นฉบับ** และ **mermaid diagram ทุกภาพต้องกลายเป็นรูปภาพจริงในไฟล์** ไม่ใช่บล็อกโค้ด

ค่าเริ่มต้นชี้ที่ `docs/sds/02-system-overview.md` แต่สคริปต์ใช้ได้กับทุกบทในชุด

## ทำอย่างไร

```bash
S=.claude/skills/srs-export-overview/scripts/export_srs.py

python $S                      # ได้ .docx
python $S --format pdf         # ได้ .pdf
python $S --format both        # ได้ทั้งสองไฟล์
```

ผลลัพธ์ลงที่ `docs/sds/exports/02-system-overview.{docx,pdf}`

ระบุบทอื่นหรือปรับรูปแบบได้:

```bash
python $S docs/sds/03-functional-requirements.md --format both
python $S -o dist/ch2 --format both --font "TH Sarabun New" --size 16
python $S --keep-build         # เก็บ PNG ของ diagram และ HTML กลางไว้ใช้ต่อ
```

| ตัวเลือกที่ใช้บ่อย | ค่าเริ่มต้น | ใช้เมื่อ |
|---|---|---|
| `-f/--format` | `docx` | เลือก `pdf` หรือ `both` |
| `-o/--output` | `docs/sds/exports/<ชื่อไฟล์>` | ต้องการที่เก็บอื่น — ถ้า `--format both` ให้ใส่ชื่อฐานไม่ต้องมีนามสกุล |
| `--font` | `Leelawadee UI` | ผู้ว่าจ้างกำหนดฟอนต์ (เช่น `TH Sarabun New` — ต้องมีฟอนต์นั้นในเครื่องที่เปิดไฟล์) |
| `--size` | `12` | ฟอนต์ตระกูล TH Sarabun / Angsana ต้องใช้ `16` ขึ้นไปจึงอ่านสบาย |
| `--align` | `auto` | บังคับ `justify` หรือ `left` ทั้งสองรูปแบบ (ดู "การจัดชิดขอบ" ข้างล่าง) |
| `--scale` | `3` | ลดเป็น `2` ถ้าไฟล์ใหญ่เกิน เพิ่มเป็น `4` ถ้าจะเอาไปพิมพ์ |
| `--page-label` | `หน้า` | เปลี่ยนคำนำหน้าเลขหน้าใน PDF |
| `--chrome` | หาเอง | เครื่องมี Chrome อยู่ที่อื่น (หรือใช้ตัวแปรแวดล้อม `CHROME_PATH`) |
| `--keep-build` | ปิด | อยากได้ PNG ของ diagram และ HTML กลางแยกด้วย |
| `--no-render` | ปิด | เครื่องไม่มี Node.js — diagram จะกลายเป็นบล็อกโค้ดแทนรูป (ผลลัพธ์ไม่สมบูรณ์) |

ดูตัวเลือกทั้งหมดด้วย `--help`

## โครงสร้างสคริปต์

| ไฟล์ | หน้าที่ |
|---|---|
| `scripts/export_srs.py` | จุดเข้า — รับ argument, เรียก `mmdc` แปลง diagram, ส่งบล็อกให้ตัวเขียน |
| `scripts/mdblocks.py` | แยก markdown เป็นบล็อก + สูตรย่อขยายภาพ ใช้ร่วมกันทั้งสองรูปแบบ |
| `scripts/docx_writer.py` | ประกอบ `.docx` ด้วย python-docx |
| `scripts/pdf_writer.py` | ประกอบ HTML แล้วให้ headless Chrome สั่ง print-to-pdf |

ทั้ง `.docx` และ `.pdf` อ่านจากบล็อกชุดเดียวกันและใช้สูตรขนาดภาพเดียวกัน (`fit_inches`) สองไฟล์จึงหน้าตาตรงกัน **แก้กฎการแปลงที่ `mdblocks.py` ที่เดียว อย่าแก้แยกสองฝั่ง**

## ข้อกำหนดของเครื่อง

- **Node.js** — สคริปต์เรียก `npx -y @mermaid-js/mermaid-cli@11` ครั้งแรกจะดาวน์โหลด Chromium ของ puppeteer (ใช้เวลาสักครู่) ครั้งถัดไปเร็วเพราะใช้แคช
- **python-docx** — `pip install python-docx` (เฉพาะเมื่อจะส่งออก `.docx`)
- **Chrome/Chromium** — เฉพาะเมื่อจะส่งออก `.pdf` โดยหาตามลำดับ: `--chrome` → `CHROME_PATH` → Chromium ที่ mermaid-cli ดาวน์โหลดไว้ใน `~/.cache/puppeteer` → `PATH` → ตำแหน่งมาตรฐานของ Chrome/Edge

**ปกติไม่ต้องติดตั้งอะไรเพิ่มสำหรับ PDF** เพราะใช้ Chromium ตัวเดียวกับที่ mermaid-cli ดาวน์โหลดไว้แล้ว โดยเลือก `chrome-headless-shell` ก่อนเสมอ — เร็วกว่าและไม่ชนกับ Chrome ที่ผู้ใช้เปิดค้างอยู่

**ห้ามใส่ `--user-data-dir` ให้ Chrome** บน Windows จะทำให้ network service ของ Chrome พังแล้วค้างจนหมดเวลา ไม่ใส่แล้ว Chrome สร้างโปรไฟล์ชั่วคราวเอง

ถ้า `mmdc` ล้ม สคริปต์จะหยุดพร้อมพิมพ์ stderr ของ mmdc ออกมา สาเหตุที่พบบ่อยคือไวยากรณ์ mermaid ผิด — แก้ที่ไฟล์ markdown ต้นทางแล้วรัน `node .claude/skills/srs/scripts/check-mermaid.mjs docs/sds` ยืนยันก่อน อย่าไปแก้ที่สคริปต์ส่งออก

## สิ่งที่สคริปต์แปลงให้และไม่แปลงให้

| markdown | ผลในไฟล์ที่ส่งออก |
|---|---|
| `#` / `##` / `###` | Heading 1–3 (ใน Word ใช้ Navigation Pane ได้) |
| ย่อหน้า `**หนา**` `*เอียง*` `` `โค้ด` `` | ฟอนต์ code เป็น Consolas พื้นเทาอ่อน |
| ย่อหน้าที่ขึ้นต้นด้วย `**ภาพที่ ...**` | คำบรรยายใต้ภาพ — ย่อหน้าเข้า ตัวเล็กลง สีจาง และผูกกับภาพไม่ให้แยกคนละหน้า |
| ตาราง GFM | หัวตารางหนา พื้นเทาอ่อน ซ้ำหัวตารางเมื่อขึ้นหน้าใหม่ ไม่ตัดกลางแถว |
| ` ```mermaid ` | PNG กึ่งกลางหน้า ย่อพอดีความกว้างพิมพ์ |
| `- ` / `1. ` | รายการหัวข้อ / รายการตัวเลข |
| แถบลิงก์ `[← บทที่ 1](...)` ท้ายไฟล์ | **ตัดทิ้ง** (ใส่ `--keep-nav` ถ้าอยากเก็บ) |
| ลิงก์ในเนื้อความ | เหลือแต่ข้อความ ไม่เป็น hyperlink |

หน้ากระดาษเป็น A4 ขอบ 1 นิ้ว มีเลขหน้าท้ายกระดาษทั้งสองรูปแบบ (ใน `.docx` เป็น field `PAGE` ใน `.pdf` เป็น `@page { @bottom-center }` ของ CSS)

### ภาษาไทยในสองรูปแบบ

**`.docx` — ทุก run ต้องตั้งฟอนต์ complex-script (`w:cs`, `w:szCs`, `w:bCs`) ควบคู่กับฟอนต์ปกติเสมอ** ถ้าไม่ตั้ง Word จะใช้ฟอนต์ default กับสระบนสระล่างและวรรณยุกต์ไทย ทำให้ตัวอักษรลอยผิดตำแหน่ง — นี่คือเหตุผลที่ `docx_writer.py` ไม่ใช้ `run.font.name` เฉย ๆ

**`.pdf` — ต้องผ่าน Chrome เท่านั้น** เพราะ Chrome มี HarfBuzz จัดวางสระและวรรณยุกต์ไทยได้ถูกต้อง ไลบรารีสร้าง PDF ทั่วไป (reportlab, fpdf) วางกลไกตามความกว้างอักษรอย่างเดียว วรรณยุกต์บนพยัญชนะสูงจะชนกัน

### การจัดชิดขอบ

`--align auto` (ค่าเริ่มต้น) ให้ผลต่างกันตามรูปแบบโดยตั้งใจ

- **`.docx` ชิดขอบสองด้าน** — Word เกลี่ยช่องไฟระหว่างอักษรไทยได้ ตรงธรรมเนียมเอกสารไทย
- **`.pdf` ชิดซ้าย** — Chrome เกลี่ยช่องไฟได้เฉพาะที่ตัวอักษรช่องว่าง ข้อความไทยมีช่องว่างน้อย ถ้าจัดชิดขอบสองด้านจะเกิดช่องโหว่กว้างกลางบรรทัด

สั่ง `--align justify` หรือ `--align left` เพื่อบังคับให้เหมือนกันทั้งสองรูปแบบ

## ตรวจก่อนส่งมอบ

หลังรันเสร็จ สคริปต์พิมพ์จำนวนหัวข้อ ย่อหน้า ตาราง และภาพที่เขียนลงไฟล์ **เทียบตัวเลขนี้กับต้นฉบับทุกครั้ง**

```bash
grep -c '^```mermaid' docs/sds/02-system-overview.md   # ต้องเท่ากับจำนวน "ภาพ" ที่รายงาน
grep -c '^|---'       docs/sds/02-system-overview.md   # ต้องเท่ากับจำนวน "ตาราง" ที่รายงาน
```

ถ้าจำนวนไม่ตรง อย่าส่งมอบจนกว่าจะตรง

ตรวจ `.pdf` ต่อด้วย pypdf — นับหน้า นับรูป และยืนยันว่าเลขหน้าขึ้นครบทุกหน้า

```bash
python -c "
from pypdf import PdfReader
r = PdfReader('docs/sds/exports/02-system-overview.pdf')
print('หน้า', len(r.pages))
for i, p in enumerate(r.pages, 1):
    xo = p.get('/Resources', {}).get('/XObject', {})
    n = sum(1 for k in xo if xo[k].get_object().get('/Subtype') == '/Image')
    print(i, 'รูป', n, repr((p.extract_text() or '').strip().split(chr(10))[0][:40]))
"
```

**อย่าเทียบข้อความที่สกัดจาก PDF กับต้นฉบับตรง ๆ แล้วสรุปว่าเนื้อหาหาย** — ToUnicode ของ font subset แมปวรรณยุกต์บางตัวกลับไม่ได้ (ออกมาเป็น `\x00`) และสระอำถูกแยกเป็นนิคหิต + สระอา ทั้งสองอย่างเป็นข้อจำกัดของการสกัดข้อความ ไม่ใช่การเรนเดอร์ ถ้าจะตรวจเนื้อหาให้ครบจริง ให้ดูที่ HTML กลาง (`--keep-build`) หรือสั่ง Chrome ถ่ายภาพหน้าจอออกมาดู

```bash
python $S --keep-build --format pdf
<chrome> --disable-gpu --screenshot=preview.png --window-size=794,2400 --hide-scrollbars \
  "file:///<path>/02-system-overview-build/02-system-overview.html"
```

จากนั้นรายงานผู้ใช้ว่าไฟล์อยู่ที่ไหน ขนาดเท่าไร PDF กี่หน้า และมีภาพกี่ภาพ ถ้าเปิด Word ตรวจไม่ได้ในเครื่องนี้ ให้บอกตรง ๆ ว่าตรวจด้วยการนับโครงสร้าง ไม่ได้เปิดดูด้วยตา
