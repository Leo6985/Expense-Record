"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getGoodsReceiptForEdit, updateGoodsReceipt } from "@/actions/goods-receipts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

type GR = Awaited<ReturnType<typeof getGoodsReceiptForEdit>>;

function toDateInput(d: Date | string) {
  return new Date(d).toISOString().split("T")[0];
}

export default function EditGoodsReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const [gr, setGR] = useState<GR>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receivedDate, setReceivedDate] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getGoodsReceiptForEdit(params.id as string).then((data) => {
      setGR(data);
      if (!data) return;
      setReceivedDate(toDateInput(data.receivedDate));
      setReceivedBy(data.receivedBy ?? "");
      setNotes(data.notes ?? "");
      const ap = data.accountsPayable[0];
      if (ap) {
        setInvoiceNumber(ap.invoiceNumber);
        setInvoiceDate(toDateInput(ap.invoiceDate));
        setVatAmount(ap.vatAmount ? String(ap.vatAmount) : "");
      }
      const defaults: Record<string, string> = {};
      for (const item of data.items) defaults[item.poItemId] = String(item.quantity);
      setReceiveQty(defaults);
    });
  }, [params.id]);

  if (!gr) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const ap = gr.accountsPayable[0];
  const hasActivePrep = ap?.paymentPrepItems.some((item) => item.prep.status !== "CANCELLED") ?? false;

  const receiveLines = gr.po.items
    .map((item) => ({ item, qty: parseFloat(receiveQty[item.id] || "0") || 0 }))
    .filter((l) => l.qty > 0);
  const receiveAmount = receiveLines.reduce((sum, l) => sum + l.qty * l.item.unitPrice, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    if (!invoiceNumber.trim()) {
      setError("กรุณากรอกเลขที่อินวอยซ์");
      setLoading(false);
      return;
    }
    if (receiveLines.length === 0) {
      setError("กรุณาระบุจำนวนที่รับอย่างน้อย 1 รายการ");
      setLoading(false);
      return;
    }
    try {
      await updateGoodsReceipt(gr!.id, {
        receivedDate,
        receivedBy: receivedBy || undefined,
        notes: notes || undefined,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        vatAmount: vatAmount ? parseFloat(vatAmount) : undefined,
        items: receiveLines.map((l) => ({ poItemId: l.item.id, quantity: l.qty })),
      });
      router.push(`/goods-receipts/${gr!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  if (hasActivePrep) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/goods-receipts/${gr.id}`} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
          <h1 className="text-2xl font-bold text-gray-900">แก้ไข {gr.grNumber}</h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          หนี้ที่ตั้งจากใบรับนี้ถูกดึงไปใช้ในใบเตรียมจ่ายแล้ว จึงไม่สามารถแก้ไขได้
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/goods-receipts/${gr.id}`} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">แก้ไข {gr.grNumber}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="font-semibold text-blue-900 mb-3">รายการสินค้าใน {gr.po.poNumber} — ระบุจำนวนที่รับ</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-blue-200">
                <th className="text-left py-1.5 font-medium text-blue-800">รายการ</th>
                <th className="text-right py-1.5 font-medium text-blue-800">สั่งซื้อ</th>
                <th className="text-right py-1.5 font-medium text-blue-800">รับ (รายการอื่น)</th>
                <th className="text-right py-1.5 font-medium text-blue-800">คงเหลือสูงสุด</th>
                <th className="text-right py-1.5 font-medium text-blue-800 w-28">รับครั้งนี้</th>
                <th className="text-right py-1.5 font-medium text-blue-800">รวม</th>
              </tr>
            </thead>
            <tbody>
              {gr.po.items.map((item) => {
                const qty = parseFloat(receiveQty[item.id] || "0") || 0;
                const lineTotal = qty * item.unitPrice;
                return (
                  <tr key={item.id} className="border-b border-blue-100">
                    <td className="py-1.5">
                      {item.description}
                      {item.unit && <span className="text-blue-700 text-xs ml-1">({item.unit})</span>}
                    </td>
                    <td className="py-1.5 text-right">{formatCurrency(item.quantity)}</td>
                    <td className="py-1.5 text-right text-gray-500">{formatCurrency(item.receivedByOthers)}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(item.outstandingForThisGR)}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        min="0"
                        max={item.outstandingForThisGR}
                        step="0.01"
                        value={receiveQty[item.id] ?? ""}
                        onChange={(e) => setReceiveQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="py-1.5 text-right font-medium">฿{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="pt-2 text-right font-bold text-blue-900">ยอดที่รับ (ใบรับนี้)</td>
                <td className="pt-2 text-right font-bold text-blue-700">฿{formatCurrency(receiveAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

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

        <div className="bg-white rounded-xl border border-orange-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-orange-100">ข้อมูลอินวอยซ์ (ตั้งหนี้)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่อินวอยซ์ *</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
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
          </div>
          <div className="mt-4 bg-orange-50 rounded-lg p-3 text-sm flex justify-between">
            <span className="text-gray-600">ยอดหนี้ที่ตั้ง</span>
            <div className="text-right">
              <div className="text-gray-500">มูลค่า: ฿{formatCurrency(receiveAmount)}</div>
              {vatAmount && parseFloat(vatAmount) > 0 && (
                <div className="text-gray-500">VAT: ฿{formatCurrency(parseFloat(vatAmount))}</div>
              )}
              <div className="font-bold text-orange-700 text-base">
                รวม: ฿{formatCurrency(receiveAmount + (vatAmount ? parseFloat(vatAmount) : 0))}
              </div>
            </div>
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
            {loading ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
          </button>
          <Link href={`/goods-receipts/${gr.id}`} className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
