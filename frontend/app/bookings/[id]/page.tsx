"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { formatBangkok } from "@/lib/bangkok-time";
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

const STATUS_LABELS: Record<string, string> = {
  confirmed: "ยืนยันแล้ว",
  cancelled: "ยกเลิกแล้ว",
  completed: "เสร็จสิ้น",
};

function BookingDetail({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const employeeId = searchParams.get("employeeId");
  const backHref = employeeId ? `/bookings?employeeId=${employeeId}` : "/bookings";

  const [booking, setBooking] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const now = useNow();

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
          {STATUS_LABELS[booking.status] ?? booking.status}
        </p>
      </div>

      {isOwner && ended && (
        <p className="mt-2 text-sm text-muted-foreground">Booking นี้ผ่านไปแล้ว ไม่สามารถแก้ไขได้</p>
      )}

      <div className="mt-6 flex gap-2">
        <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
          กลับไปที่รายการ
        </Link>
        {isOwner && !ended && (
          <Link href={`/bookings/${booking.id}/edit?employeeId=${employeeId}`} className={buttonVariants({})}>
            แก้ไข
          </Link>
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
