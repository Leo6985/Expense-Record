"use client";

import { useRouter } from "next/navigation";
import { createPaymentPrep } from "@/actions/payment-prep";
import PaymentPrepForm, { PaymentPrepFormValues } from "../PaymentPrepForm";

export default function NewPaymentPrepPage() {
  const router = useRouter();

  async function handleSubmit(values: PaymentPrepFormValues) {
    await createPaymentPrep(values);
    router.push("/payment-prep");
  }

  return (
    <PaymentPrepForm
      title="สร้างใบเตรียมจ่าย"
      backHref="/payment-prep"
      submitLabel="สร้างใบเตรียมจ่าย"
      savingLabel="กำลังบันทึก..."
      onSubmit={handleSubmit}
    />
  );
}
