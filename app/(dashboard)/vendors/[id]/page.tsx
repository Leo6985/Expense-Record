"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getVendor, updateVendor } from "@/actions/vendors";
import Link from "next/link";

type Vendor = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditDays: number;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  isActive: boolean;
};

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getVendor(params.id as string).then(setVendor);
  }, [params.id]);

  if (!vendor) {
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
      await updateVendor(params.id as string, {
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
        <Link href="/vendors" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไขผู้ขาย: {vendor.code}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="ข้อมูลทั่วไป">
          <div className="grid grid-cols-2 gap-4">
            <Field label="รหัสผู้ขาย *" name="code" required defaultValue={vendor.code} />
            <Field label="ชื่อผู้ขาย *" name="name" required defaultValue={vendor.name} />
            <Field label="เลขผู้เสียภาษี" name="taxId" defaultValue={vendor.taxId ?? ""} />
            <Field label="เครดิต (วัน)" name="creditDays" type="number" defaultValue={String(vendor.creditDays)} />
          </div>
          <Field label="ที่อยู่" name="address" defaultValue={vendor.address ?? ""} />
        </Section>

        <Section title="ข้อมูลการติดต่อ">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ชื่อผู้ติดต่อ" name="contactPerson" defaultValue={vendor.contactPerson ?? ""} />
            <Field label="เบอร์โทรศัพท์" name="phone" defaultValue={vendor.phone ?? ""} />
            <Field label="อีเมล" name="email" type="email" defaultValue={vendor.email ?? ""} />
          </div>
        </Section>

        <Section title="ข้อมูลธนาคาร">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ธนาคาร" name="bankName" defaultValue={vendor.bankName ?? ""} />
            <Field label="สาขา" name="bankBranch" defaultValue={vendor.bankBranch ?? ""} />
            <Field label="เลขบัญชี" name="bankAccountNo" defaultValue={vendor.bankAccountNo ?? ""} />
            <Field label="ชื่อบัญชี" name="bankAccountName" defaultValue={vendor.bankAccountName ?? ""} />
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
          <Link href="/vendors" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
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
