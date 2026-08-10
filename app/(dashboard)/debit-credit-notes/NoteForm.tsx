"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { searchInvoicesForNote } from "@/actions/debit-credit-notes";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  totalAmount: number;
  status: string;
  customer: { name: string };
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอรับชำระ",
  PARTIALLY_RECEIVED: "รับชำระบางส่วน",
  RECEIVED: "รับชำระครบแล้ว",
};

export type NoteFormInitial = {
  type: "DEBIT" | "CREDIT";
  invoice: Invoice;
  noteDate: string;
  amount: string;
  vatAmount: string;
  reason: string;
  notes: string;
};

export type NoteFormValues = {
  type: "DEBIT" | "CREDIT";
  invoiceId: string;
  noteDate: string;
  amount: number;
  vatAmount?: number;
  reason?: string;
  notes?: string;
};

export default function NoteForm({
  title,
  backHref,
  submitLabel,
  savingLabel,
  initialType,
  initialValues,
  lockType,
  lockInvoice,
  onSubmit,
}: {
  title: string;
  backHref: string;
  submitLabel: string;
  savingLabel: string;
  initialType?: "DEBIT" | "CREDIT";
  initialValues?: NoteFormInitial;
  lockType?: boolean;
  lockInvoice?: boolean;
  onSubmit: (values: NoteFormValues) => Promise<void>;
}) {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const [type, setType] = useState<"DEBIT" | "CREDIT">(initialValues?.type ?? initialType ?? "DEBIT");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceResults, setInvoiceResults] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(initialValues?.invoice ?? null);
  const [noteDate, setNoteDate] = useState(initialValues?.noteDate ?? new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState(initialValues?.amount ?? "");
  const [vatAmount, setVatAmount] = useState(initialValues?.vatAmount ?? "0");
  const [reason, setReason] = useState(initialValues?.reason ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lockInvoice || invoiceSearch.trim().length < 2) {
      setInvoiceResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const results = await searchInvoicesForNote(invoiceSearch);
      setInvoiceResults(results as Invoice[]);
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceSearch]);

  const amountNum = parseFloat(amount || "0") || 0;
  const vatAmountNum = parseFloat(vatAmount || "0") || 0;
  const totalAmount = Math.round((amountNum + vatAmountNum) * 100) / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice) {
      setError("กรุณาเลือกใบกำกับภาษีขายที่จะอ้างอิง");
      return;
    }
    if (amountNum <= 0) {
      setError("กรุณาระบุจำนวนเงินให้มากกว่า 0");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit({
        type,
        invoiceId: selectedInvoice.id,
        noteDate,
        amount: amountNum,
        vatAmount: vatAmountNum || undefined,
        reason: reason || undefined,
        notes: notes || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm mb-5">
        <span className="text-blue-400">👤</span>
        <span className="text-gray-500">ผู้จัดทำ:</span>
        <span className="font-medium text-gray-900">{userName || "กำลังโหลด..."}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ประเภทเอกสาร</h2>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={lockType}
              onClick={() => setType("DEBIT")}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                type === "DEBIT" ? "bg-orange-600 text-white border-orange-600" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              ใบเพิ่มหนี้ (Debit Note)
            </button>
            <button
              type="button"
              disabled={lockType}
              onClick={() => setType("CREDIT")}
              className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                type === "CREDIT" ? "bg-teal-600 text-white border-teal-600" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              ใบลดหนี้ (Credit Note)
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ใบกำกับภาษีขายที่อ้างอิง</h2>
          {selectedInvoice ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <div className="text-sm">
                <span className="font-mono font-medium text-blue-700">{selectedInvoice.invoiceNumber}</span>
                <span className="text-gray-500 mx-2">|</span>
                <span className="font-medium">{selectedInvoice.customer.name}</span>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatDate(selectedInvoice.invoiceDate)} · ยอด ฿{formatCurrency(selectedInvoice.totalAmount)} ·{" "}
                  {STATUS_LABEL[selectedInvoice.status] ?? selectedInvoice.status}
                </div>
              </div>
              {!lockInvoice && (
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="text-xs text-gray-500 hover:underline whitespace-nowrap ml-3"
                >
                  เปลี่ยน
                </button>
              )}
            </div>
          ) : (
            <div>
              <input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="ค้นหาเลขที่ใบกำกับภาษีหรือชื่อลูกค้า (พิมพ์อย่างน้อย 2 ตัวอักษร)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                อ้างอิงได้แม้ใบกำกับภาษีนั้นจะชำระเงินไปแล้ว (ยกเว้นที่ถูกยกเลิก)
              </p>
              {invoiceResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {invoiceResults.map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => {
                        setSelectedInvoice(inv);
                        setInvoiceResults([]);
                        setInvoiceSearch("");
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50"
                    >
                      <span className="font-mono font-medium text-blue-700">{inv.invoiceNumber}</span>
                      <span className="text-gray-500 mx-2">|</span>
                      <span>{inv.customer.name}</span>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDate(inv.invoiceDate)} · ฿{formatCurrency(inv.totalAmount)} · {STATUS_LABEL[inv.status] ?? inv.status}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">รายละเอียด</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ *</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผล</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น สินค้าคืน, แก้ไขราคา"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ยอดก่อน VAT *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VAT</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={vatAmount}
                onChange={(e) => setVatAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between font-bold text-blue-700 text-base">
            <span>รวมทั้งสิ้น</span>
            <span>฿{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? savingLabel : submitLabel}
          </button>
          <Link href={backHref} className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
