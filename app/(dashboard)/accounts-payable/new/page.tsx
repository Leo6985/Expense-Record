"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createAccountsPayable, getReceivedPOsWithoutAP } from "@/actions/accounts-payable";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

type POItem = { id: string; description: string; quantity: number; unit: string | null; unitPrice: number; totalPrice: number };
type PO = {
  id: string;
  poNumber: string;
  orderDate: Date;
  totalAmount: number;
  vendor: {
    id: string;
    name: string;
    creditDays: number;
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
  };
  items: POItem[];
};

export default function NewAPPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const [availablePOs, setAvailablePOs] = useState<PO[]>([]);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("0");
  const [vatRate, setVatRate] = useState("7");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getReceivedPOsWithoutAP().then((pos) => setAvailablePOs(pos as PO[]));
  }, []);

  function handleSelectPO(poId: string) {
    const po = availablePOs.find((p) => p.id === poId) ?? null;
    setSelectedPO(po);
    if (po) {
      setAmount(po.totalAmount.toFixed(2));
      const due = new Date(invoiceDate);
      due.setDate(due.getDate() + po.vendor.creditDays);
      setDueDate(due.toISOString().split("T")[0]);
    }
  }

  useEffect(() => {
    if (selectedPO && invoiceDate) {
      const due = new Date(invoiceDate);
      due.setDate(due.getDate() + selectedPO.vendor.creditDays);
      setDueDate(due.toISOString().split("T")[0]);
    }
  }, [invoiceDate, selectedPO]);

  const amountNum = parseFloat(amount) || 0;
  const vatAmount = amountNum * ((parseFloat(vatRate) || 0) / 100);
  const totalAmount = amountNum + vatAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPO) return;
    setLoading(true);
    setError("");
    try {
      await createAccountsPayable({
        vendorId: selectedPO.vendor.id,
        poId: selectedPO.id,
        invoiceNumber,
        invoiceDate,
        dueDate,
        amount: amountNum,
        vatAmount,
        notes: notes || undefined,
      });
      router.push("/accounts-payable");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/accounts-payable" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">ตั้งหนี้ใหม่</h1>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm mb-5">
        <span className="text-blue-400">👤</span>
        <span className="text-gray-500">ผู้จัดทำ:</span>
        <span className="font-medium text-gray-900">{userName || "กำลังโหลด..."}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step 1: Select PO */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            เลือกใบสั่งซื้อ (PO) ที่รับสินค้าแล้ว
          </h2>

          {availablePOs.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              ไม่มีใบสั่งซื้อที่รับสินค้าแล้วและยังไม่ได้ตั้งหนี้<br />
              <Link href="/goods-receipts" className="text-blue-600 hover:underline mt-1 inline-block">ไปที่รับสินค้า →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {availablePOs.map((po) => {
                const isSelected = selectedPO?.id === po.id;
                return (
                  <label
                    key={po.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isSelected ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="poId"
                      value={po.id}
                      checked={isSelected}
                      onChange={() => handleSelectPO(po.id)}
                      className="mt-1 w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="font-mono text-blue-700">{po.poNumber}</span>
                        <span className="text-gray-400">|</span>
                        <span>{po.vendor.name}</span>
                        <span className="text-xs text-gray-400">(เครดิต {po.vendor.creditDays} วัน)</span>
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        วันที่สั่ง: {formatDate(po.orderDate)} · {po.items.length} รายการ
                      </div>
                    </div>
                    <div className="text-right font-bold text-gray-800">
                      ฿{formatCurrency(po.totalAmount)}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2: PO Items Preview */}
        {selectedPO && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-900 mb-3 text-sm">รายการสินค้าใน {selectedPO.poNumber}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-200">
                  <th className="text-left py-1 font-medium text-blue-800">รายการ</th>
                  <th className="text-right py-1 font-medium text-blue-800">จำนวน</th>
                  <th className="text-left py-1 font-medium text-blue-800 pl-2">หน่วย</th>
                  <th className="text-right py-1 font-medium text-blue-800">ราคา/หน่วย</th>
                  <th className="text-right py-1 font-medium text-blue-800">รวม</th>
                </tr>
              </thead>
              <tbody>
                {selectedPO.items.map((item) => (
                  <tr key={item.id} className="border-b border-blue-100">
                    <td className="py-1">{item.description}</td>
                    <td className="py-1 text-right">{formatCurrency(item.quantity)}</td>
                    <td className="py-1 pl-2 text-blue-700">{item.unit ?? "-"}</td>
                    <td className="py-1 text-right">฿{formatCurrency(item.unitPrice)}</td>
                    <td className="py-1 text-right font-medium">฿{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-2 text-right font-bold text-blue-900">ยอดรวม PO</td>
                  <td className="pt-2 text-right font-bold text-blue-700">฿{formatCurrency(selectedPO.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Step 3: Invoice Info */}
        {selectedPO && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลใบแจ้งหนี้</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ใบแจ้งหนี้ *</label>
                  <input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    required
                    placeholder="INV-XXXXX"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ใบแจ้งหนี้ *</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันครบกำหนด
                    <span className="text-gray-400 font-normal ml-1">(คำนวณจากเครดิต {selectedPO.vendor.creditDays} วัน)</span>
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
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
              <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">จำนวนเงิน</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จำนวนเงินก่อน VAT *
                    <span className="text-gray-400 font-normal ml-1">(ตาม PO: ฿{formatCurrency(selectedPO.totalAmount)})</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">อัตรา VAT (%)</label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="0">0% (ไม่มี VAT)</option>
                    <option value="7">7% (มาตรฐาน)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>ยอดก่อน VAT</span>
                  <span>฿{formatCurrency(amountNum)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>VAT {vatRate}%</span>
                  <span>฿{formatCurrency(vatAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2 mt-2">
                  <span>รวมทั้งสิ้น</span>
                  <span className="text-blue-700">฿{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              {selectedPO.vendor.bankAccountNo && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">ข้อมูลธนาคารผู้ขาย</div>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <div><span className="text-gray-500">ธนาคาร:</span> <span className="font-medium">{selectedPO.vendor.bankName ?? "-"}</span></div>
                    <div><span className="text-gray-500">เลขบัญชี:</span> <span className="font-mono font-medium">{selectedPO.vendor.bankAccountNo}</span></div>
                    <div><span className="text-gray-500">ชื่อบัญชี:</span> <span className="font-medium">{selectedPO.vendor.bankAccountName ?? "-"}</span></div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !selectedPO || !invoiceNumber}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "ตั้งหนี้"}
          </button>
          <Link href="/accounts-payable" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
