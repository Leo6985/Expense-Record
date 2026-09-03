"use client";

import { Fragment, useState } from "react";
import {
  getPayrollExpenses,
  savePayrollExpenses,
  PayrollExpensesResult,
} from "@/actions/payroll-expenses";
import {
  PAYROLL_EXPENSE_STRUCTURE,
  MONTH_LABELS_SHORT,
} from "@/lib/payroll-expenses";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => currentYear + 1 - i);

type ValueMap = Record<string, string[]>; // accountId -> 12 ช่องข้อความ

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export default function PayrollExpensesPage() {
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<PayrollExpensesResult | null>(null);
  const [loadedYear, setLoadedYear] = useState<number | null>(null);
  const [values, setValues] = useState<ValueMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await getPayrollExpenses(year);
      const v: ValueMap = {};
      for (const row of res.rows) {
        v[row.accountId] = row.months.map((m) => (m ? String(m) : ""));
      }
      setData(res);
      setValues(v);
      setLoadedYear(year);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function setCell(accountId: string, monthIdx: number, raw: string) {
    setValues((prev) => {
      const next = { ...prev, [accountId]: [...(prev[accountId] ?? Array(12).fill(""))] };
      next[accountId][monthIdx] = raw;
      return next;
    });
    setDirty(true);
    setSavedAt(null);
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const entries = data.rows.map((row) => ({
        accountId: row.accountId,
        months: (values[row.accountId] ?? Array(12).fill("")).map(num),
      }));
      const res = await savePayrollExpenses(loadedYear ?? year, entries);
      setDirty(false);
      setSavedAt(Date.now());
      if (res.sheetError) {
        setError(`บันทึกลงระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${res.sheetError}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const rowByCode = new Map((data?.rows ?? []).map((r) => [r.code, r]));

  const rowTotal = (accountId: string) =>
    (values[accountId] ?? []).reduce((s, c) => s + num(c), 0);

  // ผลรวมรายเดือน + รวมทั้งหมด สำหรับชุดผังบัญชีที่กำหนด
  function subtotal(codes: string[]) {
    const months = Array(12).fill(0);
    for (const code of codes) {
      const row = rowByCode.get(code);
      if (!row) continue;
      const cells = values[row.accountId] ?? [];
      for (let i = 0; i < 12; i++) months[i] += num(cells[i]);
    }
    return { months, total: months.reduce((s, v) => s + v, 0) };
  }

  const allCodes = PAYROLL_EXPENSE_STRUCTURE.flatMap((g) => g.subGroups.flatMap((s) => s.codes));
  const grand = subtotal(allCodes);

  function handleDownloadCSV() {
    if (!data) return;
    const headers = ["รหัสผังบัญชี", "ชื่อผังบัญชี", ...MONTH_LABELS_SHORT, "รวม"];
    const rows: (string | number)[][] = [];
    for (const group of PAYROLL_EXPENSE_STRUCTURE) {
      rows.push([group.heading, "", ...Array(13).fill("")]);
      for (const sub of group.subGroups) {
        if (sub.subHeading) rows.push([sub.subHeading, "", ...Array(13).fill("")]);
        for (const code of sub.codes) {
          const row = rowByCode.get(code);
          if (!row) {
            rows.push([code, "(ไม่พบผังบัญชีนี้ในระบบ)", ...Array(13).fill("")]);
            continue;
          }
          const cells = values[row.accountId] ?? [];
          rows.push([
            row.code,
            row.name,
            ...Array.from({ length: 12 }, (_, i) => num(cells[i])),
            rowTotal(row.accountId),
          ]);
        }
        const st = subtotal(sub.codes);
        rows.push([
          "",
          sub.subHeading ? `รวม ${sub.subHeading}` : `รวม ${group.heading}`,
          ...st.months,
          st.total,
        ]);
      }
      if (group.subGroups.length > 1) {
        const gt = subtotal(group.subGroups.flatMap((s) => s.codes));
        rows.push(["", `รวม ${group.heading}`, ...gt.months, gt.total]);
      }
    }
    rows.push(["", "รวมทั้งสิ้น", ...grand.months, grand.total]);
    downloadCSV(`ค่าใช้จ่ายเงินเดือน_${loadedYear ?? year}.csv`, headers, rows);
  }

  const thNum = "px-2 py-2 text-right font-medium text-gray-600 whitespace-nowrap";
  const tdNum = "px-1 py-1 text-right";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">บันทึกค่าใช้จ่ายเงินเดือน (ทำต้นทุน)</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          กรอกยอดค่าใช้จ่ายรายเดือนทั้ง 12 เดือนต่อปี ตามผังบัญชีที่กำหนด — ยอดนี้จะถูกนำไปรวมเป็นค่าใช้จ่ายในงบกำไรขาดทุน
        </p>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ปี (พ.ศ.)</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "กำลังโหลด..." : "โหลดข้อมูล"}
        </button>
        {data && (
          <>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 transition-colors"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              onClick={handleDownloadCSV}
              className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
            >
              ดาวน์โหลด CSV
            </button>
            {dirty && <span className="text-xs text-amber-600 self-center">มีการแก้ไขที่ยังไม่บันทึก</span>}
            {!dirty && savedAt && <span className="text-xs text-green-600 self-center">✓ บันทึกแล้ว</span>}
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>
      )}

      {data === null ? (
        <div className="text-center text-gray-400 text-sm py-12">เลือกปีแล้วกด “โหลดข้อมูล”</div>
      ) : (
        <>
          {data.missingCodes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-4">
              ยังไม่มีผังบัญชีเหล่านี้ในระบบ (ข้ามการกรอก): {data.missingCodes.join(", ")}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="text-xs min-w-[1100px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-gray-50 z-10">รหัสผังบัญชี</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">ชื่อผังบัญชี</th>
                  {MONTH_LABELS_SHORT.map((m) => (
                    <th key={m} className={thNum}>{m}</th>
                  ))}
                  <th className={thNum + " bg-gray-100"}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {PAYROLL_EXPENSE_STRUCTURE.map((group) => (
                  <GroupBlock
                    key={group.heading}
                    group={group}
                    rowByCode={rowByCode}
                    values={values}
                    setCell={setCell}
                    subtotal={subtotal}
                    rowTotal={rowTotal}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold text-blue-900">
                  <td className="px-3 py-2.5 sticky left-0 bg-blue-50 z-10" colSpan={2}>รวมทั้งสิ้น</td>
                  {grand.months.map((v, i) => (
                    <td key={i} className="px-2 py-2.5 text-right whitespace-nowrap">{formatCurrency(v)}</td>
                  ))}
                  <td className="px-2 py-2.5 text-right whitespace-nowrap bg-blue-100">{formatCurrency(grand.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function GroupBlock({
  group,
  rowByCode,
  values,
  setCell,
  subtotal,
  rowTotal,
}: {
  group: (typeof PAYROLL_EXPENSE_STRUCTURE)[number];
  rowByCode: Map<string, { accountId: string; code: string; name: string; months: number[] }>;
  values: ValueMap;
  setCell: (accountId: string, monthIdx: number, raw: string) => void;
  subtotal: (codes: string[]) => { months: number[]; total: number };
  rowTotal: (accountId: string) => number;
}) {
  return (
    <>
      <tr className="bg-gray-100 border-y border-gray-200">
        <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 bg-gray-100 z-10" colSpan={15}>
          {group.heading}
        </td>
      </tr>
      {group.subGroups.map((sub, si) => {
        const st = subtotal(sub.codes);
        return (
          <Fragment key={si}>
            {sub.subHeading && (
              <tr className="bg-gray-50">
                <td className="px-3 py-1.5 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10" colSpan={15}>
                  {sub.subHeading}
                </td>
              </tr>
            )}
            {sub.codes.map((code) => {
              const row = rowByCode.get(code);
              if (!row) {
                return (
                  <tr key={code} className="border-b border-gray-100 text-gray-400">
                    <td className="px-3 py-1.5 font-mono sticky left-0 bg-white z-10">{code}</td>
                    <td className="px-3 py-1.5" colSpan={14}>(ไม่พบผังบัญชีนี้ในระบบ)</td>
                  </tr>
                );
              }
              const cells = values[row.accountId] ?? Array(12).fill("");
              return (
                <tr key={code} className="border-b border-gray-100 hover:bg-blue-50/40">
                  <td className="px-3 py-1 font-mono font-semibold text-gray-800 sticky left-0 bg-white z-10">{row.code}</td>
                  <td className="px-3 py-1 text-gray-800 whitespace-nowrap">{row.name}</td>
                  {Array.from({ length: 12 }, (_, i) => (
                    <td key={i} className="px-1 py-1 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={cells[i] ?? ""}
                        onChange={(e) => setCell(row.accountId, i, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-24 border border-gray-200 rounded px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-medium text-gray-700 whitespace-nowrap bg-gray-50">
                    {formatCurrency(rowTotal(row.accountId))}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-700">
              <td className="px-3 py-2 sticky left-0 bg-gray-50 z-10" colSpan={2}>
                {sub.subHeading ? `รวม ${sub.subHeading}` : `รวม ${group.heading}`}
              </td>
              {st.months.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right whitespace-nowrap">{formatCurrency(v)}</td>
              ))}
              <td className="px-2 py-2 text-right whitespace-nowrap bg-gray-100">{formatCurrency(st.total)}</td>
            </tr>
          </Fragment>
        );
      })}
      {group.subGroups.length > 1 &&
        (() => {
          const gt = subtotal(group.subGroups.flatMap((s) => s.codes));
          return (
            <tr className="bg-gray-100 border-y border-gray-300 font-bold text-gray-800">
              <td className="px-3 py-2 sticky left-0 bg-gray-100 z-10" colSpan={2}>รวม {group.heading}</td>
              {gt.months.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right whitespace-nowrap">{formatCurrency(v)}</td>
              ))}
              <td className="px-2 py-2 text-right whitespace-nowrap bg-gray-200">{formatCurrency(gt.total)}</td>
            </tr>
          );
        })()}
    </>
  );
}
