# 01 — Walking skeleton

**What to build:** เส้นทางเชื่อมต่อ Frontend และ Backend ที่ทำงานจริงครบวงจร พิสูจน์ว่าสถาปัตยกรรมตาม ADR-0003/ADR-0004 ใช้งานได้จริง ก่อนเริ่มงานฟีเจอร์ใดๆ ยังไม่มีสิ่งที่ผู้ใช้ปลายทางเห็นเป็นประโยชน์ — เป็นโครงพื้นฐานที่ ticket อื่นทั้งหมดต่อยอด

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Backend (Express + TypeScript) เริ่มทำงานได้ และมี health-check endpoint ที่ query ฐานข้อมูล SQLite ผ่าน Prisma แล้วตอบกลับสำเร็จ
- [ ] Frontend (Next.js + TypeScript + Tailwind + shadcn/ui) เริ่มทำงานได้ และเรียก health-check endpoint ของ Backend ตอนโหลดหน้า แล้วแสดงผลลัพธ์
- [ ] Backend เปิด CORS เฉพาะ origin ของ Frontend ที่กำหนดในค่าตั้งค่าเท่านั้น
- [ ] ทั้งสอง service รันพร้อมกันได้ด้วยคำสั่งเดียวผ่าน docker-compose โดยมีไฟล์ฐานข้อมูล SQLite ที่ persist ข้อมูลอยู่
- [ ] มี test harness ที่ยิง HTTP request ไปยัง Backend app จริงกับฐานข้อมูล SQLite จริง (ชุดทดสอบ) พร้อมเทสต์ตัวอย่างของ health-check endpoint ที่ผ่าน
- [ ] โครงสร้างโปรเจกต์แยก Backend และ Frontend เป็นสอง service อิสระภายใน repo เดียว ตรงตาม ADR-0004 (Frontend ไม่มีการเข้าถึงฐานข้อมูลโดยตรงและไม่มี API routes ของตัวเอง)
