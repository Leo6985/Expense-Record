/**
 * ตรวจว่ายอดในงบกำไรขาดทุน (getProfitLossStatement) ตรงกับงบทดลอง (getTrialBalance) —
 * ทั้งคู่ดึงจาก buildLedger() เดียวกัน จึงต้องตรงกันทั้งก่อนและหลังอนุมัติใบสำคัญสมุดรายวันย่อย
 * (สคริปต์ simulate-voucher-approval.ts พิสูจน์แล้วว่าการอนุมัติไม่เปลี่ยนความเคลื่อนไหวรายบัญชี
 *  ดังนั้นถ้าตอนนี้ตรง → หลังอนุมัติก็ตรง).
 *
 * เกณฑ์:
 *   รายได้ในงบ P&L  == Σ(งบทดลอง แถวประเภท REVENUE: เครดิต − เดบิต ช่วงงวด)
 *   ค่าใช้จ่าย P&L   == Σ(งบทดลอง แถวประเภท EXPENSE : เดบิต − เครดิต ช่วงงวด)   [เฉพาะส่วน ledger]
 *   กำไรสุทธิ(ledger) == รายได้ − ค่าใช้จ่าย
 * ตรวจอิสระอีกทางด้วยบัญชีแยกประเภท (getGeneralLedger ทุกบัญชี).
 */
import { prisma } from "../lib/prisma";
import { getProfitLossStatement } from "../actions/ledger";
import { getTrialBalance, getGeneralLedger } from "../actions/ledger";

const r2 = (n: number) => Math.round(n * 100) / 100;
const ok = (a: number, b: number) => Math.abs(r2(a - b)) < 0.01;
const F = (n: number) => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2 });

async function checkRange(label: string, from: string, to: string) {
  const [pl, tb, gl] = await Promise.all([
    getProfitLossStatement({ from, to }),
    getTrialBalance({ from, to }),
    getGeneralLedger({ accountId: "ALL", from, to }),
  ]);

  // --- งบทดลอง: แยกตามประเภทบัญชี (เฉพาะความเคลื่อนไหวช่วงงวด) ---
  let tbRevenue = 0;
  let tbExpense = 0;
  const strayRows: string[] = [];
  for (const row of tb.rows) {
    const drMinusCr = r2(row.periodDebit - row.periodCredit);
    if (row.type === "REVENUE") tbRevenue = r2(tbRevenue - drMinusCr);
    else if (row.type === "EXPENSE") tbExpense = r2(tbExpense + drMinusCr);
    else if (row.periodDebit !== 0 || row.periodCredit !== 0) {
      // แถวที่ไม่ใช่ REVENUE/EXPENSE แต่มีความเคลื่อนไหว — ปกติเป็นสินทรัพย์/หนี้สิน/ทุน
      // ยกเว้น UNSET/UNKNOWN ซึ่งอาจเป็นรายได้/ค่าใช้จ่ายที่ยังไม่ผูกผังบัญชี → เตือน
      if (row.type === "UNSET" || row.type === "UNKNOWN")
        strayRows.push(`${row.code} ${row.name} [${row.type}] Dr ${F(row.periodDebit)} / Cr ${F(row.periodCredit)}`);
    }
  }

  // --- บัญชีแยกประเภท: ตรวจอิสระ ---
  let glRevenue = 0;
  let glExpense = 0;
  for (const b of gl.blocks) {
    const crMinusDr = r2(b.totalCredit - b.totalDebit);
    if (b.type === "REVENUE") glRevenue = r2(glRevenue + crMinusDr);
    else if (b.type === "EXPENSE") glExpense = r2(glExpense - crMinusDr);
  }

  // --- P&L รายบัญชี ตรงกับงบทดลองรายบัญชีไหม ---
  const tbByAcc = new Map(tb.rows.map((r) => [r.accountId, r]));
  let rowMismatches = 0;
  for (const pr of pl.revenueRows) {
    const t = tbByAcc.get(pr.accountId);
    if (!t || !ok(pr.amount, t.periodCredit - t.periodDebit)) rowMismatches++;
  }
  for (const pe of pl.expenseRows) {
    const t = tbByAcc.get(pe.accountId);
    if (!t || !ok(pe.amount, t.periodDebit - t.periodCredit)) rowMismatches++;
  }

  const checks: [string, boolean, string][] = [
    ["รายได้: P&L == งบทดลอง", ok(pl.totalRevenue, tbRevenue), `P&L ${F(pl.totalRevenue)}  |  TB ${F(tbRevenue)}`],
    ["รายได้: P&L == แยกประเภท", ok(pl.totalRevenue, glRevenue), `P&L ${F(pl.totalRevenue)}  |  GL ${F(glRevenue)}`],
    ["ค่าใช้จ่าย(ledger): P&L == งบทดลอง", ok(pl.totalExpenses, tbExpense), `P&L ${F(pl.totalExpenses)}  |  TB ${F(tbExpense)}`],
    ["ค่าใช้จ่าย(ledger): P&L == แยกประเภท", ok(pl.totalExpenses, glExpense), `P&L ${F(pl.totalExpenses)}  |  GL ${F(glExpense)}`],
    ["กำไร(ขาดทุน)สุทธิ ledger == รายได้ − ค่าใช้จ่าย", ok(pl.netProfit, tbRevenue - tbExpense), `${F(pl.netProfit)}  |  ${F(tbRevenue - tbExpense)}`],
    ["P&L รายบัญชี ตรงกับงบทดลองรายบัญชี", rowMismatches === 0, `ไม่ตรง ${rowMismatches} บัญชี`],
    ["งบทดลองดุล", tb.balanced, `balanced=${tb.balanced}`],
  ];

  console.log(`\n=== ${label}  (${from} .. ${to}) ===`);
  for (const [name, pass, detail] of checks) console.log(`  ${pass ? "✅" : "❌"} ${name}   —   ${detail}`);
  if (pl.payrollTotal !== 0)
    console.log(`  ℹ  ค่าใช้จ่ายเงินเดือน (ปรับปรุงนอก ledger, ไม่นับในการเทียบนี้): ${F(pl.payrollTotal)}`);
  if (strayRows.length)
    console.log(`  ⚠  แถวรายได้/ค่าใช้จ่ายที่ยังไม่ผูกผังบัญชี (อยู่ในงบทดลองแต่ไม่อยู่ใน P&L):\n     - ${strayRows.join("\n     - ")}`);
  if (pl.unsetKeys.length) console.log(`  ⚠  บัญชีคุมยอดยังไม่ตั้งค่า: ${pl.unsetKeys.join(", ")}`);

  return checks.every(([, p]) => p);
}

async function main() {
  const y = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const results = [
    await checkRange("ทั้งหมด", "2000-01-01", "2100-01-01"),
    await checkRange(`ปี ${y}`, `${y}-01-01`, `${y}-12-31`),
    await checkRange("เดือนนี้", `${new Date().toISOString().slice(0, 7)}-01`, today),
    await checkRange("ปีที่แล้ว", `${y - 1}-01-01`, `${y - 1}-12-31`),
  ];
  console.log(`\n${results.every(Boolean) ? "✅ ผ่านทุกช่วง — งบกำไรขาดทุนตรงกับงบทดลอง" : "❌ มีช่วงที่ไม่ตรง"}`);
  await prisma.$disconnect();
  if (!results.every(Boolean)) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
