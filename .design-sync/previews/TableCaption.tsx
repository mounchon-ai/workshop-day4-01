import { Table, TableHeader, TableBody, TableCaption, TableRow, TableHead, TableCell } from "frontend";

const rooms = [
  { id: "1", name: "ห้องประชุม A", capacity: 8 },
  { id: "2", name: "ห้องประชุม Sky Lounge", capacity: 20 },
];

export function RoomsTable() {
  return (
    <Table>
      <TableCaption>รายการห้องประชุมทั้งหมดในองค์กร</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>ชื่อห้อง</TableHead>
          <TableHead>Capacity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id}>
            <TableCell>{room.name}</TableCell>
            <TableCell>{room.capacity}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
