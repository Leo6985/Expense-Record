"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createPaymentPrep } from "@/actions/payment-prep";
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
  vendor: { name: string; bankAccountNo: string | null; bankAccountName: string | null };
};

const WHT_RATES = [0, 1, 1.5, 3, 5, 10, 15];

export default function NewPaymentPrepPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const [availableAPs, setAvailableAPs] = useState<AP[]>([]);
  const [selectedAPIds, setSelectedAPIds] = useState<string[]>([]);
  const [whtRates, setWhtRates] = useState<Record<string, number>>({});
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAvailableAPForPayment().then((aps) => setAvailableAPs(aps as AP[]));
  }, []);

  function toggleAP(id: string) {
    setSelectedAPIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function setWHT(apId: string, rate: number) {
    setWhtRates((prev) => ({ ...prev, [apId]: rate }));
  }

  function selectAll() {
    setSelectedAPIds(availableAPs.map((ap) => ap.id));
  }

  function clearAll() {
    setSelectedAPIds([]);
  }

  const selectedAPs = availableAPs.filter((ap) => selectedAPIds.includes(ap.id));
  const totalAmount = selectedAPs.reduce((sum, ap) => sum + ap.totalAmount, 0);
  const totalWHT = selectedAPs.reduce((sum, ap) => {
    const rate = whtRates[ap.id] ?? 0;
    return sum + Math.round(ap.amount * (rate / 100) * 100) / 100;
  }, 0);
  const netPayable = totalAmount - totalWHT;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedAPIds.length === 0) {
      setError("กรุณาเลือกรายการหนี้อย่างน้อย 1 รายการ");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createPaymentPrep({
        paymentDate,
        apIds: selectedAPIds,
        whtRates,
        notes: notes || undefined,
      });
      router.push("/payment-prep");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/payment-prep" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">สร้างใบเตรียมจ่าย</h1>
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
                const rate = whtRates[ap.id] ?? 0;
                const whtAmt = Math.round(ap.amount * (rate / 100) * 100) / 100;
                const net = ap.totalAmount - whtAmt;
                return (
                  <div
                    key={ap.id}
                    className={`rounded-lg border transition-colors ${isSelected ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                  >
                    <label className="flex items-start gap-3 p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAP(ap.id)}
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
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {ap.invoiceNumber} · ครบกำหนด {formatDate(ap.dueDate)}
                          {ap.vendor.bankAccountNo && ` · ${ap.vendor.bankAccountNo}`}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-bold text-gray-900">฿{formatCurrency(ap.totalAmount)}</div>
                        {rate > 0 && <div className="text-xs text-red-600">หัก ฿{formatCurrency(whtAmt)}</div>}
                        {rate > 0 && <div className="text-xs text-green-700 font-medium">สุทธิ ฿{formatCurrency(net)}</div>}
                      </div>
                    </label>

                    {isSelected && (
                      <div className="px-3 pb-3 flex items-center gap-3 border-t border-blue-100 pt-2">
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
                            หัก ฿{formatCurrency(whtAmt)} จากยอด ฿{formatCurrency(ap.amount)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedAPIds.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>ยอดรวม ({selectedAPIds.length} รายการ)</span>
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
            disabled={loading || selectedAPIds.length === 0}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "สร้างใบเตรียมจ่าย"}
          </button>
          <Link href="/payment-prep" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
