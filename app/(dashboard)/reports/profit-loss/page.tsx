"use client";

import { useState } from "react";
import Link from "next/link";
import { getProfitLossStatement, ProfitLossStatement } from "@/actions/ledger";
import { getInventorySnapshot, saveInventorySnapshot } from "@/actions/reports";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import PageLoading from "@/components/PageLoading";

const money = (n: number) => `${n < 0 ? "-" : ""}฿${formatCurrency(Math.abs(n))}`;
const cell = (n: number) => (n === 0 ? "" : money(n));
const round2 = (n: number) => Math.round(n * 100) / 100;

// periodKey ของ InventorySnapshot — คงรูปแบบเดิม ("YYYY-MM" / "YYYY") เมื่อช่วงวันที่ตรงกับเดือนเต็ม
// หรือปีเต็มพอดี เพื่อให้ค่าที่บันทึกไว้ก่อนหน้ายังใช้ได้ นอกนั้นใช้ "from_to"
function inventoryPeriodKey(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (fy && ty && fm && tm) {
    const lastDay = new Date(ty, tm, 0).getDate();
    if (fy === ty && fm === tm && fd === 1 && td === lastDay)
      return `${fy}-${String(fm).padStart(2, "0")}`;
    if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `${fy}`;
  }
  return `${from}_${to}`;
}

