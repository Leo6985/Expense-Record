"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPaymentPrep, updatePaymentPrep } from "@/actions/payment-prep";
import PaymentPrepForm, { PaymentPrepFormInitial, PaymentPrepFormValues } from "../../PaymentPrepForm";
import Link from "next/link";

type Prep = Awaited<ReturnType<typeof getPaymentPrep>>;

export default function EditPaymentPrepPage() {
  const params = useParams();
  const router = useRouter();
  const [prep, setPrep] = useState<Prep>(null);
  const [notFoundOrLocked, setNotFoundOrLocked] = useState(false);

  useEffect(() => {
    getPaymentPrep(params.id as string).then((data) => {
      setPrep(data);
      if (!data || data.payment || data.status === "CANCELLED") setNotFoundOrLocked(true);
    });
  }, [params.id]);

  if (!prep) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  if (notFoundOrLocked) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/payment-prep/${prep.id}`} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
          <h1 className="text-2xl font-bold text-gray-900">แก้ไข {prep.prepNumber}</h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          ไม่สามารถแก้ไขใบเตรียมจ่ายนี้ได้ เนื่องจากมีการชำระเงินแล้วหรือถูกยกเลิกไปแล้ว
        </div>
      </div>
    );
  }

  const initialValues: PaymentPrepFormInitial = {
    paymentDate: new Date(prep.paymentDate).toISOString().split("T")[0],
    notes: prep.notes ?? "",
    items: prep.items.map((item) => ({
      apId: item.apId,
      amount: String(item.amount),
      whtRate: item.withholdingTaxRate,
    })),
  };

  async function handleSubmit(values: PaymentPrepFormValues) {
    await updatePaymentPrep(prep!.id, values);
    router.push(`/payment-prep/${prep!.id}`);
  }

  return (
    <PaymentPrepForm
      title={`แก้ไข ${prep.prepNumber}`}
      backHref={`/payment-prep/${prep.id}`}
      submitLabel="บันทึกการเปลี่ยนแปลง"
      savingLabel="กำลังบันทึก..."
      initialValues={initialValues}
      excludePrepId={prep.id}
      onSubmit={handleSubmit}
    />
  );
}
