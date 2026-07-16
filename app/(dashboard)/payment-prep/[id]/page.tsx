"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getPaymentPrep, approvePaymentPrep, unapprovePaymentPrep, cancelPaymentPrep } from "@/actions/payment-prep";
import { getCompanyBankAccounts, createPayment } from "@/actions/payments";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "อนุมัติแล้ว", color: "bg-blue-100 text-blue-700" },
  PAID: { label: "จ่ายแล้ว", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

type Prep = Awaited<ReturnType<typeof getPaymentPrep>>;
type BankAccount = { id: string; bankName: string; branch: string | null; accountNo: string; accountName: string };

export default function PaymentPrepDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [prep, setPrep] = useState<Prep>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("โอนเงิน");
  const [bankAccountId, setBankAccountId] = useState("");
  const [refNo, setRefNo] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    getPaymentPrep(params.id as string).then(setPrep);
    getCompanyBankAccounts().then((accts) => setBankAccounts(accts as BankAccount[]));
  }, [params.id]);

  const u = session?.user as { level?: string; role?: string } | undefined;
  const isManager = u?.level === "MANAGER" || u?.role === "OWNER";

  if (!prep) return <div className="text-gray-400 text-sm">กำลังโหลด...</div>;

  const s = statusConfig[prep.status] ?? { label: prep.status, color: "bg-gray-100 text-gray-700" };

  async function handleApprove() {
    if (!confirm("ยืนยันการอนุมัติใบเตรียมจ่ายนี้?")) return;
    setLoading(true);
    await approvePaymentPrep(prep!.id);
    setPrep({ ...prep!, status: "APPROVED" });
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("ยืนยันการยกเลิกใบเตรียมจ่าย? รายการหนี้จะถูกคืนสถานะ")) return;
    setLoading(true);
    await cancelPaymentPrep(prep!.id);
    router.push("/payment-prep");
  }

  async function handleUnapprove() {
    if (!confirm("ยืนยันการยกเลิกอนุมัติ? เอกสารจะกลับไปเป็นสถานะร่างและแก้ไขได้")) return;
    setLoading(true);
    try {
      await unapprovePaymentPrep(prep!.id);
      setPrep({ ...prep!, status: "DRAFT", approvedByName: null, approvedById: null, approvedAt: null });
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createPayment({
        prepId: prep!.id,
        paymentDate,
        paymentMethod,
        companyBankAccountId: bankAccountId,
        amount: prep!.netPayableAmount,
        referenceNumber: refNo || undefined,
        notes: paymentNotes || undefined,
      });
      router.push("/payments");
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/payment-prep" className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{prep.prepNumber}</h1>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {prep.status === "DRAFT" && isManager && (
          <button onClick={handleApprove} disabled={loading} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            อนุมัติ
          </button>
        )}
        {prep.status === "DRAFT" && !isManager && (
          <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">
            รอผู้จัดการอนุมัติ
          </span>
        )}
        {prep.status === "DRAFT" && (
          <Link
            href={`/payment-prep/${params.id}/edit`}
            className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            แก้ไข
          </Link>
        )}
        {prep.status === "APPROVED" && !prep.payment && (
          <button onClick={() => setShowPaymentForm(true)} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            บันทึกการชำระเงิน
          </button>
        )}
        {prep.status === "APPROVED" && !prep.payment && isManager && (
          <button onClick={handleUnapprove} disabled={loading} className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-50 transition-colors">
            ยกเลิกอนุมัติ
          </button>
        )}
        {(prep.status === "DRAFT" || prep.status === "APPROVED") && (
          <button onClick={handleCancel} disabled={loading} className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
            ยกเลิก
          </button>
        )}
        <a
          href={`/payment-prep/${params.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors ml-auto"
        >
          🖨️ พิมพ์ / Export PDF
        </a>
      </div>

      {/* Payment Form */}
      {showPaymentForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-5">
          <h3 className="font-semibold text-green-900 mb-3">บันทึกการชำระเงิน</h3>
          <form onSubmit={handlePayment} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ชำระ *</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วิธีการชำระ *</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option>โอนเงิน</option>
                <option>เช็ค</option>
                <option>เงินสด</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">บัญชีบริษัทที่ใช้จ่าย *</label>
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
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
              <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="เลขที่โอน/เช็ค" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={loading || !bankAccountId} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {loading ? "กำลังบันทึก..." : `ยืนยันชำระ ฿${formatCurrency(prep.netPayableAmount)}`}
              </button>
              <button type="button" onClick={() => setShowPaymentForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">ยกเลิก</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 print:border-0">
        <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ใบเตรียมจ่าย</h2>
        <div className="grid grid-cols-2 gap-4 text-sm mb-5">
          <div><div className="text-xs text-gray-500">เลขที่</div><div className="font-mono font-medium">{prep.prepNumber}</div></div>
          <div><div className="text-xs text-gray-500">วันที่เตรียม</div><div className="font-medium">{formatDate(prep.prepDate)}</div></div>
          <div><div className="text-xs text-gray-500">วันที่กำหนดจ่าย</div><div className="font-medium">{formatDate(prep.paymentDate)}</div></div>
          <div><div className="text-xs text-gray-500">ผู้จัดทำ</div><div className="font-medium">{prep.createdByName ?? "-"}</div></div>
          <div><div className="text-xs text-gray-500">ผู้อนุมัติ</div><div className="font-medium">{prep.approvedByName ?? "-"}</div></div>
          {prep.notes && <div><div className="text-xs text-gray-500">หมายเหตุ</div><div className="font-medium">{prep.notes}</div></div>}
        </div>

        <h3 className="font-medium text-gray-700 mb-3 text-sm">รายการหนี้</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-2 px-2 font-medium text-gray-600">เลข AP</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">ผู้ขาย</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">บัญชีปลายทาง</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">จำนวนเงิน</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">หัก ณ ที่จ่าย</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {prep.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2 px-2 font-mono text-blue-700 text-xs">{item.ap.apNumber}</td>
                <td className="py-2 px-2">
                  <div>{item.ap.vendor.name}</div>
                  <div className="text-xs text-gray-500">{item.ap.invoiceNumber}</div>
                </td>
                <td className="py-2 px-2 text-gray-600 text-xs">
                  {item.ap.vendor.bankAccountNo ? `${item.ap.vendor.bankAccountNo} ${item.ap.vendor.bankAccountName ?? ""}` : "-"}
                </td>
                <td className="py-2 px-2 text-right">฿{formatCurrency(item.amount)}</td>
                <td className="py-2 px-2 text-right text-red-600 text-xs">
                  {item.withholdingTaxRate > 0 ? (
                    <span>{item.withholdingTaxRate}%<br />฿{formatCurrency(item.withholdingTaxAmount)}</span>
                  ) : "-"}
                </td>
                <td className="py-2 px-2 text-right font-medium text-green-700">฿{formatCurrency(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={3} className="pt-2 text-right text-gray-600 text-sm">ยอดรวม</td>
              <td className="pt-2 text-right font-medium">฿{formatCurrency(prep.totalAmount)}</td>
              <td className="pt-2 text-right text-red-600 font-medium">฿{formatCurrency(prep.totalWithholdingTax)}</td>
              <td className="pt-2 text-right font-bold text-blue-700">฿{formatCurrency(prep.netPayableAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {prep.payment && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h2 className="font-semibold text-green-900 mb-3">ข้อมูลการชำระเงิน</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-gray-500">เลขที่ชำระ</div><div className="font-mono font-medium">{prep.payment.paymentNumber}</div></div>
            <div><div className="text-xs text-gray-500">วันที่ชำระ</div><div className="font-medium">{formatDate(prep.payment.paymentDate)}</div></div>
            <div><div className="text-xs text-gray-500">วิธีการชำระ</div><div className="font-medium">{prep.payment.paymentMethod}</div></div>
            {prep.payment.referenceNumber && <div><div className="text-xs text-gray-500">เลขอ้างอิง</div><div className="font-mono font-medium">{prep.payment.referenceNumber}</div></div>}
            <div className="col-span-2"><div className="text-xs text-gray-500">บัญชีที่ใช้จ่าย</div><div className="font-medium">{prep.payment.companyBankAccount.bankName} {prep.payment.companyBankAccount.accountNo} {prep.payment.companyBankAccount.accountName}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