export default function ProfitLossPage() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [stmt, setStmt] = useState<ProfitLossStatement | null>(null);
  const [loading, setLoading] = useState(false);

  // สินค้าคงเหลือต้นงวด/ปลายงวด — กรอกเอง บันทึกต่อ periodKey ใช้ปรับปรุงกำไรสุทธิ (ยังไม่ลง ledger)
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("0");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSearch() {
    setLoading(true);
    const [data, snapshot] = await Promise.all([
      getProfitLossStatement({ from, to }),
      getInventorySnapshot(inventoryPeriodKey(from, to)),
    ]);
    setStmt(data);
    setOpening(String(snapshot?.openingValue ?? 0));
    setClosing(String(snapshot?.closingValue ?? 0));
    setSavedAt(null);
    setLoading(false);
  }

  async function handleSaveInventory() {
    if (!stmt) return;
    setSaving(true);
    try {
      await saveInventorySnapshot(
        inventoryPeriodKey(stmt.from, stmt.to),
        Number(opening) || 0,
        Number(closing) || 0
      );
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  const openingValue = Number(opening) || 0;
  const closingValue = Number(closing) || 0;
  const inventoryChange = round2(closingValue - openingValue);

  const payrollTotal = stmt?.payrollTotal ?? 0;
  const ledgerNet = stmt?.netProfit ?? 0;
  const adjustedNet = round2(ledgerNet - payrollTotal + inventoryChange);
  const hasAdjustments = payrollTotal !== 0 || inventoryChange !== 0;

  function handleDownloadCSV() {
    if (!stmt) return;
    const headers = ["ส่วน", "รหัสบัญชี", "ชื่อบัญชี", "จำนวนเงิน"];
    const rows: (string | number)[][] = [];
    for (const r of stmt.revenueRows) rows.push(["รายได้", r.code, r.name, r.amount]);
    rows.push(["", "", "รวมรายได้", stmt.totalRevenue]);
    for (const r of stmt.expenseRows) rows.push(["ค่าใช้จ่าย (บัญชีแยกประเภท)", r.code, r.name, r.amount]);
    rows.push(["", "", "รวมค่าใช้จ่าย (บัญชีแยกประเภท)", stmt.totalExpenses]);
    rows.push(["", "", "กำไร(ขาดทุน)จากบัญชีแยกประเภท", stmt.netProfit]);
    for (const r of stmt.payrollRows)
      rows.push(["ปรับปรุง: เงินเดือน/แรงงาน", r.code, r.name, -r.amount]);
    if (payrollTotal !== 0) rows.push(["", "", "รวมค่าใช้จ่ายเงินเดือน/แรงงาน", -payrollTotal]);
    if (inventoryChange !== 0)
      rows.push(["ปรับปรุง: สินค้าคงเหลือ", "", "การเปลี่ยนแปลงสินค้าคงเหลือ (ปลายงวด − ต้นงวด)", inventoryChange]);
    rows.push(["", "", "กำไร(ขาดทุน)สุทธิ", adjustedNet]);
    downloadCSV(`profit_loss_${stmt.from}_${stmt.to}.csv`, headers, rows);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">งบกำไรขาดทุน</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            รายได้และค่าใช้จ่ายดึงจากบัญชีแยกประเภทชุดเดียวกับ
            <Link href="/trial-balance" className="text-blue-700 hover:underline">งบทดลอง</Link> จึงกระทบยอดกันได้
          </p>
        </div>
        {stmt && (
          <a
            href={`/api/export/profit-loss?from=${stmt.from}&to=${stmt.to}`}
            className="text-sm text-green-700 hover:underline font-medium"
          >
            ⬇ .xlsx
          </a>
        )}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ตั้งแต่วันที่</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ถึงวันที่</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "กำลังโหลด..." : "ค้นหา"}
        </button>
        {stmt && (
          <button
            onClick={handleDownloadCSV}
            className="bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            ดาวน์โหลด CSV
          </button>
        )}
      </div>

      {loading ? (
        <PageLoading />
      ) : stmt === null ? (
        <div className="text-center text-gray-400 text-sm py-12">เลือกช่วงเวลา แล้วกดค้นหา</div>
      ) : (
        <>
          {stmt.unsetKeys.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-4">
              มีบัญชีคุมยอดที่ยังไม่ได้ตั้งค่า — รายได้/ค่าใช้จ่ายบางส่วนอาจตกไปอยู่แถว
              &quot;(ยังไม่ได้ตั้งค่า)&quot; และไม่ถูกนับในงบนี้{" "}
              <Link href="/accounting-config" className="underline font-medium">ไปตั้งค่า</Link>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 mb-1">รายได้รวม</div>
              <div className="text-2xl font-bold text-blue-700">฿{formatCurrency(stmt.totalRevenue)}</div>
              <div className="text-[11px] text-blue-400 mt-1">บัญชีประเภทรายได้ จาก ledger</div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
              <div className="text-xs text-orange-600 mb-1">ค่าใช้จ่ายรวม{hasAdjustments ? " (หลังปรับปรุง)" : ""}</div>
              <div className="text-2xl font-bold text-orange-700">
                ฿{formatCurrency(round2(stmt.totalExpenses + payrollTotal - inventoryChange))}
              </div>
              <div className="text-[11px] text-orange-400 mt-1">
                บัญชีประเภทค่าใช้จ่าย{hasAdjustments ? " + รายการปรับปรุง" : ""}
              </div>
            </div>
            <div
              className={`rounded-xl border p-4 text-center ${
                adjustedNet >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
              }`}
            >
              <div className={`text-xs mb-1 ${adjustedNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                กำไร(ขาดทุน)สุทธิ
              </div>
              <div className={`text-2xl font-bold ${adjustedNet >= 0 ? "text-green-700" : "text-red-700"}`}>
                {money(adjustedNet)}
              </div>
              <div className={`text-[11px] mt-1 ${adjustedNet >= 0 ? "text-green-400" : "text-red-400"}`}>
                {stmt.totalRevenue > 0
                  ? `${((adjustedNet / stmt.totalRevenue) * 100).toFixed(1)}% ของรายได้`
                  : "-"}
              </div>
            </div>
          </div>

          {/* Statement */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <tbody>
                {/* รายได้ */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <td className="px-4 py-2 font-semibold text-gray-700" colSpan={3}>รายได้</td>
                </tr>
                {stmt.revenueRows.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-400" colSpan={3}>ไม่มีรายได้ในช่วงเวลานี้</td>
                  </tr>
                ) : (
                  stmt.revenueRows.map((r) => (
                    <tr key={r.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-500 w-28">{r.code}</td>
                      <td className="px-4 py-2 text-gray-800">{r.name}</td>
                      <td className="px-4 py-2 text-right text-gray-700 w-40">{cell(r.amount)}</td>
                    </tr>
                  ))
                )}
                <tr className="border-b border-gray-200 font-semibold text-gray-900">
                  <td className="px-4 py-2" colSpan={2}>รวมรายได้</td>
                  <td className="px-4 py-2 text-right text-blue-700">฿{formatCurrency(stmt.totalRevenue)}</td>
                </tr>

                {/* ค่าใช้จ่าย */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <td className="px-4 py-2 font-semibold text-gray-700" colSpan={3}>ค่าใช้จ่าย (บัญชีแยกประเภท)</td>
                </tr>
                {stmt.expenseRows.length === 0 ? (
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-400" colSpan={3}>ไม่มีค่าใช้จ่ายในช่วงเวลานี้</td>
                  </tr>
                ) : (
                  stmt.expenseRows.map((r) => (
                    <tr key={r.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-500">{r.code}</td>
                      <td className="px-4 py-2 text-gray-800">{r.name}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{cell(r.amount)}</td>
                    </tr>
                  ))
                )}
                <tr className="border-b border-gray-200 font-semibold text-gray-900">
                  <td className="px-4 py-2" colSpan={2}>รวมค่าใช้จ่าย (บัญชีแยกประเภท)</td>
                  <td className="px-4 py-2 text-right text-orange-700">฿{formatCurrency(stmt.totalExpenses)}</td>
                </tr>

                {/* กำไรจาก ledger */}
                <tr className={`border-b border-gray-200 font-semibold ${stmt.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  <td className="px-4 py-2.5" colSpan={2}>
                    {hasAdjustments ? "กำไร(ขาดทุน)จากบัญชีแยกประเภท" : "กำไร(ขาดทุน)สุทธิ"}
                  </td>
                  <td className="px-4 py-2.5 text-right">{money(stmt.netProfit)}</td>
                </tr>

                {/* รายการปรับปรุง */}
                {hasAdjustments && (
                  <>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td className="px-4 py-2 font-semibold text-gray-700" colSpan={3}>
                        รายการปรับปรุง (ยังไม่ลงบัญชีแยกประเภท)
                      </td>
                    </tr>
                    {stmt.payrollRows.map((r) => (
                      <tr key={`pr-${r.accountId}`} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-500">{r.code}</td>
                        <td className="px-4 py-2 text-gray-800">{r.name} <span className="text-[11px] text-gray-400">(ทำต้นทุนเพิ่ม)</span></td>
                        <td className="px-4 py-2 text-right text-red-600">{money(-r.amount)}</td>
                      </tr>
                    ))}
                    {inventoryChange !== 0 && (
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-500">—</td>
                        <td className="px-4 py-2 text-gray-800">
                          การเปลี่ยนแปลงสินค้าคงเหลือ (ปลายงวด − ต้นงวด)
                        </td>
                        <td className={`px-4 py-2 text-right ${inventoryChange >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {money(inventoryChange)}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-b-2 border-gray-300 font-bold ${adjustedNet >= 0 ? "text-green-700" : "text-red-600"}`}>
                      <td className="px-4 py-2.5" colSpan={2}>กำไร(ขาดทุน)สุทธิ (หลังปรับปรุง)</td>
                      <td className="px-4 py-2.5 text-right">{money(adjustedNet)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* สินค้าคงเหลือ */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-1 text-sm">ปรับปรุงการเปลี่ยนแปลงสินค้าคงเหลือ</h3>
            <p className="text-xs text-gray-500 mb-4">
              กรอกมูลค่าสินค้าคงเหลือต้นงวด/ปลายงวดเอง — ส่วนต่างจะถูกนำไปปรับกำไร(ขาดทุน)สุทธิด้านบน
              (ยอดนี้ยังไม่ถูกบันทึกลงบัญชีแยกประเภท จึงไม่กระทบงบทดลอง)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">สินค้าคงเหลือต้นงวด</label>
                <input
                  type="number"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">สินค้าคงเหลือปลายงวด</label>
                <input
                  type="number"
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="space-y-1.5 text-sm border-t border-gray-100 pt-3">
              <div className="flex justify-between text-gray-600">
                <span>สินค้าคงเหลือปลายงวด</span>
                <span>฿{formatCurrency(closingValue)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>หัก สินค้าคงเหลือต้นงวด</span>
                <span>-฿{formatCurrency(openingValue)}</span>
              </div>
              <div className={`flex justify-between font-semibold border-t border-gray-100 pt-1.5 ${inventoryChange >= 0 ? "text-green-700" : "text-red-600"}`}>
                <span>ปรับกำไร(ขาดทุน)สุทธิ</span>
                <span>{money(inventoryChange)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleSaveInventory}
                disabled={saving}
                className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกมูลค่าสินค้าคงคลัง"}
              </button>
              {savedAt && <span className="text-xs text-green-600">✓ บันทึกแล้ว</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
