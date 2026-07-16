"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/actions/users";
import Link from "next/link";

export default function NewUserPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await createUser({
        name: form.get("name") as string,
        email: form.get("email") as string,
        password: form.get("password") as string,
        role: form.get("role") as string,
        level: form.get("level") as string,
      });
      router.push("/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/users" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มผู้ใช้งานใหม่</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-สกุล *</label>
          <input name="name" required placeholder="ชื่อ นามสกุล" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล *</label>
          <input name="email" type="email" required placeholder="email@company.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน *</label>
          <input name="password" type="password" required minLength={6} placeholder="อย่างน้อย 6 ตัวอักษร" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">แผนก / สิทธิ์การเข้าถึง *</label>
          <select name="role" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="PURCHASING">จัดซื้อ (เข้าได้เฉพาะ PO, GR)</option>
            <option value="ACCOUNTING">บัญชีและการเงิน (เข้าได้เฉพาะ AP, ใบเตรียมจ่าย, ชำระเงิน)</option>
            <option value="OWNER">เจ้าของ (เข้าได้ทั้งหมด)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ระดับพนักงาน *</label>
          <select name="level" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="EMPLOYEE">พนักงาน (ทำรายการได้ ไม่สามารถอนุมัติ)</option>
            <option value="MANAGER">ผู้จัดการ (อนุมัติเอกสารได้)</option>
          </select>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {loading ? "กำลังบันทึก..." : "สร้างผู้ใช้งาน"}
          </button>
          <Link href="/users" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">ยกเลิก</Link>
        </div>
      </form>
    </div>
  );
}
