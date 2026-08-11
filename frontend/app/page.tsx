"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type HealthStatus = "checking" | "ok" | "error";

export default function Home() {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    fetch(`${apiUrl}/api/health`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { status: string }) => {
        setStatus(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Meeting Room Booking</h1>
      <p data-testid="health-status">
        Backend status:{" "}
        {status === "checking" && "กำลังตรวจสอบ..."}
        {status === "ok" && "เชื่อมต่อสำเร็จ"}
        {status === "error" && "เชื่อมต่อไม่สำเร็จ"}
      </p>
      <Button disabled>เริ่มค้นหาห้องประชุม (เร็วๆ นี้)</Button>
    </div>
  );
}
