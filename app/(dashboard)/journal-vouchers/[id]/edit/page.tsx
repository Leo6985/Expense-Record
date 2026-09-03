"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getJournalVoucher, updateJournalVoucher } from "@/actions/journal-vouchers";
import JournalVoucherForm, { JournalVoucherFormValues, JournalVoucherFormInitial } from "../../JournalVoucherForm";
import PageLoading from "@/components/PageLoading";

export default function EditJournalVoucherPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [initial, setInitial] = useState<JournalVoucherFormInitial | null>(null);
  const [notAllowed, setNotAllowed] = useState<string | null>(null);

  useEffect(() => {
    getJournalVoucher(id).then((v) => {
      if (!v) return setNotAllowed("ไม่พบใบสำคัญรายวัน");
      if (v.status !== "DRAFT") return setNotAllowed("แก้ไขได้เฉพาะเอกสารที่ยังไม่อนุมัติ");
      setInitial({
        voucherDate: v.voucherDate.toISOString().split("T")[0],
        description: v.description,
        notes: v.notes ?? "",
        lines: v.lines.map((l) => ({
          accountCode: l.account.code,
          department: l.department ?? "",
          description: l.description ?? "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
        })),
      });
    });
  }, [id]);

  if (notAllowed) {
    return (
      <div className="max-w-2xl">
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">{notAllowed}</div>
      </div>
    );
  }
  if (!initial) return <PageLoading />;

  async function handleSubmit(values: JournalVoucherFormValues) {
    await updateJournalVoucher(id, values);
    router.push(`/journal-vouchers/${id}`);
  }

  return (
    <JournalVoucherForm
      title="แก้ไขใบสำคัญรายวันทั่วไป"
      backHref={`/journal-vouchers/${id}`}
      submitLabel="บันทึกการแก้ไข"
      savingLabel="กำลังบันทึก..."
      initialValues={initial}
      onSubmit={handleSubmit}
    />
  );
}
