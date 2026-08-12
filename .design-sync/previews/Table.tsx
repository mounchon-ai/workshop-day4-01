import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "frontend";

const rooms = [
  { id: "1", name: "ห้องประชุม A", capacity: 8, building: "อาคาร 1", floor: "3", status: "เปิดใช้งาน" },
  { id: "2", name: "ห้องประชุม Sky Lounge", capacity: 20, building: "อาคาร 2", floor: "12", status: "เปิดใช้งาน" },
  { id: "3", name: "ห้องประชุม B (Executive)", capacity: 6, building: "อาคาร 1", floor: "5", status: "ปิดใช้งาน" },
];

export function RoomsTable() {
  return (
    <Table>
      <TableCaption>รายการห้องประชุมทั้งหมดในองค์กร</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>ชื่อห้อง</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead>อาคาร</TableHead>
          <TableHead>ชั้น</TableHead>
          <TableHead>สถานะ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id}>
            <TableCell>{room.name}</TableCell>
            <TableCell>{room.capacity}</TableCell>
            <TableCell>{room.building}</TableCell>
            <TableCell>{room.floor}</TableCell>
            <TableCell>{room.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>รวมทั้งหมด</TableCell>
          <TableCell colSpan={4}>{rooms.length} ห้อง</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function Compact() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ชื่อห้อง</TableHead>
          <TableHead>สถานะ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id}>
            <TableCell>{room.name}</TableCell>
            <TableCell>{room.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
