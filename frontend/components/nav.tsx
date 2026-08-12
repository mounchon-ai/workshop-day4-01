"use client";

import Link from "next/link";

const employeeLinks = [
  { href: "/", label: "ค้นหาห้องว่าง" },
  { href: "/rooms", label: "ห้องทั้งหมด" },
  { href: "/calendar", label: "ปฏิทินห้องทั้งหมด" },
];

const adminLinks = [
  { href: "/admin/rooms", label: "จัดการห้อง" },
  { href: "/admin/employees", label: "จัดการพนักงาน" },
  { href: "/admin/business-hours", label: "เวลาทำการ" },
];

export function Nav() {
  return (
    <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-8 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {employeeLinks.map((link) => (
          <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
        {adminLinks.map((link) => (
          <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
