"use client";

import { useState, useEffect } from "react";
import {
  getCompanyBankAccounts,
  createCompanyBankAccount,
  updateCompanyBankAccount,
} from "@/actions/payments";
import { getReceiptsForBankAccount } from "@/actions/receipts";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import CompanyBankAccountCsvImport from "./CompanyBankAccountCsvImport";
import PageLoading from "@/components/PageLoading";

type Account = {
  id: string;
  bankName: string;
  branch: string | null;
  accountNo: string;
  accountName: string;
  openingBalance: number;
  isActive: boolean;
};

type ReceiptHistory = Awaited<ReturnType<typeof getReceiptsForBankAccount>>;

export default function CompanyAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ bankName: "", branch: "", accountNo: "", accountName: "", openingBalance: "0" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiptsByAccount, setReceiptsByAccount] = useState<Record<string, ReceiptHistory>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [balanceSaving, setBalanceSaving] = useState(false);

  useEffect(() => {
    getCompanyBankAccounts().then((a) => setAccounts(a as Account[]));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const newAcct = await createCompanyBankAccount({
        bankName: form.bankName,
        branch: form.branch || undefined,
        accountNo: form.accountNo,
        accountName: form.accountName,
        openingBalance: parseFloat(form.openingBalance) || 0,
      });
      setAccounts([...accounts, newAcct as Account]);
      setShowForm(false);
      setForm({ bankName: "", branch: "", accountNo: "", accountName: "", openingBalance: "0" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await updateCompanyBankAccount(id, { isActive: !isActive });
    setAccounts(accounts.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a)));
  }

  function startEditBalance(acct: Account) {
    setEditingBalanceId(acct.id);
    setBalanceInput(String(acct.openingBalance));
  }

  async function saveBalance(id: string) {
    setBalanceSaving(true);
    try {
      const openingBalance = parseFloat(balanceInput) || 0;
      await updateCompanyBankAccount(id, { openingBalance });
      setAccounts(accounts.map((a) => (a.id === id ? { ...a, openingBalance } : a)));
      setEditingBalanceId(null);
    } finally {
      setBalanceSaving(false);
    }
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!receiptsByAccount[id]) {
      setHistoryLoading(id);
      const receipts = await getReceiptsForBankAccount(id);
      setReceiptsByAccount((prev) => ({ ...prev, [id]: receipts }));
      setHistoryLoading(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">บัญชีธนาคารบริษัท</h1>
        <div className="flex items-center gap-3">
          <CompanyBankAccountCsvImport />
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            + เพิ่มบัญชี
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
          <h2 className="font-semibold text-blue-900 mb-3">เพิ่มบัญชีธนาคาร</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ธนาคาร *</label>
              <input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                required
                placeholder="ธนาคารกสิกรไทย"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
              <input
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                placeholder="สาขาสีลม"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัญชี *</label>
              <input
                value={form.accountNo}
                onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
                required
                placeholder="xxx-x-xxxxx-x"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบัญชี *</label>
              <input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                required
                placeholder="บริษัท ตัวอย่าง จำกัด"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ยอดยกมา</label>
              <input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <div className="col-span-2 text-red-600 text-sm">{error}</div>}
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={loading} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
                {loading ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">ยกเลิก</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            ยังไม่มีบัญชีธนาคาร
          </div>
        ) : (
          accounts.map((acct) => {
            const receipts = receiptsByAccount[acct.id];
            const totalReceived = receipts?.reduce((sum, r) => sum + r.actualReceivedAmount, 0) ?? 0;
            const isExpanded = expandedId === acct.id;
            return (
              <div key={acct.id} className={`bg-white rounded-xl border overflow-hidden ${acct.isActive ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                    🏦
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{acct.bankName} {acct.branch && `· ${acct.branch}`}</div>
                    <div className="text-sm text-gray-500 font-mono">{acct.accountNo} | {acct.accountName}</div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                      <span>ยอดยกมา:</span>
                      {editingBalanceId === acct.id ? (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            autoFocus
                            value={balanceInput}
                            onChange={(e) => setBalanceInput(e.target.value)}
                            className="w-28 border border-gray-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button
                            onClick={() => saveBalance(acct.id)}
                            disabled={balanceSaving}
                            className="text-blue-600 hover:underline disabled:opacity-50"
                          >
                            บันทึก
                          </button>
                          <button onClick={() => setEditingBalanceId(null)} className="text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-gray-700">฿{formatCurrency(acct.openingBalance)}</span>
                          <button onClick={() => startEditBalance(acct)} className="text-blue-600 hover:underline">
                            แก้ไข
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${acct.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {acct.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                    <button
                      onClick={() => toggleHistory(acct.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {isExpanded ? "ซ่อนประวัติรับเงิน" : "ดูประวัติรับเงิน"}
                    </button>
                    <button
                      onClick={() => handleToggle(acct.id, acct.isActive)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      {acct.isActive ? "ปิด" : "เปิด"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {historyLoading === acct.id ? (
                      <PageLoading compact />
                    ) : !receipts || receipts.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">ยังไม่มีประวัติรับเงินในบัญชีนี้</p>
                    ) : (
                      <div className="space-y-2">
                        {receipts.map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-sm bg-white rounded-lg border border-gray-100 px-3 py-2">
                            <div>
                              <Link href={`/receipts/${r.id}`} className="font-mono text-blue-700 hover:underline">
                                {r.receiptNumber}
                              </Link>
                              <span className="text-gray-400 ml-2">{formatDate(r.receiptDate)}</span>
                              <span className="text-gray-500 ml-2">
                                {[...new Set(r.items.map((i) => i.invoice.customer.name))].join(", ")}
                              </span>
                              {r.status === "DRAFT" && (
                                <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">ร่าง</span>
                              )}
                              {r.shortageOrExcessAmount !== 0 && (
                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${r.shortageOrExcessAmount > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {r.shortageOrExcessAmount > 0 ? "เกิน" : "ขาด"} ฿{formatCurrency(Math.abs(r.shortageOrExcessAmount))}
                                </span>
                              )}
                            </div>
                            <span className="font-medium">฿{formatCurrency(r.actualReceivedAmount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm text-gray-500 pt-2 px-1 border-t border-gray-200">
                          <span>ยอดยกมา</span>
                          <span>฿{formatCurrency(acct.openingBalance)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-blue-700 px-1">
                          <span>รับเงินรวม (ยอดรับจริง)</span>
                          <span>฿{formatCurrency(totalReceived)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-2 px-1">
                          <span>ยอดคงเหลือ (ยกมา + รับเงินรวม)</span>
                          <span>฿{formatCurrency(acct.openingBalance + totalReceived)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
