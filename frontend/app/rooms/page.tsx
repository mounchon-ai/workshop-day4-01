"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiList } from "@/lib/use-api-list";

type Room = {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
  status: string;
};

export default function RoomsPage() {
  const { data: allRooms } = useApiList<Room>("/api/rooms");
  // Only active rooms are bookable, so a list meant to lead into "view this
  // room's calendar" has no use for a disabled one here — same filter the
  // search-first flows on `/` and `/calendar` already apply.
  const rooms = allRooms
    .filter((room) => room.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ห้องประชุมทั้งหมด</h1>

      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีห้องประชุมที่เปิดใช้งาน</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อห้อง</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>อาคาร</TableHead>
              <TableHead>ชั้น</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.id}>
                <TableCell>
                  <Link href={`/rooms/${room.id}`} className="underline-offset-4 hover:underline">
                    {room.name}
                  </Link>
                </TableCell>
                <TableCell>{room.capacity}</TableCell>
                <TableCell>{room.building}</TableCell>
                <TableCell>{room.floor}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
