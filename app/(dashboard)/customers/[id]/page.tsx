"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getCustomer, updateCustomer } from "@/actions/customers";
import Link from "next/link";

type Customer = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditDays: number;
  isActive: boolean;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getCustomer(params.id as string).then(setCustomer);
  }, [params.id]);

  if (!customer) {
    return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const form = new FormData(e.currentTarget);
    const creditDaysRaw = parseInt(form.get("creditDays") as string);
    const creditDays = Number.isNaN(creditDaysRaw) ? 30 : creditDaysRaw;

    try {
      await updateCustomer(params.id as string, {
        code: form.get("code") as string,
        name: form.get("name") as string,
        taxId: (form.get("taxId") as string) || undefined,
        address: (form.get("address") as string) || undefined,
        contactPerson: (form.get("contactPerson") as string) || undefined,
        phone: (form.get("phone") as string) || undefined,
        email: (form.get("email") as string) || undefined,
        creditDays,
        isActive: form.get("isActive") === "true",
      });
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/customers" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขลูกค้า: {customer.code}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-2 gap-4">
            <Field label="รหัสลูกค้า *" name="code" required defaultValue={customer.code} />
            <Field label="ชื่อลูกค้า *" name="name" required defaultValue={customer.name} />
            <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" defaultValue={customer.taxId ?? ""} />
            <Field label="เครดิต (วัน)" name="creditDays" type="number" defaultValue={String(customer.creditDays)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
              <select
                name="isActive"
                defaultValue={customer.isActive ? "true" : "false"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="true">ใช้งาน</option>
                <option value="false">ปิดใช้</option>
              </select>
            </div>
          </div>
          <Field label="ที่อยู่" name="address" defaultValue={customer.address ?? ""} />
        </Section>

        <Section title="ข้อมูลการติดต่อ">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ชื่อผู้ติดต่อ" name="contactPerson" defaultValue={customer.contactPerson ?? ""} />
            <Field label="เบอร์โทรศัพท์" name="phone" defaultValue={customer.phone ?? ""} />
            <Field label="อีเมล" name="email" type="email" defaultValue={customer.email ?? ""} />
          </div>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">บันทึกสำเร็จ</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
          </button>
          <Link href="/customers" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            กลับ
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

function Field({ label, name, type = "text", required, defaultValue }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
