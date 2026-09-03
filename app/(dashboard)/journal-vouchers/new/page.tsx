"use client";

import { useRouter } from "next/navigation";
import { createJournalVoucher } from "@/actions/journal-vouchers";
import JournalVoucherForm, { JournalVoucherFormValues } from "../JournalVoucherForm";

export default function NewJournalVoucherPage() {
  const router = useRouter();

  async function handleSubmit(values: JournalVoucherFormValues) {
    const voucher = await createJournalVoucher(values);
    router.push(`/journal-vouchers/${voucher.id}`);
  }

  return (
    <JournalVoucherForm
      title="สร้างใบสำคัญรายวันทั่วไป"
      backHref="/journal-vouchers"
      submitLabel="บันทึก"
      savingLabel="กำลังบันทึก..."
      onSubmit={handleSubmit}
    />
  );
}
