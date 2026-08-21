"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSalesInvoiceById, getAdjacentSalesInvoiceIds, cancelSalesInvoice } from "@/actions/sales-invoices";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import DocNav from "@/components/DocNav";

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอรับชำระ", color: "bg-yellow-100 text-yellow-700" },
  PARTIALLY_RECEIVED: { label: "รับชำระบางส่วน", color: "bg-purple-100 text-purple-700" },
  RECEIVED: { label: "รับชำระครบแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

const receiptStatusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-600" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

const noteTypeConfig: Record<string, { label: string; color: string }> = {
  DEBIT: { label: "เพิ่มหนี้", color: "bg-orange-100 text-orange-700" },
  CREDIT: { label: "ลดหนี้", color: "bg-teal-100 text-teal-700" },
};

type Invoice = Awaited<ReturnType<typeof getSalesInvoiceById>>;

export default function SalesInvoiceDetailPage() {
  const params = useParams();
  const [invoice, setInvoice] = useState<Invoice>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjacent, setAdjacent] = useState<{ prevId: string | null; nextId: string | null }>({
    prevId: null,
    nextId: null,
  });

  useEffect(() => {
    getSalesInvoiceById(params.id as string).then(setInvoice);
    getAdjacentSalesInvoiceIds(params.id as string).then(setAdjacent);
  }, [params.id]);

  if (!invoice) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const s = statusConfig[invoice.status] ?? { label: invoice.status, color: "bg-gray-100 text-gray-700" };
  const canCancel = invoice.status === "PENDING";
  const isOverdue = (invoice.status === "PENDING" || invoice.status === "PARTIALLY_RECEIVED") && new Date(invoice.dueDate) < new Date();
  const noteAdjustment = invoice.debitCreditNotes
    .filter((n) => n.status === "APPROVED")
    .reduce((s, n) => s + (n.type === "DEBIT" ? n.totalAmount : -n.totalAmount), 0);
  const effectiveTotal = Math.round((invoice.totalAmount + noteAdjustment) * 100) / 100;
  const activeNotes = invoice.debitCreditNotes.filter((n) => n.status !== "CANCELLED");
  const hasDebitNote = activeNotes.some((n) => n.type === "DEBIT");
  const hasCreditNote = activeNotes.some((n) => n.type === "CREDIT");

  async function handleCancel() {
    if (!confirm("ยืนยันการยกเลิกใบกำกับภาษีขายนี้?")) return;
    setLoading(true);
    setError("");
    try {
      await cancelSalesInvoice(invoice!.id);
      setInvoice({ ...invoice!, status: "CANCELLED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/sales-invoices" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900 font-mono">{invoice.invoiceNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${isOverdue ? "bg-red-100 text-red-700" : s.color}`}>
          {isOverdue ? "เกินกำหนด" : s.label}
        </span>
        {hasDebitNote && (
          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            🔺 มีใบเพิ่มหนี้
          </span>
        )}
        {hasCreditNote && (
          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
            🔻 มีใบลดหนี้
          </span>
        )}
        <DocNav basePath="/sales-invoices" prevId={adjacent.prevId} nextId={adjacent.nextId} className="ml-auto" />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {canCancel && (
        <div className="flex gap-2 mb-5">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            ยกเลิก
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลใบกำกับภาษี</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="ลูกค้า" value={invoice.customer.name} />
          <InfoRow label="วันที่ใบกำกับภาษี" value={formatDate(invoice.invoiceDate)} />
          <InfoRow label="กำหนดชำระ" value={formatDate(invoice.dueDate)} highlight={isOverdue} />
          {invoice.notes && <InfoRow label="หมายเหตุ" value={invoice.notes} />}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">จำนวนเงิน</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ยอดก่อน VAT</span>
            <span>฿{formatCurrency(invoice.amount)}</span>
          </div>
          {invoice.discountAmount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>ส่วนลด</span>
              <span className="text-red-600">-฿{formatCurrency(invoice.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>VAT</span>
            <span>฿{formatCurrency(invoice.vatAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-lg border-t border-gray-200 pt-3 mt-2">
            <span>รวมทั้งสิ้น</span>
            <span className="text-blue-700">฿{formatCurrency(invoice.totalAmount)}</span>
          </div>
          {noteAdjustment !== 0 && (
            <>
              <div className="flex justify-between text-gray-600">
                <span>ปรับปรุงจากใบเพิ่ม/ลดหนี้ (อนุมัติแล้ว)</span>
                <span className={noteAdjustment > 0 ? "text-orange-600" : "text-teal-600"}>
                  {noteAdjustment > 0 ? "+" : ""}฿{formatCurrency(noteAdjustment)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-gray-100 pt-2">
                <span>ยอดสุทธิที่ต้องชำระ</span>
                <span className="text-blue-700">฿{formatCurrency(effectiveTotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">ใบเพิ่ม/ลดหนี้</h2>
          <div className="flex gap-3 text-sm">
            <Link href={`/debit-credit-notes/new?type=DEBIT`} className="text-orange-600 hover:underline">+ ใบเพิ่มหนี้</Link>
            <Link href={`/debit-credit-notes/new?type=CREDIT`} className="text-teal-600 hover:underline">+ ใบลดหนี้</Link>
          </div>
        </div>
        {invoice.debitCreditNotes.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีใบเพิ่ม/ลดหนี้</p>
        ) : (
          <div className="space-y-2">
            {invoice.debitCreditNotes.map((n) => {
              const nt = noteTypeConfig[n.type] ?? { label: n.type, color: "bg-gray-100 text-gray-700" };
              const ns = receiptStatusConfig[n.status] ?? { label: n.status, color: "bg-gray-100 text-gray-700" };
              return (
                <div key={n.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <Link href={`/debit-credit-notes/${n.id}`} className="font-mono text-blue-700 hover:underline">
                      {n.noteNumber}
                    </Link>
                    <span className={`inline-flex ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${nt.color}`}>{nt.label}</span>
                    <span className={`inline-flex ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${ns.color}`}>{ns.label}</span>
                    <span className="text-gray-400 ml-2">{formatDate(n.noteDate)}</span>
                  </div>
                  <span className="font-medium">฿{formatCurrency(n.totalAmount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">การตัดชำระ</h2>
        {invoice.receiptItems.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีการตัดชำระ</p>
        ) : (
          <div className="space-y-2">
            {invoice.receiptItems.map((item) => {
              const rs = receiptStatusConfig[item.receipt.status] ?? { label: item.receipt.status, color: "bg-gray-100 text-gray-700" };
              return (
                <div key={item.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <Link href={`/receipts/${item.receiptId}`} className="font-mono text-blue-700 hover:underline">
                      {item.receipt.receiptNumber}
                    </Link>
                    <span className="text-gray-400 ml-2">{formatDate(item.receipt.receiptDate)}</span>
                    <span className={`inline-flex ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${rs.color}`}>{rs.label}</span>
                  </div>
                  <span className="font-medium">฿{formatCurrency(item.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
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
