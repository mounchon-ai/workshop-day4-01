# สูตร mermaid ต่อชนิด diagram

Mermaid ไม่มีชนิด diagram สำหรับ DFD, BPMN และ Use Case โดยตรง — สามอันนี้เขียนด้วย `flowchart` ตามธรรมเนียมรูปทรงที่กำหนดไว้ด้านล่าง ใช้ให้เหมือนกันทั้งเอกสารเพื่อให้ผู้อ่านจำรูปทรงได้

| Diagram ที่ต้องการ | ชนิด mermaid | ธรรมเนียมรูปทรง |
|---|---|---|
| System Context / DFD Level 0–2 | `flowchart` | external entity `["…"]` · process `(("…"))` · data store `[("…")]` |
| BPMN As-Is / To-Be | `flowchart` + `subgraph` เป็น lane | event `(("…"))` · task `["…"]` · gateway `{"…"}` · end `((("…")))` |
| Stakeholder Map | `mindmap` | — |
| Use Case Diagram | `flowchart` + `subgraph` เป็นขอบเขตระบบ | actor `(["…"])` · use case `(("…"))` · association `---` |
| Activity Diagram | `flowchart TD` | decision `{"…"}` |
| State Diagram | `stateDiagram-v2` | — |
| Workload / Concurrent User | `xychart-beta` | — |
| Conceptual ERD | `erDiagram` | — |
| Wireframe | `block-beta` | — |
| Integration / Interface | `flowchart` + `subgraph` เป็นโซน | — |
| ลำดับการเรียก API | `sequenceDiagram` | — |

ตัวอย่างทั้งหมดด้านล่างใช้โดเมนระบบจองห้องประชุมเป็นตัวอย่าง เปลี่ยนเนื้อในให้ตรงโดเมนจริง แต่คงโครงและรูปทรงไว้

---

## System Context Diagram (DFD Level 0)

ระบบเป็น process เดียวหมายเลข 0 ล้อมด้วย external entity และทุกเส้นต้องมีชื่อ data flow

```mermaid
flowchart LR
    EMP["พนักงาน"]
    ADM["ผู้ดูแลข้อมูลห้อง"]
    SYS(("0<br/>ระบบจองห้องประชุม"))
    EMP -->|"เงื่อนไขค้นหา และ คำขอจอง"| SYS
    SYS -->|"รายการห้องว่าง และ ผลการจอง"| EMP
    ADM -->|"ข้อมูล Room และรายชื่อ Employee"| SYS
    SYS -->|"รายงานการใช้ห้อง"| ADM
    classDef ext fill:#e8eefc,stroke:#33415c,stroke-width:1px
    classDef proc fill:#e3f3e6,stroke:#2d6a4f,stroke-width:2px
    class EMP,ADM ext
    class SYS proc
```

## DFD Level 1

แตก process 0 เป็น 1.0, 2.0, … เลข Level 2 ต้องสืบจากเลขแม่ (1.0 → 1.1, 1.2)

```mermaid
flowchart TD
    EMP["พนักงาน"]
    P1(("1.0<br/>ค้นหาห้องว่าง"))
    P2(("2.0<br/>สร้าง Booking"))
    P3(("3.0<br/>ยกเลิก Booking"))
    D1[("D1 Room")]
    D2[("D2 Booking")]
    D3[("D3 Employee")]
    EMP -->|"วันที่ ช่วงเวลา จำนวนผู้เข้าร่วม"| P1
    D1 -->|"รายการห้องและ Capacity"| P1
    D2 -->|"Booking ที่มีอยู่"| P1
    P1 -->|"รายการห้องว่าง"| EMP
    EMP -->|"ข้อมูล Booking ที่ต้องการสร้าง"| P2
    D3 -->|"รายชื่อ Employee"| P2
    P2 -->|"Booking ที่ผ่านการตรวจสอบ"| D2
    P2 -->|"ผลการจอง หรือ เหตุผลที่ปฏิเสธ"| EMP
    EMP -->|"รหัส Booking ที่ต้องการยกเลิก"| P3
    P3 -->|"ปรับสถานะเป็นยกเลิก"| D2
```

