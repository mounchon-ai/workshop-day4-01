import { Input } from "frontend";

export function Default() {
  return <Input placeholder="ชื่อห้องประชุม" style={{ maxWidth: 280 }} />;
}

export function WithValue() {
  return <Input defaultValue="ห้องประชุม Sky Lounge" style={{ maxWidth: 280 }} />;
}

export function Disabled() {
  return <Input defaultValue="ไม่สามารถแก้ไขได้" disabled style={{ maxWidth: 280 }} />;
}

export function Invalid() {
  return <Input defaultValue="99" aria-invalid style={{ maxWidth: 280 }} />;
}
