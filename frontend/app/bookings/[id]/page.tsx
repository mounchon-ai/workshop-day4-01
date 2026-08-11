"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { formatBangkok } from "@/lib/bangkok-time";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status";
import { useNow } from "@/lib/use-now";

type Room = {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
};

type Booking = {
  id: string;
  title: string;
  attendeeCount: number;
  startAt: string;
  endAt: string;
  status: string;
  room: Room;
  employee: Employee;
};

function BookingDetail({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const employeeId = searchParams.get("employeeId");
  const backHref = employeeId ? `/bookings?employeeId=${employeeId}` : "/bookings";

  const [booking, setBooking] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const now = useNow();

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    apiRequest<Booking>(`/api/bookings/${id}`).then((result) => {
      if (ignore) return;
      if (result.ok) {
        setBooking(result.data);
      } else {
        setNotFound(true);
      }
    });
    return () => {
      ignore = true;
    };
  }, [id]);

  async function handleCancel() {
    if (!booking || !employeeId) return;
    setCancelling(true);
    setCancelError(null);

    const result = await apiRequest<Booking>(`/api/bookings/${booking.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ employeeId }),
    });

    setCancelling(false);
    setConfirmingCancel(false);

    if (result.ok) {
      setBooking(result.data);
      return;
    }

    if (result.body.error === "already_cancelled") {
      const body = result.body as { booking?: Booking };
      if (body.booking) setBooking(body.booking);
      return;
    }

    setCancelError(result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm text-red-600">ไม่พบ Booking ที่ต้องการ</p>
        <Link href={backHref} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปที่รายการ
        </Link>
      </div>
    );
  }

  if (!booking) {
    return null;
  }

  // A viewer with no ?employeeId= in the URL (e.g. landing here directly)
  // isn't "someone" yet, so ownership can't be established client-side —
  // the edit link stays hidden either way; PUT enforces this authoritatively.
  const isOwner = employeeId !== null && employeeId === booking.employee.id;
  const ended = new Date(booking.endAt).getTime() < now;
  // Once cancelled, a booking has no path back to "confirmed" (DR-08) — the
  // edit/cancel actions must hide for it the same as for an ended booking,
  // not just for the owner-and-not-ended condition alone.
  const canManage = isOwner && !ended && booking.status === "confirmed";

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">รายละเอียด Booking</h1>

      <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
        <p>
          <span className="font-medium">ห้อง:</span> {booking.room.name} ({booking.room.building}{" "}
          ชั้น {booking.room.floor}, Capacity {booking.room.capacity})
        </p>
        <p>
          <span className="font-medium">ผู้จอง:</span> {booking.employee.firstName}{" "}
          {booking.employee.lastName} ({booking.employee.department})
        </p>
        <p>
          <span className="font-medium">หัวข้อ:</span> {booking.title}
        </p>
        <p>
          <span className="font-medium">เวลาเริ่ม:</span> {formatBangkok(booking.startAt)}
        </p>
        <p>
          <span className="font-medium">เวลาสิ้นสุด:</span> {formatBangkok(booking.endAt)}
        </p>
        <p>
          <span className="font-medium">จำนวนผู้เข้าร่วม:</span> {booking.attendeeCount}
        </p>
        <p>
          <span className="font-medium">สถานะ:</span>{" "}
          {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
        </p>
      </div>

      {isOwner && ended && booking.status !== "cancelled" && (
        <p className="mt-2 text-sm text-muted-foreground">Booking นี้ผ่านไปแล้ว ไม่สามารถแก้ไขได้</p>
      )}

      {cancelError && <p className="mt-2 text-sm text-red-600">{cancelError}</p>}

      {confirmingCancel && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          <p>ยืนยันการยกเลิก Booking นี้หรือไม่?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={cancelling}
              onClick={handleCancel}
            >
              ยืนยันยกเลิก
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={cancelling}
              onClick={() => setConfirmingCancel(false)}
            >
              ไม่ยกเลิก
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
          กลับไปที่รายการ
        </Link>
        {canManage && (
          <Link href={`/bookings/${booking.id}/edit?employeeId=${employeeId}`} className={buttonVariants({})}>
            แก้ไข
          </Link>
        )}
        {canManage && !confirmingCancel && (
          <Button type="button" variant="destructive" onClick={() => setConfirmingCancel(true)}>
            ยกเลิกการจอง
          </Button>
        )}
      </div>
    </div>
  );
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Suspense fallback={null}>
      <BookingDetail id={id} />
    </Suspense>
  );
}