## BPMN — As-Is และ To-Be

ใช้ `subgraph` หนึ่งอันต่อหนึ่ง lane และ **ใช้ lane ชุดเดียวกันทั้งสองภาพ** เพื่อให้เทียบกันได้

```mermaid
flowchart LR
    subgraph L1["พนักงาน"]
        direction TB
        S1(("เริ่ม")) --> A1["โทรสอบถามห้องว่าง"]
        A1 --> A2["แจ้งวัน เวลา จำนวนผู้เข้าร่วม"]
        A3["รับทราบผล"] --> E1((("จบ")))
    end
    subgraph L2["เจ้าหน้าที่ธุรการ"]
        direction TB
        B1["เปิดสมุดจองกระดาษ"] --> G1{"ห้องว่างหรือไม่"}
        G1 -->|"ว่าง"| B2["จดบันทึกลงสมุด"]
        G1 -->|"ไม่ว่าง"| B3["แจ้งให้เลือกเวลาใหม่"]
    end
    A2 --> B1
    B2 --> A3
    B3 --> A2
```

ภาพ To-Be ใช้โครงเดียวกัน แต่แทน task ที่คนทำด้วย task ของระบบ และใต้ภาพต้องมีย่อหน้าสรุปว่าขั้นตอนไหนหายไปและเวลาที่ประหยัดได้

## Stakeholder Map

```mermaid
mindmap
  root(("ระบบจองห้องประชุม"))
    ผู้ใช้งานหลัก
      พนักงานผู้จอง
      ผู้เข้าร่วมประชุม
    ผู้ดูแลระบบ
      ฝ่ายเทคโนโลยีสารสนเทศ
      ฝ่ายอาคารสถานที่
    ผู้กำกับดูแล
      ผู้บริหารหน่วยงาน
      เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล
```

## Use Case Diagram

```mermaid
flowchart LR
    EMP(["พนักงาน"])
    ADM(["ผู้ดูแลข้อมูลห้อง"])
    subgraph SYS["ขอบเขตระบบจองห้องประชุม"]
        UC1(("UC-01<br/>ค้นหาห้องว่าง"))
        UC2(("UC-02<br/>สร้าง Booking"))
        UC3(("UC-03<br/>ยกเลิก Booking"))
        UC4(("UC-04<br/>ดูรายการ Booking ของตน"))
        UC5(("UC-05<br/>จัดการข้อมูล Room"))
        UC2 -.->|"include"| UC1
        UC3 -.->|"include"| UC4
    end
    EMP --- UC1
    EMP --- UC2
    EMP --- UC3
    EMP --- UC4
    ADM --- UC5
```

## Activity Diagram

decision node ต้องครบทุกกรณีที่ระบุใน Exception Flows ของ Use Case Description

```mermaid
flowchart TD
    ST((" ")) --> A1["เลือกวันที่และช่วงเวลา"]
    A1 --> A2["ระบบแสดงรายการห้องว่าง"]
    A2 --> A3["กรอกหัวข้อประชุมและจำนวนผู้เข้าร่วม"]
    A3 --> G1{"อยู่ใน Business Hours หรือไม่"}
    G1 -->|"ไม่อยู่"| X1["แจ้งเหตุ นอกเวลาทำการ"]
    G1 -->|"อยู่"| G2{"จำนวนผู้เข้าร่วมไม่เกิน Capacity หรือไม่"}
    G2 -->|"เกิน"| X2["แจ้งเหตุ เกิน Capacity ของห้อง"]
    G2 -->|"ไม่เกิน"| G3{"เกิด Conflict หรือไม่"}
    G3 -->|"เกิด"| X3["แจ้งเหตุ ช่วงเวลาซ้อนทับกับ Booking อื่น"]
    G3 -->|"ไม่เกิด"| A4["บันทึก Booking และแสดงผลสำเร็จ"]
    A4 --> EN(((" ")))
    X1 --> A1
    X2 --> A3
    X3 --> A1
```

## State Diagram

ชื่อสถานะภาษาไทยต้องประกาศด้วย `state "…" as ID` เพราะ ID ต้องเป็น ASCII

