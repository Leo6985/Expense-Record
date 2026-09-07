/**
 * ตรวจงบแสดงฐานะทางการเงิน + งบกระแสเงินสด ว่ากระทบยอดกับงบทดลอง/งบกำไรขาดทุน
 * (ทั้งคู่ดึงจาก buildLedger() ชุดเดียวกัน).
 */
import { prisma } from "../lib/prisma";
import { getBalanceSheet, getCashFlow, getTrialBalance, getProfitLossStatement } from "../actions/ledger";

const r2 = (n: number) => Math.round(n * 100) / 100;
const eq = (a: number, b: number) => Math.abs(r2(a - b)) < 0.01;
const F = (n: number) => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
let pass = true;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${detail ? `   —   ${detail}` : ""}`);
  if (!cond) pass = false;
};

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const ALL_FROM = "2000-01-01";

  // ── งบแสดงฐานะทางการเงิน ──
  console.log(`=== งบแสดงฐานะทางการเงิน ณ ${today} ===`);
  const bs = await getBalanceSheet({ asOf: today });
  const tbAll = await getTrialBalance({ from: ALL_FROM, to: today });
  const plAll = await getProfitLossStatement({ from: ALL_FROM, to: today });

  // งบทดลอง: ยอดยกไปแยกตามประเภท
  const tbNet: Record<string, number> = {};
  for (const row of tbAll.rows) {
    const net = r2(row.closingDebit - row.closingCredit);
    tbNet[row.type] = r2((tbNet[row.type] ?? 0) + net);
  }
  const tbAssets = r2(tbNet.ASSET ?? 0);
  const tbLiab = r2(-(tbNet.LIABILITY ?? 0));
  const tbEquityAcc = r2(-(tbNet.EQUITY ?? 0));
  const tbRE = r2(-(tbNet.REVENUE ?? 0) - (tbNet.EXPENSE ?? 0));

  check("สินทรัพย์รวม == งบทดลอง (ASSET closing)", eq(bs.totalAssets, tbAssets), `${F(bs.totalAssets)} | ${F(tbAssets)}`);
  check("หนี้สินรวม == งบทดลอง (LIABILITY closing)", eq(bs.totalLiabilities, tbLiab), `${F(bs.totalLiabilities)} | ${F(tbLiab)}`);
  check(
    "ส่วนของผู้ถือหุ้นรวม == บัญชีทุน + กำไรสะสม (งบทดลอง)",
    eq(bs.totalEquity, tbEquityAcc + tbRE),
    `${F(bs.totalEquity)} | ${F(tbEquityAcc + tbRE)}`
  );
  check("กำไร(ขาดทุน)สะสม == งบกำไรขาดทุน (netProfit ledger, ทั้งหมด)", eq(bs.retainedEarnings, plAll.netProfit), `${F(bs.retainedEarnings)} | ${F(plAll.netProfit)}`);
  check("diff == สินทรัพย์ − (หนี้สิน + ส่วนของผู้ถือหุ้น)", eq(bs.diff, bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)));
  check(
    "diff == −(ยอดในบัญชีที่ยังไม่จัดหมวด)  [เอกลักษณ์ A = L + E − U]",
    eq(bs.diff, -bs.unclassifiedNet),
    `diff ${F(bs.diff)} · unclassified ${F(bs.unclassifiedNet)}`
  );
  if (bs.balanced) check("งบดุล (A = L + E)", true, `${F(bs.totalAssets)}`);
  else console.log(`  ℹ  งบยังไม่ดุล ${F(bs.diff)} — จากบัญชีที่ยังไม่จัดหมวด: ${bs.unclassified.map((u) => `${u.name} ${F(u.amount)}`).join(", ")}`);

  // ── งบกระแสเงินสด ──
  console.log(`\n=== งบกระแสเงินสด ===`);
  for (const [label, from, to] of [
    ["ทั้งหมด", ALL_FROM, today],
    ["ปีนี้", `${new Date().getFullYear()}-01-01`, today],
    ["เดือนนี้", `${new Date().toISOString().slice(0, 7)}-01`, today],
  ] as [string, string, string][]) {
    const cf = await getCashFlow({ from, to });
    console.log(`\n  [${label}] ${from} .. ${to}`);
    check(
      "netChange == ดำเนินงาน + ลงทุน + จัดหาเงิน",
      eq(cf.netChange, cf.netOperating + cf.netInvesting + cf.netFinancing),
      `${F(cf.netChange)} = ${F(cf.netOperating)} + ${F(cf.netInvesting)} + ${F(cf.netFinancing)}`
    );
    check("เงินสดต้นงวด + netChange == เงินสดปลายงวด", eq(cf.openingCash + cf.netChange, cf.closingCash), `${F(cf.openingCash)} + ${F(cf.netChange)} = ${F(cf.closingCash)}`);
    check("reconciled flag", cf.reconciled);
    check(
      "เงินสดปลายงวด == ผลรวมปลายงวดรายบัญชี",
      eq(cf.closingCash, cf.cashAccounts.reduce((s, a) => s + a.closing, 0)),
      `${F(cf.closingCash)} | ${F(cf.cashAccounts.reduce((s, a) => s + a.closing, 0))}`
    );

    // เงินสดปลายงวด == งบทดลอง: ยอดยกไปสุทธิของบัญชีเงินสด ณ วันสิ้นงวด
    const config = await prisma.accountingConfig.findMany();
    const cashIds = new Set(config.filter((c) => (c.key.startsWith("bank:") || c.key === "bank_default") && c.accountId).map((c) => c.accountId as string));
    const tb = await getTrialBalance({ from: ALL_FROM, to });
    const tbCash = r2(tb.rows.filter((row) => cashIds.has(row.accountId)).reduce((s, row) => s + row.closingDebit - row.closingCredit, 0));
    check("เงินสดปลายงวด == งบทดลอง (บัญชีเงินสด closing)", eq(cf.closingCash, tbCash), `${F(cf.closingCash)} | ${F(tbCash)}`);
    if (cf.unmappedBanks.length) console.log(`  ⚠  ธนาคารยังไม่ผูกผังบัญชี: ${cf.unmappedBanks.join(", ")}`);
  }

  await prisma.$disconnect();
  console.log(`\n${pass ? "✅ ผ่าน — งบฐานะการเงิน + งบกระแสเงินสด กระทบยอดกับงบทดลอง/งบกำไรขาดทุน" : "❌ มีข้อไม่ผ่าน"}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
