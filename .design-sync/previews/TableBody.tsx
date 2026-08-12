import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "frontend";

const rooms = [
  { id: "1", name: "ห้องประชุม A", capacity: 8, status: "เปิดใช้งาน" },
  { id: "2", name: "ห้องประชุม Sky Lounge", capacity: 20, status: "เปิดใช้งาน" },
  { id: "3", name: "ห้องประชุม B (Executive)", capacity: 6, status: "ปิดใช้งาน" },
];

export function RoomsTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ชื่อห้อง</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead>สถานะ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id}>
            <TableCell>{room.name}</TableCell>
            <TableCell>{room.capacity}</TableCell>
            <TableCell>{room.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
