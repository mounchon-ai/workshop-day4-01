# ใช้ SQLite ผ่าน Prisma เป็นฐานข้อมูล

เก็บข้อมูล Room, Employee และ Booking ด้วย SQLite ผ่าน Prisma ORM แทนการใช้ Postgres หรือฐานข้อมูลแบบ client-server อื่น

พิจารณา Postgres แล้วปฏิเสธ เพราะ deployment target คือ self-host/Docker สำหรับโปรเจกต์ต้นแบบ SQLite ไม่ต้องตั้งค่า database service แยก ไฟล์ฐานข้อมูลอยู่ในไฟล์เดียว ทำให้ตั้งค่าและรัน container ได้ง่ายกว่า

ผลที่ตามมา: หากในอนาคตต้องขยายเป็น multi-instance deployment หรือรองรับ concurrent write สูง (เช่น เปลี่ยนเป็น multi-tenant ตาม [[0001-single-tenant-data-model]]) จะต้อง migrate ไป Postgres เพราะ SQLite ไม่รองรับการเขียนพร้อมกันจากหลาย process/container ได้ดี
