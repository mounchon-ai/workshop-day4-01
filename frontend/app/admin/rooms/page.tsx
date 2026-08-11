"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, type FieldError } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";

type Room = {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
  status: string;
};

const emptyForm = { name: "", capacity: "", building: "", floor: "" };

export default function AdminRoomsPage() {
  const { data: rooms, refresh: refreshRooms } = useApiList<Room>("/api/rooms");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [rowActingId, setRowActingId] = useState<string | null>(null);
  // Keyed by room id (not a single slot) — two different rows' actions can
  // fail around the same time, and each row's error must stay visible on
  // its own row rather than the later failure hiding the earlier one.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  function setRowError(roomId: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message === null) {
        delete next[roomId];
      } else {
        next[roomId] = message;
      }
      return next;
    });
  }

  function fieldError(field: string) {
    return fieldErrors.find((e) => e.field === field)?.message;
  }

  function startEdit(room: Room) {
    setEditingId(room.id);
    setForm({
      name: room.name,
      capacity: String(room.capacity),
      building: room.building,
      floor: room.floor,
    });
    setFieldErrors([]);
    setGeneralError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFieldErrors([]);
    setGeneralError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors([]);
    setGeneralError(null);

    const payload = {
      name: form.name,
      capacity: Number(form.capacity),
      building: form.building,
      floor: form.floor,
    };

    const result = editingId
      ? await apiRequest<Room>(`/api/rooms/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      : await apiRequest<Room>("/api/rooms", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    setSubmitting(false);

    if (!result.ok) {
      if (result.body.fields) {
        setFieldErrors(result.body.fields);
      } else if (result.body.message) {
        setGeneralError(result.body.message);
      } else {
        setGeneralError("เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
      return;
    }

    cancelEdit();
    await refreshRooms();
  }

  async function toggleStatus(room: Room) {
    setRowActingId(room.id);
    setRowError(room.id, null);

    const nextStatus = room.status === "active" ? "disabled" : "active";
    const result = await apiRequest<Room>(`/api/rooms/${room.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: room.name,
        capacity: room.capacity,
        building: room.building,
        floor: room.floor,
        status: nextStatus,
      }),
    });

    setRowActingId(null);

    if (!result.ok) {
      setRowError(room.id, result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }

    await refreshRooms();
  }

  async function confirmDelete(room: Room) {
    setRowActingId(room.id);
    setRowError(room.id, null);

    const result = await apiRequest<void>(`/api/rooms/${room.id}`, { method: "DELETE" });

    setRowActingId(null);
    setConfirmingDeleteId(null);

    if (!result.ok) {
      setRowError(room.id, result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }

    await refreshRooms();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">จัดการข้อมูล Room</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">{editingId ? "แก้ไขห้องประชุม" : "เพิ่มห้องประชุมใหม่"}</h2>

        {generalError && <p className="text-sm text-red-600">{generalError}</p>}

        <div className="flex flex-col gap-1">
          <Label htmlFor="name">ชื่อห้อง</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {fieldError("name") && <p className="text-sm text-red-600">{fieldError("name")}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            type="number"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          {fieldError("capacity") && (
            <p className="text-sm text-red-600">{fieldError("capacity")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="building">อาคาร</Label>
          <Input
            id="building"
            value={form.building}
            onChange={(e) => setForm({ ...form, building: e.target.value })}
          />
          {fieldError("building") && (
            <p className="text-sm text-red-600">{fieldError("building")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="floor">ชั้น</Label>
          <Input
            id="floor"
            value={form.floor}
            onChange={(e) => setForm({ ...form, floor: e.target.value })}
          />
          {fieldError("floor") && <p className="text-sm text-red-600">{fieldError("floor")}</p>}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {editingId ? "บันทึกการแก้ไข" : "เพิ่มห้อง"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              ยกเลิก
            </Button>
          )}
        </div>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อห้อง</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>อาคาร</TableHead>
            <TableHead>ชั้น</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => (
            <TableRow key={room.id}>
              <TableCell>{room.name}</TableCell>
              <TableCell>{room.capacity}</TableCell>
              <TableCell>{room.building}</TableCell>
              <TableCell>{room.floor}</TableCell>
              <TableCell>{room.status === "active" ? "เปิดใช้งาน" : "ปิดการใช้งาน"}</TableCell>
              <TableCell>
                {rowErrors[room.id] && (
                  <p className="mb-1 whitespace-normal text-sm text-red-600">{rowErrors[room.id]}</p>
                )}
                {confirmingDeleteId === room.id ? (
                  <div className="flex flex-col gap-1">
                    <p className="whitespace-normal text-sm">ยืนยันการลบห้องนี้หรือไม่?</p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={rowActingId === room.id}
                        onClick={() => confirmDelete(room)}
                      >
                        ยืนยันลบ
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowActingId === room.id}
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        ไม่ลบ
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowActingId === room.id}
                      onClick={() => startEdit(room)}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowActingId === room.id}
                      onClick={() => toggleStatus(room)}
                    >
                      {room.status === "active" ? "ปิดการใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={rowActingId === room.id}
                      onClick={() => {
                        setRowError(room.id, null);
                        setConfirmingDeleteId(room.id);
                      }}
                    >
                      ลบ
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
