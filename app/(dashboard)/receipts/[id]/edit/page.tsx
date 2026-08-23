"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getReceipt, updateReceipt } from "@/actions/receipts";
import ReceiptForm, { ReceiptFormInitial, ReceiptFormValues } from "../../ReceiptForm";
import Link from "next/link";
import PageLoading from "@/components/PageLoading";

type Receipt = Awaited<ReturnType<typeof getReceipt>>;

export default function EditReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    getReceipt(params.id as string).then((data) => {
      setReceipt(data);
      if (!data || data.status !== "DRAFT") setLocked(true);
    });
  }, [params.id]);

  if (!receipt) return <PageLoading />;

  if (locked) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/receipts/${receipt.id}`} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
          <h1 className="text-2xl font-bold text-gray-900">แก้ไข {receipt.receiptNumber}</h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          ไม่สามารถแก้ไขการตัดชำระนี้ได้ เนื่องจากอนุมัติแล้วหรือถูกยกเลิกไปแล้ว
        </div>
      </div>
    );
  }

  const initialValues: ReceiptFormInitial = {
    receiptDate: new Date(receipt.receiptDate).toISOString().split("T")[0],
    recordedDate: new Date(receipt.recordedDate).toISOString().split("T")[0],
    companyBankAccountId: receipt.companyBankAccountId,
    paymentMethod: receipt.paymentMethod,
    referenceNumber: receipt.referenceNumber ?? "",
    feeAmount: String(receipt.feeAmount),
    withholdingTaxAmount: String(receipt.withholdingTaxAmount),
    withholdingTaxCertNumber: receipt.withholdingTaxCertNumber ?? "",
    actualReceivedAmount: String(receipt.actualReceivedAmount),
    notes: receipt.notes ?? "",
    items: receipt.items.map((item) => ({
      invoiceId: item.invoiceId,
      amount: String(item.amount),
    })),
  };

  async function handleSubmit(values: ReceiptFormValues) {
    await updateReceipt(receipt!.id, values);
    router.push(`/receipts/${receipt!.id}`);
  }

  return (
    <ReceiptForm
      title={`แก้ไข ${receipt.receiptNumber}`}
      backHref={`/receipts/${receipt.id}`}
      submitLabel="บันทึกการเปลี่ยนแปลง"
      savingLabel="กำลังบันทึก..."
      initialValues={initialValues}
      excludeReceiptId={receipt.id}
      onSubmit={handleSubmit}
    />
  );
}
