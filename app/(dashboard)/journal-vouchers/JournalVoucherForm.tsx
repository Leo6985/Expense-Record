"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getAccountsForJournal } from "@/actions/journal-vouchers";
import { formatCurrency } from "@/lib/utils";

type Account = { id: string; code: string; name: string };

export type JournalLineDraft = {
  accountCode: string;
  department: string;
  description: string;
  debit: string;
  credit: string;
};

export type JournalVoucherFormInitial = {
  voucherDate: string;
  description: string;
  notes: string;
  lines: JournalLineDraft[];
};

export type JournalVoucherFormValues = {
  voucherDate: string;
  description: string;
  notes?: string;
  lines: { accountId: string; department?: string; description?: string; debit: number; credit: number }[];
};

const emptyLine = (): JournalLineDraft => ({ accountCode: "", department: "", description: "", debit: "", credit: "" });
const n = (s: string) => Number(s) || 0;

export default function JournalVoucherForm({
  title,
  backHref,
  submitLabel,
  savingLabel,
  initialValues,
  onSubmit,
}: {
  title: string;
  backHref: string;
  submitLabel: string;
  savingLabel: string;
  initialValues?: JournalVoucherFormInitial;
  onSubmit: (values: JournalVoucherFormValues) => Promise<void>;
}) {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const today = new Date().toISOString().split("T")[0];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [voucherDate, setVoucherDate] = useState(initialValues?.voucherDate ?? today);
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [lines, setLines] = useState<JournalLineDraft[]>(
    initialValues?.lines?.length ? initialValues.lines : [emptyLine(), emptyLine()]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAccountsForJournal().then((a) => setAccounts(a as Account[]));
  }, []);

  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);

  function updateLine(i: number, patch: Partial<JournalLineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const totalDebit = lines.reduce((s, l) => s + n(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + n(l.credit), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const balanced = Math.abs(diff) < 0.01 && totalDebit > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!description.trim()) return setError("กรุณากรอกรายละเอียด");

    const filled = lines.filter((l) => l.accountCode || n(l.debit) || n(l.credit));
    if (filled.length < 2) return setError("ต้องมีบรรทัดรายการอย่างน้อย 2 บรรทัด");

    const resolved: JournalVoucherFormValues["lines"] = [];
    for (let i = 0; i < filled.length; i++) {
      const l = filled[i];
      const acc = byCode.get(l.accountCode.trim());
      if (!acc) return setError(`บรรทัดที่ ${i + 1}: ไม่พบผังบัญชี "${l.accountCode}"`);
      if (n(l.debit) > 0 && n(l.credit) > 0) return setError(`บรรทัดที่ ${i + 1}: ระบุได้อย่างใดอย่างหนึ่ง เดบิตหรือเครดิต`);
      if (n(l.debit) === 0 && n(l.credit) === 0) return setError(`บรรทัดที่ ${i + 1}: ต้องระบุเดบิตหรือเครดิต`);
      resolved.push({
        accountId: acc.id,
        department: l.department.trim() || undefined,
        description: l.description.trim() || undefined,
        debit: n(l.debit),
        credit: n(l.credit),
      });
    }

    if (!balanced) return setError(`เดบิตรวม (${formatCurrency(totalDebit)}) ไม่เท่ากับเครดิตรวม (${formatCurrency(totalCredit)})`);

    setLoading(true);
    try {
      await onSubmit({ voucherDate, description: description.trim(), notes: notes.trim() || undefined, lines: resolved });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm mb-5">
        <span className="text-blue-400">👤</span>
        <span className="text-gray-500">ผู้จัดทำ:</span>
        <span className="font-medium text-gray-900">{userName || "กำลังโหลด..."}</span>
      </div>

      <datalist id="jv-accounts">
        {accounts.map((a) => (
          <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
        ))}
      </datalist>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">ข้อมูลทั่วไป</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ *</label>
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div />
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด *</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder="เช่น บันทึกการเลิกจ้าง นายอดิศักดิ์ มูลขำ"
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

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">รายการบัญชี</h2>
            <button type="button" onClick={addLine} className="text-blue-600 hover:underline text-sm">+ เพิ่มบรรทัด</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-2 text-left font-medium w-8">#</th>
                  <th className="px-2 py-2 text-left font-medium w-32">เลขที่บัญชี *</th>
                  <th className="px-2 py-2 text-left font-medium">ชื่อบัญชี</th>
                  <th className="px-2 py-2 text-left font-medium w-28">แผนก</th>
                  <th className="px-2 py-2 text-left font-medium">รายละเอียด</th>
                  <th className="px-2 py-2 text-right font-medium w-28">เดบิต</th>
                  <th className="px-2 py-2 text-right font-medium w-28">เครดิต</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const acc = byCode.get(l.accountCode.trim());
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          list="jv-accounts"
                          value={l.accountCode}
                          onChange={(e) => updateLine(i, { accountCode: e.target.value })}
                          placeholder="รหัส"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 text-xs">
                        {l.accountCode.trim() ? acc?.name ?? <span className="text-red-500">ไม่พบผังบัญชี</span> : "-"}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={l.department}
                          onChange={(e) => updateLine(i, { department: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.debit}
                          onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.credit}
                          onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {lines.length > 2 && (
                          <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                  <td colSpan={5} className="px-2 py-2 text-right text-gray-700">รวม</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(totalDebit)}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(totalCredit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={`mt-3 text-sm font-medium ${balanced ? "text-green-700" : "text-red-600"}`}>
            {balanced
              ? "✓ เดบิตเท่ากับเครดิต"
              : totalDebit === 0 && totalCredit === 0
                ? "กรุณากรอกจำนวนเงิน"
                : `ผลต่าง ฿${formatCurrency(Math.abs(diff))} (${diff > 0 ? "เดบิตมากกว่า" : "เครดิตมากกว่า"})`}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? savingLabel : submitLabel}
          </button>
          <Link href={backHref} className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}
