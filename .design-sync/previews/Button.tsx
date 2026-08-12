import { Button } from "frontend";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant="default">ยืนยันการจอง</Button>
      <Button variant="outline">แก้ไข</Button>
      <Button variant="secondary">ดูรายละเอียด</Button>
      <Button variant="ghost">ยกเลิก</Button>
      <Button variant="destructive">ลบห้อง</Button>
      <Button variant="link">ดูทั้งหมด</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Button size="xs">XS</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button disabled>กำลังบันทึก...</Button>
      <Button variant="outline" disabled>
        ไม่พร้อมใช้งาน
      </Button>
    </div>
  );
}
