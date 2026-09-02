"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createAccountsPayable } from "@/actions/accounts-payable";
import { getVendors } from "@/actions/vendors";
import { getChartOfAccounts } from "@/actions/chart-of-accounts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

type Vendor = Awaited<ReturnType<typeof getVendors>>[number];
type Account = Awaited<ReturnType<typeof getChartOfAccounts>>[number];

// ค่าเริ่มต้นสำหรับ "สินค้า/บริการที่ซื้อมาเพื่อขาย" — ตรงกับ DEFAULT_RESALE_GOODS_ACCOUNT_CODE ใน
// actions/accounts-payable.ts (ใช้กับการนำเข้า CSV เส้นทางเดียวกัน)
const DEFAULT_RESALE_ACCOUNT_CODE = "1140-20";

export default function NewResaleAPPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("0");
  const [vatRate, setVatRate] = useState("7");
  const [accountId, setAccountId] = useState("");
  const [poNumberRef, setPoNumberRef] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getVendors().then((data) => setVendors(data.filter((v) => v.isActive)));
    getChartOfAccounts().then((data) => {
      const active = data.filter((a) => a.isActive);
      setAccounts(active);
      // เลือกหมวดบัญชี "สินค้าสำเร็จรูปคงเหลือ" ให้อัตโนมัติ เพราะหน้านี้มีไว้เฉพาะสินค้า/บริการที่
      // ซื้อมาเพื่อขาย — ผู้ใช้ยังเปลี่ยนเป็นหมวดอื่นได้ถ้าต้องการ
      const def = active.find((a) => a.code === DEFAULT_RESALE_ACCOUNT_CODE);
      if (def) setAccountId(def.id);
    });
  }, []);

  const selectedVendor = vendors.find((v) => v.id === vendorId) ?? null;

  function handleSelectVendor(id: string) {
    setVendorId(id);
    const vendor = vendors.find((v) => v.id === id);
    if (vendor && invoiceDate) {
      const due = new Date(invoiceDate);
      due.setDate(due.getDate() + vendor.creditDays);
      setDueDate(due.toISOString().split("T")[0]);
    }
  }

  useEffect(() => {
    if (selectedVendor && invoiceDate) {
      const due = new Date(invoiceDate);
      due.setDate(due.getDate() + selectedVendor.creditDays);
      setDueDate(due.toISOString().split("T")[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceDate]);

  const amountNum = parseFloat(amount) || 0;
  const vatAmount = amountNum * ((parseFloat(vatRate) || 0) / 100);
  const totalAmount = amountNum + vatAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) return;
    setLoading(true);
    setError("");
    try {
      await createAccountsPayable({
        vendorId,
        accountId: accountId || undefined,
        poNumberRef: poNumberRef || undefined,
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
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มสินค้า/บริการที่ซื้อมาเพื่อขาย</h1>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm mb-5">
        <span className="text-blue-400">👤</span>
        <span className="text-gray-500">ผู้จัดทำ:</span>
        <span className="font-medium text-gray-900">{userName || "กำลังโหลด..."}</span>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm mb-5">
        ใช้สำหรับบันทึกตั้งหนี้ตรง โดยไม่ต้องออกใบสั่งซื้อ (PO) ในระบบก่อน — ถ้ามีใบสั่งซื้อในระบบอยู่แล้ว ให้ใช้{" "}
        <Link href="/accounts-payable/new" className="underline font-medium">ตั้งหนี้จากใบสั่งซื้อ (PO)</Link> แทน
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ผู้ขาย</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ขาย *</label>
            <select
              value={vendorId}
              onChange={(e) => handleSelectVendor(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกผู้ขาย --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name} (เครดิต {v.creditDays} วัน)
                </option>
              ))}
            </select>
            {vendors.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                ยังไม่มีผู้ขายในระบบ <Link href="/vendors/new" className="text-blue-600 hover:underline">เพิ่มผู้ขายใหม่ →</Link>
              </p>
            )}
          </div>
        </div>

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
                {selectedVendor && <span className="text-gray-400 font-normal ml-1">(คำนวณจากเครดิต {selectedVendor.creditDays} วัน)</span>}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เลขที่ใบสั่งซื้อ
                <span className="text-gray-400 font-normal ml-1">(ถ้ามี — ข้อความอ้างอิงอิสระ ไม่ต้องมี PO จริงในระบบ)</span>
              </label>
              <input
                value={poNumberRef}
                onChange={(e) => setPoNumberRef(e.target.value)}
                placeholder="เช่น PO-เขียนมือ-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวดบัญชี</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- ไม่ระบุ --</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงินก่อน VAT *</label>
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

          {selectedVendor?.bankAccountNo && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500 mb-1">ข้อมูลธนาคารผู้ขาย</div>
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div><span className="text-gray-500">ธนาคาร:</span> <span className="font-medium">{selectedVendor.bankName ?? "-"}</span></div>
                <div><span className="text-gray-500">เลขบัญชี:</span> <span className="font-mono font-medium">{selectedVendor.bankAccountNo}</span></div>
                <div><span className="text-gray-500">ชื่อบัญชี:</span> <span className="font-medium">{selectedVendor.bankAccountName ?? "-"}</span></div>
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
            disabled={loading || !vendorId || !invoiceNumber}
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
