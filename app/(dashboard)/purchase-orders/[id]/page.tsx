"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getPurchaseOrder, approvePurchaseOrder, unapprovePurchaseOrder, cancelPurchaseOrder, deletePurchaseOrder } from "@/actions/purchase-orders";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติ", color: "bg-blue-100 text-blue-700" },
  PARTIALLY_RECEIVED: { label: "รับบางส่วน", color: "bg-amber-100 text-amber-700" },
  RECEIVED: { label: "รับแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

type PO = Awaited<ReturnType<typeof getPurchaseOrder>>;

export default function PODetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [po, setPO] = useState<PO>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const user = session?.user as { name?: string; level?: string; role?: string } | undefined;
  const isManager = user?.level === "MANAGER" || user?.role === "OWNER";

  useEffect(() => {
    getPurchaseOrder(params.id as string).then(setPO);
  }, [params.id]);

  if (!po) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const s = statusConfig[po.status] ?? { label: po.status, color: "bg-gray-100 text-gray-700" };

  async function handleApprove() {
    if (!confirm("ยืนยันการอนุมัติใบสั่งซื้อนี้?")) return;
    setLoading(true);
    setError("");
    try {
      await approvePurchaseOrder(po!.id);
      setPO({ ...po!, status: "APPROVED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm(`ยืนยันการลบ ${po!.poNumber}?\nไม่สามารถกู้คืนได้`)) return;
    setLoading(true);
    try {
      await deletePurchaseOrder(po!.id);
      router.push("/purchase-orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm("ยืนยันการยกเลิกใบสั่งซื้อนี้?")) return;
    setLoading(true);
    await cancelPurchaseOrder(po!.id);
    setPO({ ...po!, status: "CANCELLED" });
    setLoading(false);
  }

  async function handleUnapprove() {
    if (!confirm("ยืนยันการยกเลิกอนุมัติ? เอกสารจะกลับไปเป็นสถานะร่างและแก้ไขได้")) return;
    setLoading(true);
    setError("");
    try {
      await unapprovePurchaseOrder(po!.id);
      setPO({ ...po!, status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{po.poNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {po.status === "DRAFT" && isManager && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            อนุมัติ PO
          </button>
        )}
        {po.status === "DRAFT" && !isManager && (
          <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">
            รอผู้จัดการอนุมัติ
          </span>
        )}
        {po.status === "DRAFT" && (
          <Link
            href={`/purchase-orders/${params.id}/edit`}
            className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            แก้ไข
          </Link>
        )}
        {(po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED") && (
          <Link
            href={`/goods-receipts/new?poId=${po.id}`}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            รับสินค้าเข้าระบบ
          </Link>
        )}
        {po.status === "APPROVED" && isManager && po.goodsReceipts.length === 0 && (
          <button
            onClick={handleUnapprove}
            disabled={loading}
            className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            ยกเลิกอนุมัติ
          </button>
        )}
        {(po.status === "DRAFT" || po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED") && (
          <button
            onClick={handleCancel}
            disabled={loading}
            className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            ยกเลิก
          </button>
        )}
        {po.status === "DRAFT" && (
          <button
            onClick={handleDelete}
            disabled={loading}
            className="border border-gray-300 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            ลบ
          </button>
        )}
        <a
          href={`/purchase-orders/${params.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors ml-auto"
        >
          🖨️ พิมพ์ / PDF
        </a>
      </div>

      {/* PO Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลใบสั่งซื้อ</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {po.prNumber && <InfoRow label="เลขที่ใบขอซื้อ (PR)" value={po.prNumber} />}
          <InfoRow label="ผู้ขาย" value={po.vendor.name} />
          <InfoRow label="วันที่สั่งซื้อ" value={formatDate(po.orderDate)} />
          <InfoRow label="วันที่คาดว่าจะได้รับ" value={formatDate(po.expectedDate)} />
          <InfoRow label="ผู้จัดทำ" value={po.createdByName ?? "-"} />
          <InfoRow label="ผู้อนุมัติ" value={po.approvedByName ?? "-"} />
          <InfoRow label="หมายเหตุ" value={po.notes ?? "-"} />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">รายการสินค้า/บริการ</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 font-medium text-gray-600">รายการ</th>
              <th className="text-right py-2 font-medium text-gray-600">จำนวน</th>
              <th className="text-left py-2 font-medium text-gray-600 pl-2">หน่วย</th>
              <th className="text-right py-2 font-medium text-gray-600">ราคา/หน่วย</th>
              <th className="text-right py-2 font-medium text-gray-600">รวม</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{formatCurrency(item.quantity)}</td>
                <td className="py-2 pl-2 text-gray-600">{item.unit ?? "-"}</td>
                <td className="py-2 text-right">฿{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-right font-medium">฿{formatCurrency(item.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-3 text-right text-gray-600">ยอดก่อน VAT</td>
              <td className="pt-3 text-right text-gray-700">฿{formatCurrency(po.totalAmount)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="pt-1 text-right text-gray-600">VAT {po.vatRate}%</td>
              <td className="pt-1 text-right text-gray-700">฿{formatCurrency(po.vatAmount)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="pt-2 text-right font-semibold border-t border-gray-100">ยอดรวมทั้งสิ้น</td>
              <td className="pt-2 text-right font-bold text-blue-700 text-base border-t border-gray-100">
                ฿{formatCurrency(po.totalAmount + po.vatAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* GR History */}
      {po.goodsReceipts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ประวัติการรับสินค้า</h2>
          {po.goodsReceipts.map((gr) => (
            <div key={gr.id} className="text-sm flex items-center gap-4">
              <span className="font-mono text-green-700">{gr.grNumber}</span>
              <span className="text-gray-600">{formatDate(gr.receivedDate)}</span>
              {gr.receivedBy && <span className="text-gray-500">รับโดย: {gr.receivedBy}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}
