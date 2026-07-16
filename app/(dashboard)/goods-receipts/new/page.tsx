"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getApprovedPOsForGR, createGoodsReceipt } from "@/actions/goods-receipts";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

type POItem = { id: string; description: string; quantity: number; unit: string | null; unitPrice: number; totalPrice: number };
type PO = {
  id: string;
  poNumber: string;
  orderDate: Date;
  totalAmount: number;
  vendor: { name: string; code: string; creditDays: number };
  items: POItem[];
};

export default function NewGoodsReceiptPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const [availablePOs, setAvailablePOs] = useState<PO[]>([]);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const today = new Date().toISOString().split("T")[0];
  const [receivedDate, setReceivedDate] = useState(today);
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [vatAmount, setVatAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function calcDueDate(invDate: string, creditDays: number) {
    if (!invDate) return "";
    const d = new Date(invDate);
    d.setDate(d.getDate() + creditDays);
    return d.toISOString().split("T")[0];
  }

  useEffect(() => {
    getApprovedPOsForGR().then((pos) => setAvailablePOs(pos as PO[]));
  }, []);

  useEffect(() => {
    if (session?.user?.name) setReceivedBy(session.user.name);
  }, [session]);

  function handleSelectPO(poId: string) {
    const po = availablePOs.find((p) => p.id === poId) ?? null;
    setSelectedPO(po);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPO) return;
    setLoading(true);
    setError("");
    if (!invoiceNumber.trim()) {
      setError("กรุณากรอกเลขที่อินวอยซ์");
      setLoading(false);
      return;
    }
    try {
      const gr = await createGoodsReceipt({
        poId: selectedPO.id,
        receivedDate,
        receivedBy: receivedBy || undefined,
        notes: notes || undefined,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        vatAmount: vatAmount ? parseFloat(vatAmount) : undefined,
      });
      router.push(`/goods-receipts/${gr.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/goods-receipts" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">สร้างใบรับสินค้า</h1>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm mb-5">
        <span className="text-blue-400">👤</span>
        <span className="text-gray-500">ผู้จัดทำ:</span>
        <span className="font-medium text-gray-900">{userName || "กำลังโหลด..."}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step 1: Select PO */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">เลือกใบสั่งซื้อ (PO)</h2>

          {availablePOs.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              ไม่มีใบสั่งซื้อที่อนุมัติแล้วรอรับสินค้า<br />
              <Link href="/purchase-orders" className="text-blue-600 hover:underline mt-1 inline-block">ไปที่ใบสั่งซื้อ →</Link>
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
            <h2 className="font-semibold text-blue-900 mb-3">รายการสินค้าใน {selectedPO.poNumber}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-200">
                  <th className="text-left py-1.5 font-medium text-blue-800">รายการ</th>
                  <th className="text-right py-1.5 font-medium text-blue-800">จำนวน</th>
                  <th className="text-left py-1.5 font-medium text-blue-800 pl-2">หน่วย</th>
                  <th className="text-right py-1.5 font-medium text-blue-800">ราคา/หน่วย</th>
                  <th className="text-right py-1.5 font-medium text-blue-800">รวม</th>
                </tr>
              </thead>
              <tbody>
                {selectedPO.items.map((item) => (
                  <tr key={item.id} className="border-b border-blue-100">
                    <td className="py-1.5">{item.description}</td>
                    <td className="py-1.5 text-right">{formatCurrency(item.quantity)}</td>
                    <td className="py-1.5 pl-2 text-blue-700">{item.unit ?? "-"}</td>
                    <td className="py-1.5 text-right">฿{formatCurrency(item.unitPrice)}</td>
                    <td className="py-1.5 text-right font-medium">฿{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-2 text-right font-bold text-blue-900">ยอดรวม</td>
                  <td className="pt-2 text-right font-bold text-blue-700">฿{formatCurrency(selectedPO.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Step 3: Receipt Info */}
        {selectedPO && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลการรับสินค้า</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่รับสินค้า *</label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ผู้รับสินค้า</label>
                <input
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="ชื่อผู้รับ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          </div>
        )}

        {/* Step 4: Invoice Info → auto AP */}
        {selectedPO && (
          <div className="bg-white rounded-xl border border-orange-200 p-5">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-orange-100">
              <h2 className="font-semibold text-gray-900">ข้อมูลอินวอยซ์ (ตั้งหนี้อัตโนมัติ)</h2>
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">สร้าง AP อัตโนมัติ</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่อินวอยซ์ *</label>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="เช่น INV-2025-0001"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่อินวอยซ์ *</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ภาษีมูลค่าเพิ่ม (VAT)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันครบกำหนดชำระ</label>
                <input
                  type="date"
                  value={calcDueDate(invoiceDate, selectedPO.vendor.creditDays)}
                  readOnly
                  className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">อัตโนมัติจากเครดิต {selectedPO.vendor.creditDays} วัน</p>
              </div>
            </div>
            <div className="mt-4 bg-orange-50 rounded-lg p-3 text-sm flex justify-between">
              <span className="text-gray-600">ยอดหนี้ที่จะตั้ง</span>
              <div className="text-right">
                <div className="text-gray-500">มูลค่า: ฿{formatCurrency(selectedPO.totalAmount)}</div>
                {vatAmount && parseFloat(vatAmount) > 0 && (
                  <div className="text-gray-500">VAT: ฿{formatCurrency(parseFloat(vatAmount))}</div>
                )}
                <div className="font-bold text-orange-700 text-base">
                  รวม: ฿{formatCurrency(selectedPO.totalAmount + (vatAmount ? parseFloat(vatAmount) : 0))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !selectedPO}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : "ยืนยันรับสินค้า + ตั้งหนี้"}
          </button>
          <Link href="/goods-receipts" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
