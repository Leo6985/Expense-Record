"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getDebitCreditNote,
  approveDebitCreditNote,
  unapproveDebitCreditNote,
  cancelDebitCreditNote,
} from "@/actions/debit-credit-notes";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

const typeConfig: Record<string, { label: string; color: string }> = {
  DEBIT: { label: "ใบเพิ่มหนี้ (Debit Note)", color: "bg-orange-100 text-orange-700" },
  CREDIT: { label: "ใบลดหนี้ (Credit Note)", color: "bg-teal-100 text-teal-700" },
};

type Note = Awaited<ReturnType<typeof getDebitCreditNote>>;

export default function DebitCreditNoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [note, setNote] = useState<Note>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const u = session?.user as { level?: string; role?: string } | undefined;
  const isManager = u?.level === "MANAGER" || u?.role === "OWNER";

  useEffect(() => {
    getDebitCreditNote(params.id as string).then(setNote);
  }, [params.id]);

  if (!note) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const s = statusConfig[note.status] ?? { label: note.status, color: "bg-gray-100 text-gray-700" };
  const t = typeConfig[note.type] ?? { label: note.type, color: "bg-gray-100 text-gray-700" };

  async function handleApprove() {
    if (!confirm("ยืนยันการอนุมัติรายการนี้?")) return;
    setLoading(true);
    setError("");
    try {
      await approveDebitCreditNote(note!.id);
      setNote({ ...note!, status: "APPROVED" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleUnapprove() {
    if (!confirm("ยืนยันการยกเลิกอนุมัติ? เอกสารจะกลับไปเป็นสถานะร่างและแก้ไขได้")) return;
    setLoading(true);
    setError("");
    try {
      await unapproveDebitCreditNote(note!.id);
      setNote({ ...note!, status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("ยืนยันการยกเลิกรายการนี้?")) return;
    setLoading(true);
    await cancelDebitCreditNote(note!.id);
    router.push("/debit-credit-notes");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link href="/debit-credit-notes" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900 font-mono">{note.noteNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {note.status === "DRAFT" && isManager && (
          <button onClick={handleApprove} disabled={loading} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            อนุมัติ
          </button>
        )}
        {note.status === "DRAFT" && !isManager && (
          <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">
            รอผู้จัดการอนุมัติ
          </span>
        )}
        {note.status === "DRAFT" && (
          <Link
            href={`/debit-credit-notes/${params.id}/edit`}
            className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            แก้ไข
          </Link>
        )}
        {note.status === "APPROVED" && isManager && (
          <button onClick={handleUnapprove} disabled={loading} className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-50 transition-colors">
            ยกเลิกอนุมัติ
          </button>
        )}
        {(note.status === "DRAFT" || note.status === "APPROVED") && (
          <button onClick={handleCancel} disabled={loading} className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
            ยกเลิก
          </button>
        )}
        <a
          href={`/debit-credit-notes/${params.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors ml-auto"
        >
          🖨️ พิมพ์ / PDF
        </a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลทั่วไป</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="วันที่" value={formatDate(note.noteDate)} />
          <div>
            <div className="text-xs text-gray-500 mb-0.5">ใบกำกับภาษีอ้างอิง</div>
            <Link href={`/sales-invoices/${note.invoiceId}`} className="font-mono font-medium text-blue-700 hover:underline">
              {note.invoice.invoiceNumber}
            </Link>
          </div>
          <InfoRow label="ลูกค้า" value={note.invoice.customer.name} />
          {note.reason && <InfoRow label="เหตุผล" value={note.reason} />}
          <InfoRow label="ผู้จัดทำ" value={note.createdByName ?? "-"} />
          <InfoRow label="ผู้อนุมัติ" value={note.approvedByName ?? "-"} />
          {note.detail && (
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-0.5">รายละเอียด</div>
              <div className="font-medium text-gray-900 whitespace-pre-wrap">{note.detail}</div>
            </div>
          )}
          {note.notes && <InfoRow label="หมายเหตุ" value={note.notes} />}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">จำนวนเงิน</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>ยอดก่อน VAT</span>
            <span>฿{formatCurrency(note.amount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>VAT</span>
            <span>฿{formatCurrency(note.vatAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-lg border-t border-gray-200 pt-3 mt-2">
            <span>รวมทั้งสิ้น</span>
            <span className={note.type === "DEBIT" ? "text-orange-700" : "text-teal-700"}>
              {note.type === "DEBIT" ? "+" : "-"}฿{formatCurrency(note.totalAmount)}
            </span>
          </div>
        </div>
      </div>
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
