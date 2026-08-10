"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getReceipt, approveReceipt, unapproveReceipt, cancelReceipt } from "@/actions/receipts";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

type Receipt = Awaited<ReturnType<typeof getReceipt>>;

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [receipt, setReceipt] = useState<Receipt>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const u = session?.user as { level?: string; role?: string } | undefined;
  const isManager = u?.level === "MANAGER" || u?.role === "OWNER";

  useEffect(() => {
    getReceipt(params.id as string).then(setReceipt);
  }, [params.id]);

  if (!receipt) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const s = statusConfig[receipt.status] ?? { label: receipt.status, color: "bg-gray-100 text-gray-700" };

  async function handleApprove() {
    if (!confirm("ยืนยันการอนุมัติการตัดชำระนี้?")) return;
    setLoading(true);
    setError("");
    try {
      await approveReceipt(receipt!.id);
      setReceipt({ ...receipt!, status: "APPROVED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleUnapprove() {
    if (!confirm("ยืนยันการยกเลิกอนุมัติ? เอกสารจะกลับไปเป็นสถานะร่างและแก้ไขได้")) return;
    setLoading(true);
    setError("");
    try {
      await unapproveReceipt(receipt!.id);
      setReceipt({ ...receipt!, status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("ยืนยันการยกเลิกการตัดชำระนี้? ใบกำกับภาษีขายที่เกี่ยวข้องจะถูกคืนสถานะ")) return;
    setLoading(true);
    await cancelReceipt(receipt!.id);
    router.push("/receipts");
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/receipts" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{receipt.receiptNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {receipt.status === "DRAFT" && isManager && (
          <button onClick={handleApprove} disabled={loading} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            อนุมัติ
          </button>
        )}
        {receipt.status === "DRAFT" && !isManager && (
          <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">
            รอผู้จัดการอนุมัติ
          </span>
        )}
        {receipt.status === "DRAFT" && (
          <Link
            href={`/receipts/${params.id}/edit`}
            className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            แก้ไข
          </Link>
        )}
        {receipt.status === "APPROVED" && isManager && (
          <button onClick={handleUnapprove} disabled={loading} className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-50 transition-colors">
            ยกเลิกอนุมัติ
          </button>
        )}
        {(receipt.status === "DRAFT" || receipt.status === "APPROVED") && (
          <button onClick={handleCancel} disabled={loading} className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
            ยกเลิก
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ใบรับชำระเงิน</h2>
        <div className="grid grid-cols-2 gap-4 text-sm mb-5">
          <div><div className="text-xs text-gray-500">เลขที่</div><div className="font-mono font-medium">{receipt.receiptNumber}</div></div>
          <div><div className="text-xs text-gray-500">วันที่รับชำระ</div><div className="font-medium">{formatDate(receipt.receiptDate)}</div></div>
          <div><div className="text-xs text-gray-500">วิธีการรับชำระ</div><div className="font-medium">{receipt.paymentMethod}</div></div>
          {receipt.referenceNumber && <div><div className="text-xs text-gray-500">เลขที่อ้างอิง</div><div className="font-mono font-medium">{receipt.referenceNumber}</div></div>}
          <div className="col-span-2"><div className="text-xs text-gray-500">บัญชีที่รับเงิน</div><div className="font-medium">{receipt.companyBankAccount.bankName} {receipt.companyBankAccount.accountNo} {receipt.companyBankAccount.accountName}</div></div>
          <div><div className="text-xs text-gray-500">ผู้จัดทำ</div><div className="font-medium">{receipt.createdByName ?? "-"}</div></div>
          <div><div className="text-xs text-gray-500">ผู้อนุมัติ</div><div className="font-medium">{receipt.approvedByName ?? "-"}</div></div>
          {receipt.notes && <div className="col-span-2"><div className="text-xs text-gray-500">หมายเหตุ</div><div className="font-medium">{receipt.notes}</div></div>}
        </div>

        <h3 className="font-medium text-gray-700 mb-3 text-sm">รายการใบกำกับภาษีขาย</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-2 px-2 font-medium text-gray-600">เลขที่ใบกำกับภาษี</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">ลูกค้า</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">วันที่</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2 px-2 font-mono text-xs">
                  <Link href={`/sales-invoices/${item.invoiceId}`} className="text-blue-700 hover:underline">
                    {item.invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="py-2 px-2">{item.invoice.customer.name}</td>
                <td className="py-2 px-2 text-gray-600 text-xs">{formatDate(item.invoice.invoiceDate)}</td>
                <td className="py-2 px-2 text-right font-medium">฿{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={3} className="pt-2 text-right text-gray-600 text-sm">ยอดรวม</td>
              <td className="pt-2 text-right font-bold text-blue-700">฿{formatCurrency(receipt.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
