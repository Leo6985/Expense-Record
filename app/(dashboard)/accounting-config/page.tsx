"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAccountingConfig, saveAccountingConfig, AccountingConfigView } from "@/actions/ledger";
import { CONFIG_KEYS, CONFIG_KEY_META, bankConfigKey } from "@/lib/ledger";
import PageLoading from "@/components/PageLoading";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "สินทรัพย์",
  LIABILITY: "หนี้สิน",
  EQUITY: "ส่วนของเจ้าของ",
  REVENUE: "รายได้",
  EXPENSE: "ค่าใช้จ่าย",
};

export default function AccountingConfigPage() {
  const [data, setData] = useState<AccountingConfigView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const d = await getAccountingConfig();
    setData(d);
    const v: Record<string, string> = {};
    for (const [k, val] of Object.entries(d.values)) v[k] = val ?? "";
    setValues(v);
  }

  useEffect(() => {
    load();
  }, []);

  if (!data) return <PageLoading />;

  const orderedTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
  const accountsByType = orderedTypes.map((t) => ({
    type: t,
    accounts: data.accounts.filter((a) => a.type === t),
  }));

  function AccountSelect({ configKey }: { configKey: string }) {
    return (
      <select
        value={values[configKey] ?? ""}
        onChange={(e) => {
          setValues((p) => ({ ...p, [configKey]: e.target.value }));
          setSavedAt(null);
        }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— ยังไม่ได้ตั้งค่า —</option>
        {accountsByType.map(
          (g) =>
            g.accounts.length > 0 && (
              <optgroup key={g.type} label={TYPE_LABEL[g.type] ?? g.type}>
                {g.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                    {!a.isActive ? " (ปิดใช้)" : ""}
                  </option>
                ))}
              </optgroup>
            )
        )}
      </select>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const entries = Object.entries(values).map(([key, accountId]) => ({
        key,
        accountId: accountId || null,
      }));
      await saveAccountingConfig(entries);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  const unsetCount = Object.entries(values).filter(([, v]) => !v).length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/general-ledger" className="text-gray-400 hover:text-gray-600">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าผังบัญชีคุมยอด</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        ผูกบัญชีคุมยอด (ลูกหนี้ เจ้าหนี้ ภาษี ธนาคาร ฯลฯ) กับรหัสในผังบัญชี ระบบใช้ค่าเหล่านี้แปลงเอกสาร
        ขาย/ซื้อ/รับ/จ่าย เป็นรายการเดบิต-เครดิตในบัญชีแยกประเภทและงบทดลอง
      </p>

      {unsetCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
          ยังไม่ได้ตั้งค่า {unsetCount} รายการ — รายการที่อ้างถึงบัญชีเหล่านี้จะแสดงเป็น
          &quot;(ยังไม่ได้ตั้งค่า)&quot; ในงบทดลองจนกว่าจะเลือกบัญชี
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {CONFIG_KEYS.map((k) => (
          <div key={k} className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-2 sm:gap-4 sm:items-center">
            <div>
              <div className="text-sm font-medium text-gray-800">{CONFIG_KEY_META[k].label}</div>
              <div className="text-xs text-gray-400">{CONFIG_KEY_META[k].hint}</div>
            </div>
            <AccountSelect configKey={k} />
          </div>
        ))}
      </div>

      {data.bankAccounts.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-2">บัญชีเงินฝากธนาคารของบริษัท</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {data.bankAccounts.map((b) => (
              <div
                key={b.id}
                className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_1.2fr] gap-2 sm:gap-4 sm:items-center"
              >
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    {b.bankName} {b.accountNo}
                  </div>
                  <div className="text-xs text-gray-400">{b.accountName}</div>
                </div>
                <AccountSelect configKey={bankConfigKey(b.id)} />
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mt-4">{error}</div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
        {savedAt && <span className="text-sm text-green-600">✓ บันทึกแล้ว</span>}
      </div>
    </div>
  );
}
