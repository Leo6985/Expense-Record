"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getUser, updateUser } from "@/actions/users";
import Link from "next/link";

export default function EditUserPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "PURCHASING",
    level: "EMPLOYEE",
    isActive: true,
    password: "",
  });

  useEffect(() => {
    getUser(id).then((user) => {
      if (user) {
        setForm({ name: user.name, email: user.email, role: user.role, level: user.level, isActive: user.isActive, password: "" });
      }
      setFetching(false);
    });
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const updateData: Parameters<typeof updateUser>[1] = {
        name: form.name,
        email: form.email,
        role: form.role,
        level: form.level,
        isActive: form.isActive,
      };
      if (form.password) updateData.password = form.password;
      await updateUser(id, updateData);
      router.push("/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  if (fetching) return <div className="text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/users" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขผู้ใช้งาน</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-สกุล *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล *</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">แผนก / สิทธิ์การเข้าถึง *</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="PURCHASING">จัดซื้อ (เข้าได้เฉพาะ PO, GR)</option>
            <option value="ACCOUNTING">บัญชีและการเงิน (เข้าได้เฉพาะ AP, ใบเตรียมจ่าย, ชำระเงิน)</option>
            <option value="OWNER">เจ้าของ (เข้าได้ทั้งหมด)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ระดับพนักงาน *</label>
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="EMPLOYEE">พนักงาน (ทำรายการได้ ไม่สามารถอนุมัติ)</option>
            <option value="MANAGER">ผู้จัดการ (อนุมัติเอกสารได้)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
          <select value={form.isActive ? "true" : "false"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="true">ใช้งาน</option>
            <option value="false">ปิดใช้งาน</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">เปลี่ยนรหัสผ่าน (ถ้าต้องการ)</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} placeholder="ปล่อยว่างหากไม่ต้องการเปลี่ยน" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {loading ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
          </button>
          <Link href="/users" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">ยกเลิก</Link>
        </div>
      </form>
    </div>
  );
}
