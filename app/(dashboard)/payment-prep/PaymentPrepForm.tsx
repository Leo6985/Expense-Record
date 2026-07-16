"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getAvailableAPForPayment } from "@/actions/accounts-payable";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

type AP = {
  id: string;
  apNumber: string;
  invoiceNumber: string;
  dueDate: Date;
  amount: number;
  totalAmount: number;
  remainingAmount: number;
  vendor: { name: string; bankAccountNo: string | null; bankAccountName: string | null };
};

export type PaymentPrepFormInitial = {
  paymentDate: string;
  notes: string;
  items: { apId: string; amount: string; whtRate: number }[];
};

export type PaymentPrepFormValues = {
  paymentDate: string;
  notes?: string;
  items: { apId: string; amount: number; whtRate: number }[];
};

const WHT_RATES = [0, 1, 1.5, 3, 5, 10, 15];

export default function PaymentPrepForm({
  title,
  backHref,
  submitLabel,
  savingLabel,
  initialValues,
  excludePrepId,
  onSubmit,
}: {
  title: string;
  backHref: string;
  submitLabel: string;
  savingLabel: string;
  initialValues?: PaymentPrepFormInitial;
  excludePrepId?: string;
  onSubmit: (values: PaymentPrepFormValues) => Promise<void>;
}) {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const [availableAPs, setAvailableAPs] = useState<AP[]>([]);
  const [selectedAPIds, setSelectedAPIds] = useState<string[]>(initialValues?.items.map((i) => i.apId) ?? []);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries((initialValues?.items ?? []).map((i) => [i.apId, i.amount]))
  );
  const [whtRates, setWhtRates] = useState<Record<string, number>>(
    Object.fromEntries((initialValues?.items ?? []).map((i) => [i.apId, i.whtRate]))
  );
  const [paymentDate, setPaymentDate] = useState(initialValues?.paymentDate ?? new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAvailableAPForPayment(excludePrepId).then((aps) => setAvailableAPs(aps as AP[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAP(ap: AP) {
    setSelectedAPIds((prev) => {
      if (prev.includes(ap.id)) return prev.filter((x) => x !== ap.id);
      if (!(ap.id in amounts)) {
        setAmounts((a) => ({ ...a, [ap.id]: String(ap.remainingAmount) }));
      }
      return [...prev, ap.id];
    });
  }

  function setAmount(apId: string, value: string) {
    setAmounts((prev) => ({ ...prev, [apId]: value }));
  }

  function setWHT(apId: string, rate: number) {
    setWhtRates((prev) => ({ ...prev, [apId]: rate }));
  }

  function selectAll() {
    setSelectedAPIds(availableAPs.map((ap) => ap.id));
    setAmounts((prev) => {
      const next = { ...prev };
      for (const ap of availableAPs) if (!(ap.id in next)) next[ap.id] = String(ap.remainingAmount);
      return next;
    });
  }

  function clearAll() {
    setSelectedAPIds([]);
  }

  const selectedAPs = availableAPs.filter((ap) => selectedAPIds.includes(ap.id));
  const lines = selectedAPs.map((ap) => {
    const amount = parseFloat(amounts[ap.id] || "0") || 0;
    const rate = whtRates[ap.id] ?? 0;
    const vatRatio = ap.totalAmount > 0 ? ap.amount / ap.totalAmount : 1;
    const whtAmt = Math.round(amount * vatRatio * (rate / 100) * 100) / 100;
    const net = amount - whtAmt;
    return { ap, amount, rate, whtAmt, net };
  });
  const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);
  const totalWHT = lines.reduce((sum, l) => sum + l.whtAmt, 0);
  const netPayable = totalAmount - totalWHT;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setError("กรุณาเลือกรายการหนี้อย่างน้อย 1 รายการ");
      return;
    }
    for (const l of lines) {
      if (l.amount <= 0) {
        setError(`กรุณาระบุจำนวนเงินสำหรับ ${l.ap.apNumber}`);
        return;
      }
      if (l.amount > l.ap.remainingAmount + 0.01) {
        setError(`จำนวนเงินสำหรับ ${l.ap.apNumber} เกินยอดคงเหลือ (฿${formatCurrency(l.ap.remainingAmount)})`);
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      await onSubmit({
        paymentDate,
        notes: notes || undefined,
        items: lines.map((l) => ({ apId: l.ap.id, amount: l.amount, whtRate: l.rate })),
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
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่กำหนดจ่าย *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
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
            <h2 className="font-semibold text-gray-900">เลือกรายการหนี้ + หัก ณ ที่จ่าย</h2>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">เลือกทั้งหมด</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={clearAll} className="text-gray-500 hover:underline">ล้าง</button>
            </div>
          </div>

          {availableAPs.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">ไม่มีรายการหนี้ที่พร้อมจ่าย</p>
          ) : (
            <div className="space-y-2">
              {availableAPs.map((ap) => {
                const isOverdue = new Date(ap.dueDate) < new Date();
                const isSelected = selectedAPIds.includes(ap.id);
                const isPartialBalance = ap.remainingAmount < ap.totalAmount - 0.01;
                const amount = parseFloat(amounts[ap.id] || "0") || 0;
                const rate = whtRates[ap.id] ?? 0;
                const vatRatio = ap.totalAmount > 0 ? ap.amount / ap.totalAmount : 1;
                const whtAmt = Math.round(amount * vatRatio * (rate / 100) * 100) / 100;
                const net = amount - whtAmt;
                return (
                  <div
                    key={ap.id}
                    className={`rounded-lg border transition-colors ${isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                  >
                    <label className="flex items-start gap-3 p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAP(ap)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded"
                      />
                      <div className="flex-1 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-medium text-blue-700">{ap.apNumber}</span>
                          <span className="text-gray-500">|</span>
                          <span className="font-medium">{ap.vendor.name}</span>
                          {isOverdue && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">เกินกำหนด</span>
                          )}
                          {isPartialBalance && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                              จ่ายไปแล้วบางส่วน
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {ap.invoiceNumber} · ครบกำหนด {formatDate(ap.dueDate)}
                          {ap.vendor.bankAccountNo && ` · ${ap.vendor.bankAccountNo}`}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          ยอดเต็ม ฿{formatCurrency(ap.totalAmount)} · คงเหลือ ฿{formatCurrency(ap.remainingAmount)}
                        </div>
                      </div>
                    </label>

                    {isSelected && (
                      <div className="px-3 pb-3 border-t border-blue-100 pt-2 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 whitespace-nowrap">จำนวนเงินที่จ่ายครั้งนี้:</span>
                          <input
                            type="number"
                            min="0"
                            max={ap.remainingAmount}
                            step="0.01"
                            value={amounts[ap.id] ?? ""}
                            onChange={(e) => setAmount(ap.id, e.target.value)}
                            className="w-32 border border-gray-200 rounded px-2 py-1 text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button
                            type="button"
                            onClick={() => setAmount(ap.id, String(ap.remainingAmount))}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            เต็มยอดคงเหลือ
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 whitespace-nowrap">หัก ณ ที่จ่าย:</span>
                          <div className="flex gap-1.5 flex-wrap">
                            {WHT_RATES.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setWHT(ap.id, r)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                  rate === r
                                    ? "bg-orange-500 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                {r === 0 ? "ไม่หัก" : `${r}%`}
                              </button>
                            ))}
                          </div>
                          {rate > 0 && (
                            <span className="text-xs text-orange-700 ml-auto">
                              หัก ฿{formatCurrency(whtAmt)} · สุทธิ ฿{formatCurrency(net)}
                            </span>
                          )}
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
              <div className="flex justify-between text-gray-600">
                <span>ยอดรวม ({lines.length} รายการ)</span>
                <span>฿{formatCurrency(totalAmount)}</span>
              </div>
              {totalWHT > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>หัก ณ ที่จ่ายรวม</span>
                  <span>- ฿{formatCurrency(totalWHT)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-blue-700 text-base border-t border-gray-100 pt-2">
                <span>ยอดที่ต้องจ่ายสุทธิ</span>
                <span>฿{formatCurrency(netPayable)}</span>
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
