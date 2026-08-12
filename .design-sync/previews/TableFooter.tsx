import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from "frontend";

const rooms = [
  { id: "1", name: "ห้องประชุม A", capacity: 8 },
  { id: "2", name: "ห้องประชุม Sky Lounge", capacity: 20 },
  { id: "3", name: "ห้องประชุม B (Executive)", capacity: 6 },
];

export function RoomsTable() {
  return (
    <Table>
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
      <TableFooter>
        <TableRow>
          <TableCell>รวมทั้งหมด</TableCell>
          <TableCell>{rooms.length} ห้อง</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
