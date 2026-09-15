"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createAccountsPayable } from "@/actions/accounts-payable";
import { getVendors } from "@/actions/vendors";
import { getChartOfAccounts } from "@/actions/chart-of-accounts";
import { formatCurrency } from "@/lib/utils";
import { VAT_RATE_BY_TYPE, VAT_TYPE_OPTIONS } from "@/lib/vat";
import VendorCombobox from "@/components/VendorCombobox";
import Link from "next/link";

type Vendor = Awaited<ReturnType<typeof getVendors>>[number];
type Account = Awaited<ReturnType<typeof getChartOfAccounts>>[number];

// ค่าเริ่มต้นสำหรับ "สินค้า/บริการที่ซื้อมาเพื่อขาย" — ตรงกับ DEFAULT_RESALE_GOODS_ACCOUNT_CODE ใน
// actions/accounts-payable.ts (ใช้กับการนำเข้า CSV เส้นทางเดียวกัน)
const DEFAULT_RESALE_ACCOUNT_CODE = "1140-20";

type Row = {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  poNumberRef: string;
  accountId: string;
  amount: string;
  vatType: string;
  notes: string;
};

function emptyRow(defaultDate: string, defaultAccountId: string): Row {
  return {
    vendorId: "",
    invoiceNumber: "",
    invoiceDate: defaultDate,
    dueDate: "",
    poNumberRef: "",
    accountId: defaultAccountId,
    amount: "0",
    vatType: "STANDARD",
    notes: "",
  };
}

export default function NewResaleAPPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const [rows, setRows] = useState<Row[]>([emptyRow(today, "")]);
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
      if (def) {
        setDefaultAccountId(def.id);
        setRows((prev) => prev.map((r) => (r.accountId ? r : { ...r, accountId: def.id })));
      }
    });
  }, []);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function selectVendor(index: number, vendorId: string) {
    const vendor = vendors.find((v) => v.id === vendorId);
    const row = rows[index];
    let dueDate = row.dueDate;
    if (vendor && row.invoiceDate) {
      const due = new Date(row.invoiceDate);
      due.setDate(due.getDate() + vendor.creditDays);
      dueDate = due.toISOString().split("T")[0];
    }
    updateRow(index, { vendorId, dueDate });
  }

  function setInvoiceDate(index: number, invoiceDate: string) {
    const row = rows[index];
    const vendor = vendors.find((v) => v.id === row.vendorId);
    let dueDate = row.dueDate;
    if (vendor && invoiceDate) {
      const due = new Date(invoiceDate);
      due.setDate(due.getDate() + vendor.creditDays);
      dueDate = due.toISOString().split("T")[0];
    }
    updateRow(index, { invoiceDate, dueDate });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(today, defaultAccountId)]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function rowTotals(row: Row) {
    const amountNum = parseFloat(row.amount) || 0;
    const vatRatePercent = VAT_RATE_BY_TYPE[row.vatType as keyof typeof VAT_RATE_BY_TYPE] ?? 0;
    const vatAmount = amountNum * (vatRatePercent / 100);
    return { amountNum, vatRatePercent, vatAmount, totalAmount: amountNum + vatAmount };
  }

  const grandTotal = rows.reduce((sum, r) => sum + rowTotals(r).totalAmount, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    for (const row of rows) {
      if (!row.vendorId) {
        setError("กรุณาเลือกผู้ขายให้ครบทุกรายการ");
        return;
      }
      if (!row.invoiceNumber) {
        setError("กรุณาระบุเลขที่ใบแจ้งหนี้ให้ครบทุกรายการ");
        return;
      }
    }

    setLoading(true);
    try {
      // สร้างทีละรายการตามลำดับ (ไม่ใช้ Promise.all) เพราะ getNextAPNumber ในแต่ละครั้งอ่านเลขที่
      // ล่าสุดจาก DB — ถ้ายิงพร้อมกันจะชนกันได้เลขที่ตั้งหนี้ซ้ำ
      for (const row of rows) {
        const { amountNum, vatAmount } = rowTotals(row);
        await createAccountsPayable({
          vendorId: row.vendorId,
          accountId: row.accountId || undefined,
          poNumberRef: row.poNumberRef || undefined,
          invoiceNumber: row.invoiceNumber,
          invoiceDate: row.invoiceDate,
          dueDate: row.dueDate,
          amount: amountNum,
          vatAmount,
          vatType: row.vatType,
          notes: row.notes || undefined,
        });
      }
      router.push("/accounts-payable");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl">
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
        เพิ่มได้ครั้งละหลายรายการโดยกด &quot;เพิ่มรายการ&quot; ด้านล่าง
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
          {rows.map((row, index) => {
            const selectedVendor = vendors.find((v) => v.id === row.vendorId) ?? null;
            const { amountNum, vatRatePercent, vatAmount, totalAmount } = rowTotals(row);
            return (
              <div key={index} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">รายการที่ {index + 1}</h2>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      ลบรายการนี้
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ขาย *</label>
                    <VendorCombobox
                      vendors={vendors}
                      vendorId={row.vendorId}
                      onSelect={(id) => selectVendor(index, id)}
                    />
                    {vendors.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        ยังไม่มีผู้ขายในระบบ <Link href="/vendors/new" className="text-blue-600 hover:underline">เพิ่มผู้ขายใหม่ →</Link>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ใบแจ้งหนี้ *</label>
                    <input
                      value={row.invoiceNumber}
                      onChange={(e) => updateRow(index, { invoiceNumber: e.target.value })}
                      required
                      placeholder="INV-XXXXX"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ใบแจ้งหนี้ *</label>
                    <input
                      type="date"
                      value={row.invoiceDate}
                      onChange={(e) => setInvoiceDate(index, e.target.value)}
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
                      value={row.dueDate}
                      onChange={(e) => updateRow(index, { dueDate: e.target.value })}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      เลขที่ใบสั่งซื้อ
                      <span className="text-gray-400 font-normal ml-1">(ถ้ามี)</span>
                    </label>
                    <input
                      value={row.poNumberRef}
                      onChange={(e) => updateRow(index, { poNumberRef: e.target.value })}
                      placeholder="เช่น PO-เขียนมือ-001"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">หมวดบัญชี</label>
                    <select
                      value={row.accountId}
                      onChange={(e) => updateRow(index, { accountId: e.target.value })}
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
                      value={row.notes}
                      onChange={(e) => updateRow(index, { notes: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงินก่อน VAT *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => updateRow(index, { amount: e.target.value })}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">อัตรา VAT (%)</label>
                    <select
                      value={row.vatType}
                      onChange={(e) => updateRow(index, { vatType: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {VAT_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>ยอดก่อน VAT</span>
                    <span>฿{formatCurrency(amountNum)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>VAT {vatRatePercent}%{row.vatType === "DEFERRED" && " (ภาษีซื้อไม่ถึงกำหนด)"}</span>
                    <span>฿{formatCurrency(vatAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 mt-2">
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
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="w-full border-2 border-dashed border-gray-300 text-gray-500 rounded-xl py-3 text-sm font-medium hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          + เพิ่มรายการ
        </button>

        {rows.length > 1 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 flex justify-between items-center">
            <span className="text-sm text-gray-600">รวมทั้งหมด {rows.length} รายการ</span>
            <span className="font-bold text-blue-700 text-lg">฿{formatCurrency(grandTotal)}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "กำลังบันทึก..." : rows.length > 1 ? `ตั้งหนี้ทั้งหมด (${rows.length} รายการ)` : "ตั้งหนี้"}
          </button>
          <Link href="/accounts-payable" className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
