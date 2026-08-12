import { Label, Input } from "frontend";

export function WithInput() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 280 }}>
      <Label htmlFor="room-name">ชื่อห้อง</Label>
      <Input id="room-name" defaultValue="ห้องประชุม A" />
    </div>
  );
}

export function DisabledField() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 280 }}>
      <Label htmlFor="attendee-count">จำนวนผู้เข้าร่วม</Label>
      <Input id="attendee-count" defaultValue="8" disabled />
    </div>
  );
}
