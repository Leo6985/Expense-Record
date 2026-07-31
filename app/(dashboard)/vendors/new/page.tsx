"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createVendor, getNextVendorCode } from "@/actions/vendors";
import Link from "next/link";

export default function NewVendorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextCode, setNextCode] = useState("");

  useEffect(() => {
    getNextVendorCode().then(setNextCode);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const creditDaysRaw = parseInt(form.get("creditDays") as string);
    const creditDays = Number.isNaN(creditDaysRaw) ? 30 : creditDaysRaw;

    try {
      await createVendor({
        code: form.get("code") as string,
        name: form.get("name") as string,
        taxId: (form.get("taxId") as string) || undefined,
        address: (form.get("address") as string) || undefined,
        contactPerson: (form.get("contactPerson") as string) || undefined,
        phone: (form.get("phone") as string) || undefined,
        email: (form.get("email") as string) || undefined,
        creditDays,
        bankName: (form.get("bankName") as string) || undefined,
        bankBranch: (form.get("bankBranch") as string) || undefined,
        bankAccountNo: (form.get("bankAccountNo") as string) || undefined,
        bankAccountName: (form.get("bankAccountName") as string) || undefined,
      });
      router.push("/vendors");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendors" className="text-gray-400 hover:text-gray-600">
          ← กลับ
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มผู้ขายใหม่</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-2 gap-4">
            <Field key={nextCode} label="รหัสผู้ขาย *" name="code" required placeholder="V00001" defaultValue={nextCode} />
            <Field label="ชื่อผู้ขาย *" name="name" required placeholder="บริษัท ตัวอย่าง จำกัด" />
            <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" placeholder="0000000000000" />
            <Field label="เครดิต (วัน)" name="creditDays" type="number" defaultValue="30" />
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

        <Section title="ข้อมูลธนาคาร">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ธนาคาร" name="bankName" placeholder="ธนาคารกสิกรไทย" />
            <Field label="สาขา" name="bankBranch" placeholder="สาขาสีลม" />
            <Field label="เลขบัญชี" name="bankAccountNo" placeholder="xxx-x-xxxxx-x" />
            <Field label="ชื่อบัญชี" name="bankAccountName" placeholder="ชื่อบัญชีตามสมุดบัญชี" />
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
            href="/vendors"
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
