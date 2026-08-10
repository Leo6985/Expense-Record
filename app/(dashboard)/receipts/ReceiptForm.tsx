"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getAvailableInvoicesForReceipt } from "@/actions/sales-invoices";
import { getCompanyBankAccounts } from "@/actions/payments";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  amount: number;
  totalAmount: number;
  remainingAmount: number;
  customer: { name: string };
};

type BankAccount = { id: string; bankName: string; branch: string | null; accountNo: string; accountName: string };

export type ReceiptFormInitial = {
  receiptDate: string;
  companyBankAccountId: string;
  paymentMethod: string;
  referenceNumber: string;
  notes: string;
  items: { invoiceId: string; amount: string }[];
};

export type ReceiptFormValues = {
  receiptDate: string;
  companyBankAccountId: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  items: { invoiceId: string; amount: number }[];
};

export default function ReceiptForm({
  title,
  backHref,
  submitLabel,
  savingLabel,
  initialValues,
  excludeReceiptId,
  onSubmit,
}: {
  title: string;
  backHref: string;
  submitLabel: string;
  savingLabel: string;
  initialValues?: ReceiptFormInitial;
  excludeReceiptId?: string;
  onSubmit: (values: ReceiptFormValues) => Promise<void>;
}) {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const [availableInvoices, setAvailableInvoices] = useState<Invoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialValues?.items.map((i) => i.invoiceId) ?? []);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries((initialValues?.items ?? []).map((i) => [i.invoiceId, i.amount]))
  );
  const [receiptDate, setReceiptDate] = useState(initialValues?.receiptDate ?? new Date().toISOString().split("T")[0]);
  const [companyBankAccountId, setCompanyBankAccountId] = useState(initialValues?.companyBankAccountId ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.paymentMethod ?? "โอนเงิน");
  const [referenceNumber, setReferenceNumber] = useState(initialValues?.referenceNumber ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAvailableInvoicesForReceipt(excludeReceiptId).then((invoices) => setAvailableInvoices(invoices as Invoice[]));
    getCompanyBankAccounts().then((accts) => setBankAccounts(accts as BankAccount[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleInvoice(inv: Invoice) {
    setSelectedIds((prev) => {
      if (prev.includes(inv.id)) return prev.filter((x) => x !== inv.id);
      if (!(inv.id in amounts)) {
        setAmounts((a) => ({ ...a, [inv.id]: String(inv.remainingAmount) }));
      }
      return [...prev, inv.id];
    });
  }

  function setAmount(invoiceId: string, value: string) {
    setAmounts((prev) => ({ ...prev, [invoiceId]: value }));
  }

  function selectAll() {
    setSelectedIds(availableInvoices.map((inv) => inv.id));
    setAmounts((prev) => {
      const next = { ...prev };
      for (const inv of availableInvoices) if (!(inv.id in next)) next[inv.id] = String(inv.remainingAmount);
      return next;
    });
  }

  function clearAll() {
    setSelectedIds([]);
  }

  const selectedInvoices = availableInvoices.filter((inv) => selectedIds.includes(inv.id));
  const lines = selectedInvoices.map((inv) => {
    const amount = parseFloat(amounts[inv.id] || "0") || 0;
    return { invoice: inv, amount };
  });
  const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setError("กรุณาเลือกใบกำกับภาษีขายอย่างน้อย 1 รายการ");
      return;
    }
    if (!companyBankAccountId) {
      setError("กรุณาเลือกบัญชีธนาคารที่รับเงิน");
      return;
    }
    for (const l of lines) {
      if (l.amount <= 0) {
        setError(`กรุณาระบุจำนวนเงินสำหรับ ${l.invoice.invoiceNumber}`);
        return;
      }
      if (l.amount > l.invoice.remainingAmount + 0.01) {
        setError(`จำนวนเงินสำหรับ ${l.invoice.invoiceNumber} เกินยอดคงเหลือ (฿${formatCurrency(l.invoice.remainingAmount)})`);
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit({
        receiptDate,
        companyBankAccountId,
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ invoiceId: l.invoice.id, amount: l.amount })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
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
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลทั่วไป</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่รับชำระ *</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วิธีการรับชำระ *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>โอนเงิน</option>
                <option>เช็ค</option>
                <option>เงินสด</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">บัญชีธนาคารที่รับเงิน *</label>
              <select
                value={companyBankAccountId}
                onChange={(e) => setCompanyBankAccountId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- เลือกบัญชี --</option>
                {bankAccounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.bankName} {acct.branch} | {acct.accountNo} | {acct.accountName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่อ้างอิง</label>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="เลขที่โอน/เช็ค"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">เลือกใบกำกับภาษีขายที่จะตัดชำระ</h2>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">เลือกทั้งหมด</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={clearAll} className="text-gray-500 hover:underline">ล้าง</button>
            </div>
          </div>

          {availableInvoices.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">ไม่มีใบกำกับภาษีขายที่รอรับชำระ</p>
          ) : (
            <div className="space-y-2">
              {availableInvoices.map((inv) => {
                const isSelected = selectedIds.includes(inv.id);
                const isPartialBalance = inv.remainingAmount < inv.totalAmount - 0.01;
                return (
                  <div
                    key={inv.id}
                    className={`rounded-lg border transition-colors ${isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                  >
                    <label className="flex items-start gap-3 p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleInvoice(inv)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded"
                      />
                      <div className="flex-1 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-medium text-blue-700">{inv.invoiceNumber}</span>
                          <span className="text-gray-500">|</span>
                          <span className="font-medium">{inv.customer.name}</span>
                          {isPartialBalance && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                              รับชำระไปแล้วบางส่วน
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">{formatDate(inv.invoiceDate)}</div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          ยอดเต็ม ฿{formatCurrency(inv.totalAmount)} · คงเหลือ ฿{formatCurrency(inv.remainingAmount)}
                        </div>
                      </div>
                    </label>

                    {isSelected && (
                      <div className="px-3 pb-3 border-t border-blue-100 pt-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 whitespace-nowrap">จำนวนเงินที่รับครั้งนี้:</span>
                          <input
                            type="number"
                            min="0"
                            max={inv.remainingAmount}
                            step="0.01"
                            value={amounts[inv.id] ?? ""}
                            onChange={(e) => setAmount(inv.id, e.target.value)}
                            className="w-32 border border-gray-200 rounded px-2 py-1 text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button
                            type="button"
                            onClick={() => setAmount(inv.id, String(inv.remainingAmount))}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            เต็มยอดคงเหลือ
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {lines.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-1.5 text-sm">
              <div className="flex justify-between font-bold text-blue-700 text-base">
                <span>ยอดรับชำระรวม ({lines.length} รายการ)</span>
                <span>฿{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || lines.length === 0}
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
