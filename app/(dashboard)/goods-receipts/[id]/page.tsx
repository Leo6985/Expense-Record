"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getGoodsReceipt, getAdjacentGoodsReceiptIds, deleteGoodsReceipt } from "@/actions/goods-receipts";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import DocNav from "@/components/DocNav";

type GR = Awaited<ReturnType<typeof getGoodsReceipt>>;

export default function GoodsReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [gr, setGR] = useState<GR>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjacent, setAdjacent] = useState<{ prevId: string | null; nextId: string | null }>({
    prevId: null,
    nextId: null,
  });

  useEffect(() => {
    getGoodsReceipt(params.id as string).then(setGR);
    getAdjacentGoodsReceiptIds(params.id as string).then(setAdjacent);
  }, [params.id]);

  if (!gr) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const ap = gr.accountsPayable[0];
  const hasActivePrep = ap?.paymentPrepItems.some((item) => item.prep.status !== "CANCELLED") ?? false;

  async function handleDelete() {
    if (!confirm(`ยืนยันการลบใบรับสินค้า ${gr!.grNumber}?\nสถานะ PO จะถูกคำนวณใหม่`)) return;
    setLoading(true);
    setError("");
    try {
      await deleteGoodsReceipt(gr!.id);
      router.push("/goods-receipts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/goods-receipts" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{gr.grNumber}</h1>
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">รับแล้ว</span>
        <DocNav basePath="/goods-receipts" prevId={adjacent.prevId} nextId={adjacent.nextId} className="ml-auto" />
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {hasActivePrep && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          หนี้ที่ตั้งจากใบรับนี้ถูกดึงไปใช้ในใบเตรียมจ่ายแล้ว จึงไม่สามารถแก้ไขหรือลบได้
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {!hasActivePrep && (
          <Link
            href={`/goods-receipts/${gr.id}/edit`}
            className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            แก้ไข
          </Link>
        )}
        {!hasActivePrep && (
          <button
            onClick={handleDelete}
            disabled={loading}
            className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังลบ..." : "ลบใบรับสินค้า"}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลการรับสินค้า</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">เลข GR</div>
            <div className="font-medium font-mono">{gr.grNumber}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">เลข PO อ้างอิง</div>
            <Link href={`/purchase-orders/${gr.poId}`} className="font-medium font-mono text-blue-700 hover:underline">
              {gr.po.poNumber}
            </Link>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">ผู้ขาย</div>
            <div className="font-medium">{gr.po.vendor.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">วันที่รับสินค้า</div>
            <div className="font-medium">{formatDate(gr.receivedDate)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">ผู้รับสินค้า</div>
            <div className="font-medium">{gr.receivedBy || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">ผู้จัดทำ</div>
            <div className="font-medium">{gr.createdByName || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">หมายเหตุ</div>
            <div className="font-medium">{gr.notes || "-"}</div>
          </div>
        </div>
      </div>

      {ap && (
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-5 mb-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-orange-100">ใบกำกับภาษี / ตั้งหนี้ (AP)</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">เลขที่ AP</div>
              <Link href={`/accounts-payable/${ap.id}`} className="font-medium font-mono text-orange-700 hover:underline">
                {ap.apNumber}
              </Link>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">เลขที่ใบกำกับภาษี</div>
              <div className="font-medium">{ap.invoiceNumber}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">วันที่ใบกำกับภาษี</div>
              <div className="font-medium">{formatDate(ap.invoiceDate)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">วันครบกำหนดชำระ</div>
              <div className="font-medium">{formatDate(ap.dueDate)}</div>
            </div>
          </div>
          <div className="space-y-1.5 text-sm border-t border-orange-100 pt-3">
            <div className="flex justify-between text-gray-600">
              <span>ยอดก่อน VAT</span>
              <span>฿{formatCurrency(ap.amount)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>VAT</span>
              <span>฿{formatCurrency(ap.vatAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-orange-700 text-base border-t border-orange-100 pt-2">
              <span>รวมทั้งสิ้น</span>
              <span>฿{formatCurrency(ap.totalAmount)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">รายการสินค้าที่รับ</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 font-medium text-gray-600">รายการ</th>
              <th className="text-right py-2 font-medium text-gray-600">จำนวนที่รับ</th>
              <th className="text-left py-2 font-medium text-gray-600 pl-2">หน่วย</th>
              <th className="text-right py-2 font-medium text-gray-600">ราคา/หน่วย</th>
              <th className="text-right py-2 font-medium text-gray-600">รวม</th>
            </tr>
          </thead>
          <tbody>
            {gr.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50">
                <td className="py-2">{item.poItem.description}</td>
                <td className="py-2 text-right">{formatCurrency(item.quantity)}</td>
                <td className="py-2 pl-2 text-gray-600">{item.poItem.unit ?? "-"}</td>
                <td className="py-2 text-right">฿{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-right font-medium">฿{formatCurrency(item.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-3 text-right font-semibold">ยอดรวม (ก่อน VAT)</td>
              <td className="pt-3 text-right font-bold text-green-700 text-base">
                ฿{formatCurrency(gr.items.reduce((s, i) => s + i.totalPrice, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
