"use client";

import { useState, useEffect } from "react";
import {
  getCompanyBankAccounts,
  createCompanyBankAccount,
  updateCompanyBankAccount,
} from "@/actions/payments";

type Account = {
  id: string;
  bankName: string;
  branch: string | null;
  accountNo: string;
  accountName: string;
  isActive: boolean;
};

export default function CompanyAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ bankName: "", branch: "", accountNo: "", accountName: "" });
  const [error, setError] = useState("");

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
      });
      setAccounts([...accounts, newAcct as Account]);
      setShowForm(false);
      setForm({ bankName: "", branch: "", accountNo: "", accountName: "" });
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

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">บัญชีธนาคารบริษัท</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          + เพิ่มบัญชี
        </button>
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
          accounts.map((acct) => (
            <div key={acct.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${acct.isActive ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                🏦
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{acct.bankName} {acct.branch && `· ${acct.branch}`}</div>
                <div className="text-sm text-gray-500 font-mono">{acct.accountNo} | {acct.accountName}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${acct.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {acct.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                </span>
                <button
                  onClick={() => handleToggle(acct.id, acct.isActive)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  {acct.isActive ? "ปิด" : "เปิด"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
