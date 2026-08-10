"use client";

import { useRouter } from "next/navigation";
import { createReceipt } from "@/actions/receipts";
import ReceiptForm, { ReceiptFormValues } from "../ReceiptForm";

export default function NewReceiptPage() {
  const router = useRouter();

  async function handleSubmit(values: ReceiptFormValues) {
    await createReceipt(values);
    router.push("/receipts");
  }

  return (
    <ReceiptForm
      title="บันทึกการรับชำระเงิน (ตัดชำระ)"
      backHref="/receipts"
      submitLabel="บันทึกการตัดชำระ"
      savingLabel="กำลังบันทึก..."
      onSubmit={handleSubmit}
    />
  );
}
