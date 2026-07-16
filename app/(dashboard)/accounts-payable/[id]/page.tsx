"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getAccountsPayableById, approveAccountsPayable, cancelAccountsPayable } from "@/actions/accounts-payable";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอดำเนินการ", color: "bg-yellow-100 text-yellow-700" },
  APPROVED: { label: "อนุมัติ", color: "bg-blue-100 text-blue-700" },
  PAYMENT_PREP: { label: "เตรียมจ่าย", color: "bg-purple-100 text-purple-700" },
  PAID: { label: "จ่ายแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

type AP = Awaited<ReturnType<typeof getAccountsPayableById>>;

export default function APDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [ap, setAP] = useState<AP>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const u = session?.user as { level?: string; role?: string } | undefined;
  const isManager = u?.level === "MANAGER" || u?.role === "OWNER";

  useEffect(() => {
    getAccountsPayableById(params.id as string).then(setAP);
  }, [params.id]);

  if (!ap) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const s = statusConfig[ap.status] ?? { label: ap.status, color: "bg-gray-100 text-gray-700" };
  const isOverdue = ap.status === "PENDING" && new Date(ap.dueDate) < new Date();

  async function handleApprove() {
    if (!confirm("ยืนยันการอนุมัติรายการนี้?")) return;
    setLoading(true);
    setError("");
    try {
      await approveAccountsPayable(ap!.id);
      setAP({ ...ap!, status: "APPROVED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("ยืนยันการยกเลิกรายการนี้?")) return;
    setLoading(true);
    await cancelAccountsPayable(ap!.id);
    setAP({ ...ap!, status: "CANCELLED" });
    setLoading(false);
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/accounts-payable" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{ap.apNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${isOverdue ? "bg-red-100 text-red-700" : s.color}`}>
          {isOverdue ? "เกินกำหนด" : s.label}
        </span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {ap.status === "PENDING" && isManager && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            อนุมัติ
          </button>
        )}
        {ap.status === "PENDING" && !isManager && (
          <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">
            รอผู้จัดการอนุมัติ
          </span>
        )}
        {ap.status === "APPROVED" && (
          <Link
            href="/payment-prep/new"
            className="bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
          >
            สร้างใบเตรียมจ่าย
          </Link>
        )}
        {(ap.status === "PENDING" || ap.status === "APPROVED") && (
          <button
            onClick={handleCancel}
            disabled={loading}
            className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            ยกเลิก
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลใบแจ้งหนี้</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="ผู้ขาย" value={ap.vendor.name} />
          <InfoRow label="เลขที่ใบแจ้งหนี้" value={ap.invoiceNumber} />
          <InfoRow label="วันที่ใบแจ้งหนี้" value={formatDate(ap.invoiceDate)} />
          <InfoRow label="วันครบกำหนด" value={formatDate(ap.dueDate)} highlight={isOverdue} />
          <InfoRow label="ผู้จัดทำ" value={ap.createdByName ?? "-"} />
          <InfoRow label="ผู้อนุมัติ" value={ap.approvedByName ?? "-"} />
          {ap.po && (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">อ้างอิง PO</div>
              <Link href={`/purchase-orders/${ap.poId}`} className="font-mono text-blue-700 hover:underline">
                {ap.po.poNumber}
              </Link>
            </div>
          )}
          {ap.gr && (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">อ้างอิง GR</div>
              <Link href={`/goods-receipts/${ap.grId}`} className="font-mono text-green-700 hover:underline">
                {ap.gr.grNumber}
              </Link>
            </div>
          )}
          {ap.notes && <InfoRow label="หมายเหตุ" value={ap.notes} />}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">จำนวนเงิน</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ยอดก่อน VAT</span>
            <span>฿{formatCurrency(ap.amount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>VAT</span>
            <span>฿{formatCurrency(ap.vatAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-lg border-t border-gray-200 pt-3 mt-2">
            <span>รวมทั้งสิ้น</span>
            <span className="text-blue-700">฿{formatCurrency(ap.totalAmount)}</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-2">ข้อมูลบัญชีผู้ขาย</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div><span className="text-gray-500">ธนาคาร:</span> <span className="font-medium">{ap.vendor.bankName || "-"}</span></div>
            <div><span className="text-gray-500">สาขา:</span> <span className="font-medium">{ap.vendor.bankBranch || "-"}</span></div>
            <div><span className="text-gray-500">เลขบัญชี:</span> <span className="font-mono font-medium">{ap.vendor.bankAccountNo || "-"}</span></div>
            <div><span className="text-gray-500">ชื่อบัญชี:</span> <span className="font-medium">{ap.vendor.bankAccountName || "-"}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`font-medium ${highlight ? "text-red-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}
