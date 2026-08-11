# แยกเป็น Backend API (Express) และ Frontend (Next.js) คนละส่วน

เปลี่ยนจากแผนเดิมที่ให้ Next.js ทำหน้าที่ full-stack เดียว (UI + API routes + Prisma ในแอปเดียวกัน) มาเป็นแยกสองส่วนอย่างชัดเจนภายใน monorepo เดียวกัน:

- **`/backend`** — Express + TypeScript ให้บริการ REST API, ถือ Prisma/SQLite (ดู [[0003-sqlite-persistence]]) และ business logic ทั้งหมด (business hours, conflict check, capacity check)
- **`/frontend`** — Next.js + TypeScript + Tailwind + shadcn/ui ทำหน้าที่ UI เท่านั้น เรียก backend ผ่าน REST (fetch) ไม่มี API routes หรือ Prisma ของตัวเอง

เลือกแยกส่วนตามคำขอผู้ใช้เพื่อให้ concern ของ UI กับ business logic/data access แยกจากกันชัดเจน แลกกับความซับซ้อนที่เพิ่มขึ้น (ต้องรัน 2 service, จัดการ CORS, deploy 2 container ผ่าน docker-compose) เทียบกับแผนเดิมที่ deploy เป็น container เดียว
