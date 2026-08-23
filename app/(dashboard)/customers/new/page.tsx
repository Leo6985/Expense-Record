"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCustomer, getNextCustomerCode } from "@/actions/customers";
import Link from "next/link";

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextCode, setNextCode] = useState("");

  useEffect(() => {
    getNextCustomerCode().then(setNextCode);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const creditDaysInput = (form.get("creditDays") as string)?.trim();
    const creditDaysRaw = creditDaysInput ? parseInt(creditDaysInput) : undefined;
    const creditDays = creditDaysRaw !== undefined && !Number.isNaN(creditDaysRaw) ? creditDaysRaw : undefined;

    try {
      await createCustomer({
        code: form.get("code") as string,
        name: form.get("name") as string,
        taxId: (form.get("taxId") as string) || undefined,
        address: (form.get("address") as string) || undefined,
        contactPerson: (form.get("contactPerson") as string) || undefined,
        phone: (form.get("phone") as string) || undefined,
        email: (form.get("email") as string) || undefined,
        creditDays,
      });
      router.push("/customers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/customers" className="text-gray-400 hover:text-gray-600">
          ← กลับ
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มลูกค้าใหม่</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-2 gap-4">
            <Field key={nextCode} label="รหัสลูกค้า *" name="code" required placeholder="C00001" defaultValue={nextCode} />
            <Field label="ชื่อลูกค้า *" name="name" required placeholder="บริษัท ตัวอย่าง จำกัด" />
            <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" placeholder="0000000000000" />
            <Field label="เครดิต (วัน)" name="creditDays" type="number" placeholder="เช่น 30" />
          </div>
          <Field label="ที่อยู่" name="address" placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" />
        </Section>

        <Section title="ข้อมูลการติดต่อ">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ชื่อผู้ติดต่อ" name="contactPerson" placeholder="คุณ..." />
            <Field label="เบอร์โทรศัพท์" name="phone" placeholder="02-xxx-xxxx" />
            <Field label="อีเมล" name="email" type="email" placeholder="contact@company.com" />
          </div>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <Link
            href="/customers"
            className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label, name, type = "text", required, placeholder, defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
