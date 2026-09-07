import { prisma } from "../lib/prisma";
import { getTrialBalance, getGeneralLedger } from "../actions/ledger";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log("=== 1) ทะเบียนใบสำคัญรายวัน (JournalVoucher) ===");
  const grouped = await prisma.journalVoucher.groupBy({
    by: ["sourceType", "status"],
    _count: { _all: true },
  });
  const rows = grouped
    .map((g) => ({ sourceType: g.sourceType ?? "(manual)", status: g.status, count: g._count._all }))
    .sort((a, b) => (a.sourceType + a.status).localeCompare(b.sourceType + b.status));
  console.table(rows);

  console.log("\n=== 2) ใบสำคัญที่อนุมัติแล้ว: เดบิตรวม = เครดิตรวม ต่อใบ? ===");
  const approved = await prisma.journalVoucher.findMany({
    where: { status: "APPROVED" },
    select: { voucherNumber: true, sourceType: true, totalDebit: true, totalCredit: true, lines: { select: { debit: true, credit: true } } },
  });
  let badVouchers = 0;
  for (const v of approved) {
    const d = round2(v.lines.reduce((s, l) => s + l.debit, 0));
    const c = round2(v.lines.reduce((s, l) => s + l.credit, 0));
    const headerMismatch = Math.abs(v.totalDebit - v.totalCredit) > 0.01;
    const lineMismatch = Math.abs(d - c) > 0.01;
    if (headerMismatch || lineMismatch) {
      badVouchers++;
      console.log(`  ⚠ ${v.voucherNumber} [${v.sourceType ?? "manual"}] header ${v.totalDebit}/${v.totalCredit} lines ${d}/${c}`);
    }
  }
  console.log(`  ใบสำคัญอนุมัติแล้ว ${approved.length} ใบ — ไม่ดุล ${badVouchers} ใบ`);

  const ranges: [string, string, string][] = [
    ["ทั้งหมด", "2000-01-01", "2100-01-01"],
    ["ปีนี้", `${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`],
    ["เดือนนี้", new Date().toISOString().slice(0, 7) + "-01", new Date().toISOString().slice(0, 10)],
  ];

  for (const [label, from, to] of ranges) {
    console.log(`\n=== 3) งบทดลอง — ${label} (${from} .. ${to}) ===`);
    const tb = await getTrialBalance({ from, to });
    const t = tb.totals;
    console.log(`  balanced flag       : ${tb.balanced}`);
    console.log(`  ยอดยกมา  Dr/Cr       : ${t.openingDebit} / ${t.openingCredit}   diff ${round2(t.openingDebit - t.openingCredit)}`);
    console.log(`  เคลื่อนไหว Dr/Cr      : ${t.periodDebit} / ${t.periodCredit}   diff ${round2(t.periodDebit - t.periodCredit)}`);
    console.log(`  ยอดยกไป  Dr/Cr       : ${t.closingDebit} / ${t.closingCredit}   diff ${round2(t.closingDebit - t.closingCredit)}`);
    console.log(`  แถวทั้งหมด           : ${tb.rows.length}   บัญชีคุมยอดยังไม่ตั้งค่า: ${tb.unsetKeys.length ? tb.unsetKeys.join(", ") : "-"}`);

    // independent: sum every raw GL entry
    const gl = await getGeneralLedger({ accountId: "ALL", from, to });
    let D = 0, C = 0, n = 0;
    for (const b of gl.blocks) for (const e of b.entries) { D += e.debit; C += e.credit; n++; }
    console.log(`  GL รายบรรทัด ${n} รายการ: ΣDr ${round2(D)} / ΣCr ${round2(C)}   diff ${round2(D - C)}`);
  }

  console.log("\n=== 4) ตรวจนับซ้ำ: เอกสารต้นทางที่มีใบสำคัญอนุมัติแล้ว ต้องไม่ถูกสังเคราะห์อีก ===");
  // approved auto-voucher source ids by type
  for (const st of ["SI", "AP", "RC", "PAY"] as const) {
    const vs = await prisma.journalVoucher.findMany({ where: { status: "APPROVED", sourceType: st }, select: { sourceId: true } });
    console.log(`  ${st}: ใบสำคัญอนุมัติแล้ว ${vs.length} รายการ (buildLedger step ${st === "SI" ? 2 : st === "RC" ? 4 : st === "PAY" ? 5 : 6} จะข้ามการสังเคราะห์ให้)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