```mermaid
stateDiagram-v2
    direction LR
    state "ยืนยันแล้ว" as Confirmed
    state "ยกเลิกแล้ว" as Cancelled
    state "เสร็จสิ้น" as Completed
    [*] --> Confirmed : สร้าง Booking ผ่านการตรวจสอบครบ
    Confirmed --> Confirmed : เจ้าของแก้ไขเวลา และตรวจซ้ำผ่าน
    Confirmed --> Cancelled : เจ้าของกดยกเลิกก่อนเวลาเริ่ม
    Confirmed --> Completed : ระบบปรับสถานะเมื่อเลยเวลาสิ้นสุด
    Cancelled --> [*]
    Completed --> [*]
    note right of Confirmed
        เฉพาะ Employee ที่มี Ownership
        เท่านั้นที่แก้ไขหรือยกเลิกได้
    end note
```

## Workload / Concurrent User Chart

```mermaid
xychart-beta
    title "จำนวนผู้ใช้พร้อมกันรายชั่วโมงในวันทำการ"
    x-axis ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17"]
    y-axis "ผู้ใช้พร้อมกัน (คน)" 0 --> 120
    bar [15, 65, 95, 70, 25, 55, 100, 85, 60, 30]
    line [15, 65, 95, 70, 25, 55, 100, 85, 60, 30]
```

ใต้ภาพต้องระบุชั่วโมงเร่งด่วน (peak) และผูกตัวเลข peak เข้ากับรหัส `NFR-PERF-*` ที่กำหนดจำนวนผู้ใช้พร้อมกัน

## Conceptual ERD

ชื่อ entity และ attribute เป็น ASCII เท่านั้น ชื่อภาษาไทยไปอยู่ในตาราง Data Dictionary

```mermaid
erDiagram
    EMPLOYEE ||--o{ BOOKING : "เป็นเจ้าของ"
    ROOM ||--o{ BOOKING : "ถูกจองใน"
    EMPLOYEE {
        string employee_id PK
        string full_name
        string department
    }
    ROOM {
        string room_id PK
        string name
        int capacity
        string building
        string floor
    }
    BOOKING {
        string booking_id PK
        string room_id FK
        string employee_id FK
        datetime start_at
        datetime end_at
        string title
        int attendee_count
        string status
    }
```

## Wireframe

ระดับกล่องและตำแหน่งเท่านั้น ไม่ลงสีหรือฟอนต์

```mermaid
block-beta
columns 4
  header["แถบหัวเรื่อง — ระบบจองห้องประชุม"]:4
  fDate["เลือกวันที่"] fTime["ช่วงเวลา"] fCap["จำนวนผู้เข้าร่วม"] fBtn["ปุ่มค้นหา"]
  list["ตารางห้องว่าง — ชื่อห้อง / Capacity / ที่ตั้ง / ปุ่มจอง"]:4
  space form["ฟอร์มยืนยัน — ผู้จอง หัวข้อประชุม จำนวนผู้เข้าร่วม"]:2 space
  space bCancel["ยกเลิก"] bOk["ยืนยันการจอง"] space
```

## Integration / Interface Diagram

ทุกเส้นต้องระบุโปรโตคอลและรูปแบบข้อมูล เส้นประ = ยังไม่เชื่อมต่อในเฟสนี้

```mermaid
flowchart LR
    subgraph CLIENT["อุปกรณ์ผู้ใช้"]
        BROWSER["เว็บเบราว์เซอร์"]
    end
    subgraph APP["ระบบจองห้องประชุม"]
        FE["Frontend (Next.js)"]
        BE["Backend API (Express)"]
        DB[("ฐานข้อมูล SQLite")]
    end
    subgraph EXT["ระบบภายนอก"]
        HR["ระบบข้อมูลบุคลากร"]
    end
    BROWSER -->|"HTTPS / HTML"| FE
    FE -->|"REST / JSON"| BE
    BE -->|"Prisma / SQL"| DB
    BE -.->|"นำเข้ารายชื่อ Employee — ยังไม่เชื่อมต่อ"| HR
```

