"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getJournalVoucher,
  getAdjacentJournalVoucherIds,
  approveJournalVoucher,
  unapproveJournalVoucher,
  deleteJournalVoucher,
} from "@/actions/journal-vouchers";
import { formatDate, formatCurrency, numberToThaiBahtText } from "@/lib/utils";
import Link from "next/link";
import DocNav from "@/components/DocNav";
import PageLoading from "@/components/PageLoading";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
};

type Voucher = Awaited<ReturnType<typeof getJournalVoucher>>;

export default function JournalVoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: session } = useSession();
  const [voucher, setVoucher] = useState<Voucher>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjacent, setAdjacent] = useState<{ prevId: string | null; nextId: string | null }>({ prevId: null, nextId: null });

  const u = session?.user as { level?: string; role?: string } | undefined;
  const isManager = u?.level === "MANAGER" || u?.role === "OWNER";

  useEffect(() => {
    getJournalVoucher(id).then(setVoucher);
    getAdjacentJournalVoucherIds(id).then(setAdjacent);
  }, [id]);

  if (!voucher) return <PageLoading />;

  const s = statusConfig[voucher.status] ?? { label: voucher.status, color: "bg-gray-100 text-gray-700" };
  const balanced = Math.abs(voucher.totalDebit - voucher.totalCredit) < 0.01;

  async function handleApprove() {
    if (!confirm("ยืนยันการอนุมัติใบสำคัญรายวันนี้?")) return;
    setLoading(true);
    setError("");
    try {
      await approveJournalVoucher(voucher!.id);
      const fresh = await getJournalVoucher(id);
      setVoucher(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleUnapprove() {
    if (!confirm("ยืนยันการยกเลิกอนุมัติ? เอกสารจะกลับไปเป็นร่างและแก้ไขได้")) return;
    setLoading(true);
    setError("");
    try {
      await unapproveJournalVoucher(voucher!.id);
      const fresh = await getJournalVoucher(id);
      setVoucher(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("ยืนยันการลบใบสำคัญรายวันนี้? ไม่สามารถกู้คืนได้")) return;
    setLoading(true);
    setError("");
    try {
      await deleteJournalVoucher(voucher!.id);
      router.push("/journal-vouchers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/journal-vouchers" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{voucher.voucherNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
        <DocNav basePath="/journal-vouchers" prevId={adjacent.prevId} nextId={adjacent.nextId} className="ml-auto" />
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <div className="flex gap-2 mb-5 flex-wrap">
        {voucher.status === "DRAFT" && isManager && (
          <button onClick={handleApprove} disabled={loading || !balanced} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            อนุมัติ
          </button>
        )}
        {voucher.status === "DRAFT" && !isManager && (
          <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">รอผู้จัดการอนุมัติ</span>
        )}
        {voucher.status === "DRAFT" && (
          <Link href={`/journal-vouchers/${id}/edit`} className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors">
            แก้ไข
          </Link>
        )}
        {voucher.status === "APPROVED" && isManager && (
          <button onClick={handleUnapprove} disabled={loading} className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-50 transition-colors">
            ยกเลิกอนุมัติ
          </button>
        )}
        {voucher.status === "DRAFT" && (
          <button onClick={handleDelete} disabled={loading} className="border border-red-400 text-red-700 bg-red-50 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors">
            🗑️ ลบ
          </button>
        )}
        <a href={`/journal-vouchers/${id}/voucher`} target="_blank" rel="noreferrer" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors ml-auto">
          🧾 พิมพ์ใบสำคัญ
        </a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm mb-5">
          <div><div className="text-xs text-gray-500">เลขที่</div><div className="font-mono font-medium">{voucher.voucherNumber}</div></div>
          <div><div className="text-xs text-gray-500">วันที่</div><div className="font-medium">{formatDate(voucher.voucherDate)}</div></div>
          <div className="col-span-2"><div className="text-xs text-gray-500">รายละเอียด</div><div className="font-medium">{voucher.description}</div></div>
          <div><div className="text-xs text-gray-500">ผู้จัดทำ</div><div className="font-medium">{voucher.createdByName ?? "-"}</div></div>
          <div><div className="text-xs text-gray-500">ผู้อนุมัติ</div><div className="font-medium">{voucher.approvedByName ?? "-"}</div></div>
          {voucher.notes && <div className="col-span-2"><div className="text-xs text-gray-500">หมายเหตุ</div><div className="font-medium">{voucher.notes}</div></div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <th className="text-left py-2 px-2 font-medium">เลขที่บัญชี</th>
                <th className="text-left py-2 px-2 font-medium">ชื่อบัญชี</th>
                <th className="text-left py-2 px-2 font-medium">แผนก</th>
                <th className="text-left py-2 px-2 font-medium">รายละเอียด</th>
                <th className="text-right py-2 px-2 font-medium">เดบิต</th>
                <th className="text-right py-2 px-2 font-medium">เครดิต</th>
              </tr>
            </thead>
            <tbody>
              {voucher.lines.map((l) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="py-2 px-2 font-mono text-xs">{l.account.code}</td>
                  <td className="py-2 px-2">{l.account.name}</td>
                  <td className="py-2 px-2 text-gray-600">{l.department ?? "-"}</td>
                  <td className="py-2 px-2 text-gray-600">{l.description ?? "-"}</td>
                  <td className="py-2 px-2 text-right">{l.debit ? `฿${formatCurrency(l.debit)}` : "-"}</td>
                  <td className="py-2 px-2 text-right">{l.credit ? `฿${formatCurrency(l.credit)}` : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-bold">
                <td colSpan={4} className="pt-2 px-2 text-right text-gray-600">รวม</td>
                <td className={`pt-2 px-2 text-right ${balanced ? "text-blue-700" : "text-red-600"}`}>฿{formatCurrency(voucher.totalDebit)}</td>
                <td className={`pt-2 px-2 text-right ${balanced ? "text-blue-700" : "text-red-600"}`}>฿{formatCurrency(voucher.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 text-sm text-gray-600">
          <span className="font-medium">จำนวนเงิน (ตัวอักษร): </span>
          ({numberToThaiBahtText(voucher.totalDebit)})
        </div>
        {!balanced && (
          <div className="mt-2 text-sm text-red-600 font-medium">⚠ เดบิตรวมไม่เท่ากับเครดิตรวม</div>
        )}
      </div>
    </div>
  );
}