## Sequence Diagram (ประกอบตาราง API)

```mermaid
sequenceDiagram
    autonumber
    actor EMP as พนักงาน
    participant FE as Frontend
    participant BE as Backend API
    participant DB as ฐานข้อมูล
    EMP->>FE: เลือกห้องและช่วงเวลา
    FE->>BE: POST /api/bookings
    BE->>DB: อ่าน Booking ของ Room ในช่วงเวลาเดียวกัน
    DB-->>BE: รายการที่ซ้อนทับ
    alt ไม่เกิด Conflict
        BE->>DB: บันทึก Booking
        BE-->>FE: 201 Created
    else เกิด Conflict
        BE-->>FE: 409 Conflict
    end
    FE-->>EMP: แสดงผลการจอง
```

---

## รายการดักพลาด

หกข้อแรกทำให้ **ทั้งภาพพัง** (ทดสอบกับ mermaid 11 แล้ว) สองข้อท้ายเป็นธรรมเนียมของเอกสารชุดนี้

1. **Node ID ต้องเป็น ASCII** — `ค้นหา["ก"]` ทำให้ทั้งภาพพังด้วย lexical error ทั้งในและนอก `subgraph` ข้อความไทยอยู่ในรูปทรงเท่านั้น: `A1["ค้นหาห้องว่าง"]`
2. **ห่อ label ทุกอันด้วย `"…"`** ทั้งของ node และของเส้น (`-->|"…"|`) — กฎข้อเดียวนี้ครอบคลุมอักขระพิเศษทั้งหมด `( )` และ `{ }` ที่ไม่ห่อพังแน่นอน ส่วน `# , ; : /` รอดได้แต่ไม่ต้องเสี่ยง
3. **`"` ในข้อความใช้ `#quot;`** — ใส่ `"` ตรง ๆ ในสตริงที่ห่อไว้แล้วทำให้ parse พัง; ขึ้นบรรทัดใหม่ใช้ `<br/>`
4. **`end` ตัวพิมพ์เล็กลอย ๆ เป็น node ทำให้พัง** เพราะชนกับตัวปิด `subgraph` — ถ้าต้องใช้เป็นข้อความให้ห่อเป็น `B1["end"]`
5. **`%%` ต้องอยู่ต้นบรรทัดของตัวเอง** ต่อท้ายบรรทัดอื่นทำให้ parse พัง
6. **`mindmap` เยื้องด้วย space ล้วน** ถ้ามี tab ปนจะได้ error `There can be only one root`
7. **`<` ที่ติดตัวอักษรทันที** (`<b`, `<bold>`) ถูกอ่านเป็น HTML tag แล้วข้อความหายไปตอน render — เขียนเป็นคำ ("ไม่เกิน", "มากกว่า") ส่วน `<=` และ `<` ที่มีเว้นวรรคตามหลังปลอดภัย
8. **`stateDiagram-v2` ประกาศ `state "ชื่อไทย" as ID`** และ **`erDiagram` ใช้ชื่อ entity/attribute เป็น ASCII** — parser รับภาษาไทยได้ทั้งคู่ แต่เอกสารชุดนี้ต้องอ้างรหัสสถานะและชื่อ attribute ข้ามบท (State Diagram ↔ บทที่ 3, ERD ↔ Data Dictionary บทที่ 5) จึงต้องมี ID ที่คงที่

## ตรวจจริงด้วยสคริปต์

```
node .claude/skills/srs/scripts/check-mermaid.mjs docs/sds
```

รับได้ทั้งไฟล์และโฟลเดอร์ รายงานเป็น `ไฟล์:บรรทัด` ของบล็อกที่พัง และคืน exit code ไม่เป็นศูนย์เมื่อมีบล็อกไม่ผ่าน
ครั้งแรกจะติดตั้ง mermaid + jsdom ลงโฟลเดอร์ชั่วคราวของระบบ ไม่แตะ `package.json` ของโปรเจกต์
สคริปต์ตรวจ **ไวยากรณ์** เท่านั้น ข้อ 7 (การ render) ยังต้องอาศัยการอ่านด้วยตา
