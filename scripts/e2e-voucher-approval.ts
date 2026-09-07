/**
 * ทดสอบปลายทางจริง: สร้างใบสำคัญตัวอย่าง 1 ใบต่อชนิด (SI/AP/RC/PAY) สถานะ APPROVED
 * ในฐานข้อมูลจริง ตรวจงบทดลอง/งบกำไรขาดทุน/บัญชีแยกประเภท แล้ว "ลบคืนทุกใบ" ใน finally เสมอ.
 *
 * ตรวจว่า:
 *   1. งบทดลองยังดุล
 *   2. ยอดงบทดลอง (เคลื่อนไหว/ยกไป) ไม่เปลี่ยนจากก่อนสร้าง  -> การสังเคราะห์ถูกข้าม ไม่นับซ้ำ
 *   3. ยอดงบกำไรขาดทุน (รายได้/ค่าใช้จ่าย/กำไรสุทธิ ledger) ไม่เปลี่ยน และยังตรงกับงบทดลอง
 *   4. บัญชีแยกประเภทติดป้ายสมุดรายวันย่อยถูกต้อง + ลิงก์เอกสารต้นทาง
 *   5. หลังลบคืน ทุกอย่างกลับเท่าเดิม และไม่มีใบสำคัญทดสอบหลงเหลือ
 */
import { prisma } from "../lib/prisma";
import { getTrialBalance, getProfitLossStatement, getGeneralLedger } from "../actions/ledger";
import { configResolver } from "../lib/auto-voucher";
import { bankConfigKey } from "../lib/ledger";

const TAG = `__E2ETEST__${Date.now()}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const eq = (a: number, b: number) => Math.abs(r2(a - b)) < 0.01;
const F = (n: number) => r2(n).toLocaleString(undefined, { minimumFractionDigits: 2 });

let pass = true;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${detail ? `   —   ${detail}` : ""}`);
  if (!cond) pass = false;
};

type Line = { accountId: string; debit: number; credit: number };
const isReal = (id: string) => id && !id.startsWith("__unset__:");
const balanced = (ls: Line[]) => eq(ls.reduce((s, l) => s + l.debit, 0), ls.reduce((s, l) => s + l.credit, 0));
const usable = (ls: Line[]) => ls.length >= 2 && balanced(ls) && ls.every((l) => isReal(l.accountId) && (l.debit !== 0 || l.credit !== 0));

async function main() {
  const created: { id: string; key: string; voucherNumber: string; sourceId: string }[] = [];
  let beforeDr = 0;
  let beforeCr = 0;

  try {
    const config = await prisma.accountingConfig.findMany();
    const res = configResolver(config);
    const chart = await prisma.chartOfAccount.findMany({ select: { id: true } });
    const valid = new Set(chart.map((a) => a.id));
    const G = (k: string) => res.get(k) ?? `__unset__:${k}`;
    const bank = (id: string) => res.bank(id) ?? `__unset__:${bankConfigKey(id)}`;
    const safe = (id: string | null | undefined) => (id && valid.has(id) ? id : G("ap_suspense"));

    // ---------- เลือกเอกสาร + สร้างบรรทัดใบสำคัญ (ตรรกะเดียวกับ generate*Vouchers) ----------
    const picks: { key: string; sourceType: string; sourceId: string; date: Date; desc: string; lines: Line[]; originHref: string; book: string }[] = [];

    // SI
    for (const si of await prisma.salesInvoice.findMany({
      where: { status: { not: "CANCELLED" } }, orderBy: { invoiceDate: "desc" }, take: 30,
      include: { customer: { select: { name: true } } },
    })) {
      const lines: Line[] = [
        { accountId: G("ar"), debit: r2(si.totalAmount), credit: 0 },
        { accountId: G("revenue"), debit: 0, credit: r2(si.amount - si.discountAmount) },
      ];
      if (r2(si.vatAmount) !== 0) lines.push({ accountId: G("vat_output"), debit: 0, credit: r2(si.vatAmount) });
      if (usable(lines)) {
        picks.push({ key: "SI", sourceType: "SI", sourceId: si.id, date: si.invoiceDate, desc: `ขาย — ${si.customer.name} (${si.invoiceNumber})`, lines, originHref: `/sales-invoices/${si.id}`, book: "สมุดรายวันขาย" });
        break;
      }
    }

    // AP
    for (const ap of await prisma.accountsPayable.findMany({
      where: { status: { not: "CANCELLED" } }, orderBy: { invoiceDate: "desc" }, take: 40,
      include: { vendor: { select: { name: true } }, account: { select: { id: true } }, gr: { select: { items: { select: { totalPrice: true, poItem: { select: { product: { select: { accountId: true } } } } } } } } },
    })) {
      const amount = r2(ap.amount);
      const lines: Line[] = [{ accountId: G("ap"), debit: 0, credit: r2(ap.totalAmount) }];
      if (r2(ap.vatAmount) !== 0) lines.push({ accountId: G("vat_input"), debit: r2(ap.vatAmount), credit: 0 });
      const items = ap.gr?.items ?? [];
      const sum = items.reduce((s, it) => s + it.totalPrice, 0);
      const byAcc = new Map<string, number>();
      if (items.length === 0 || sum <= 0) byAcc.set(safe(ap.account?.id), amount);
      else for (const it of items) { const a = safe(it.poItem.product?.accountId ?? ap.account?.id); byAcc.set(a, (byAcc.get(a) ?? 0) + (it.totalPrice / sum) * amount); }
      const ent = [...byAcc.entries()].map(([a, n]) => ({ a, n: r2(n) }));
      const resid = r2(amount - r2(ent.reduce((s, e) => s + e.n, 0)));
      if (resid !== 0 && ent.length) ent[ent.length - 1].n = r2(ent[ent.length - 1].n + resid);
      for (const e of ent) if (e.n !== 0) lines.push({ accountId: e.a, debit: e.n, credit: 0 });
      if (usable(lines)) {
        picks.push({ key: "AP", sourceType: "AP", sourceId: ap.id, date: ap.invoiceDate, desc: `ซื้อ — ${ap.vendor.name} (${ap.invoiceNumber})`, lines, originHref: `/accounts-payable/${ap.id}`, book: "สมุดรายวันซื้อ" });
        break;
      }
    }

    // RC
    for (const rc of await prisma.receipt.findMany({
      where: { status: { not: "CANCELLED" } }, orderBy: { receiptDate: "desc" }, take: 10,
      include: { companyBankAccount: { select: { bankName: true } }, items: { select: { amount: true, invoice: { select: { customer: { select: { name: true } } } } } } },
    })) {
      const arTotal = r2(rc.items.reduce((s, i) => s + i.amount, 0));
      const recv = r2(rc.actualReceivedAmount), fee = r2(rc.feeAmount), wht = r2(rc.withholdingTaxAmount);
      const cand: Line[] = [];
      if (recv !== 0) cand.push({ accountId: bank(rc.companyBankAccountId), debit: recv, credit: 0 });
      if (fee !== 0) cand.push({ accountId: G("bank_fee"), debit: fee, credit: 0 });
      if (wht !== 0) cand.push({ accountId: G("wht_receivable"), debit: wht, credit: 0 });
      if (arTotal !== 0) cand.push({ accountId: G("ar"), debit: 0, credit: arTotal });
      const d = r2(cand.reduce((s, c) => s + c.debit, 0) - cand.reduce((s, c) => s + c.credit, 0));
      if (d < 0) cand.push({ accountId: G("receipt_variance"), debit: r2(-d), credit: 0 });
      else if (d > 0) cand.push({ accountId: G("receipt_variance"), debit: 0, credit: d });
      if (usable(cand)) {
        const cust = [...new Set(rc.items.map((i) => i.invoice.customer.name))].join(", ");
        picks.push({ key: "RC", sourceType: "RC", sourceId: rc.id, date: rc.receiptDate, desc: `รับชำระ — ${cust} (${rc.receiptNumber})`, lines: cand, originHref: `/receipts/${rc.id}`, book: "สมุดรายวันรับเงิน" });
        break;
      }
    }

    // PAY
    for (const p of await prisma.payment.findMany({
      orderBy: { paymentDate: "desc" }, take: 20,
      include: { prep: { select: { totalWithholdingTax: true, items: { select: { ap: { select: { vendor: { select: { name: true } } } } } } } } },
    })) {
      const amount = r2(p.amount), wht = r2(p.prep.totalWithholdingTax ?? 0);
      const lines: Line[] = [];
      if (r2(amount + wht) !== 0) lines.push({ accountId: G("ap"), debit: r2(amount + wht), credit: 0 });
      if (wht !== 0) lines.push({ accountId: G("wht_payable"), debit: 0, credit: wht });
      if (amount !== 0) lines.push({ accountId: bank(p.companyBankAccountId), debit: 0, credit: amount });
      if (usable(lines)) {
        const ven = [...new Set(p.prep.items.map((i) => i.ap.vendor.name))].join(", ");
        picks.push({ key: "PAY", sourceType: "PAY", sourceId: p.id, date: p.paymentDate, desc: `จ่ายเงิน — ${ven} (${p.paymentNumber})`, lines, originHref: `/payments/${p.id}`, book: "สมุดรายวันจ่ายเงิน" });
        break;
      }
    }

    for (const k of ["SI", "AP", "RC", "PAY"]) if (!picks.find((p) => p.key === k)) console.log(`  ⚠  ไม่พบเอกสาร ${k} ที่สร้างใบสำคัญได้ (ผังบัญชีคุมยอดอาจยังไม่ครบ)`);
    if (picks.length === 0) throw new Error("ไม่มีเอกสารให้ทดสอบ");

    // ---------- ช่วงวันที่ (กว้างครอบทุกเอกสาร เลี่ยงปัญหา timezone) + snapshot ----------
    const from = "2000-01-01";
    const to = "2100-01-01";

    const snap = async () => {
      const [tb, pl, gl] = await Promise.all([
        getTrialBalance({ from, to }),
        getProfitLossStatement({ from, to }),
        getGeneralLedger({ accountId: "ALL", from, to }),
      ]);
      let glD = 0, glC = 0;
      for (const b of gl.blocks) for (const e of b.entries) { glD += e.debit; glC += e.credit; }
      return { tb, pl, gl, glD: r2(glD), glC: r2(glC) };
    };

    console.log(`\nช่วงทดสอบ ${from} .. ${to}\nเอกสารที่เลือก: ${picks.map((p) => `${p.key}(${p.sourceId.slice(0, 6)})`).join(", ")}\n`);
    const before = await snap();
    beforeDr = before.tb.totals.periodDebit;
    beforeCr = before.tb.totals.periodCredit;

    // ---------- สร้างใบสำคัญ APPROVED ----------
    for (const p of picks) {
      const voucherNumber = `${TAG}_${p.key}`;
      const totalDebit = r2(p.lines.reduce((s, l) => s + l.debit, 0));
      const v = await prisma.journalVoucher.create({
        data: {
          voucherNumber, voucherDate: p.date, description: p.desc, status: "APPROVED",
          totalDebit, totalCredit: totalDebit, sourceType: p.sourceType, sourceId: p.sourceId,
          notes: "ทดสอบ E2E (จะถูกลบทันที)",
          lines: { create: p.lines.map((l, i) => ({ lineNo: i + 1, accountId: l.accountId, debit: l.debit, credit: l.credit })) },
        },
      });
      created.push({ id: v.id, key: p.key, voucherNumber, sourceId: p.sourceId });
    }
    console.log(`สร้างใบสำคัญ APPROVED ${created.length} ใบ`);

    // ---------- ตรวจหลังสร้าง ----------
    const after = await snap();

    console.log("\n=== งบทดลอง ===");
    check("ยังดุล", after.tb.balanced, `balanced=${after.tb.balanced}`);
    check("เคลื่อนไหว Dr เท่าเดิม", eq(before.tb.totals.periodDebit, after.tb.totals.periodDebit), `${F(before.tb.totals.periodDebit)} -> ${F(after.tb.totals.periodDebit)}`);
    check("เคลื่อนไหว Cr เท่าเดิม", eq(before.tb.totals.periodCredit, after.tb.totals.periodCredit), `${F(before.tb.totals.periodCredit)} -> ${F(after.tb.totals.periodCredit)}`);
    check("ยกไป Dr เท่าเดิม", eq(before.tb.totals.closingDebit, after.tb.totals.closingDebit));
    check("ยกไป Cr เท่าเดิม", eq(before.tb.totals.closingCredit, after.tb.totals.closingCredit));

    console.log("\n=== งบกำไรขาดทุน ===");
    check("รายได้เท่าเดิม", eq(before.pl.totalRevenue, after.pl.totalRevenue), `${F(before.pl.totalRevenue)} -> ${F(after.pl.totalRevenue)}`);
    check("ค่าใช้จ่ายเท่าเดิม", eq(before.pl.totalExpenses, after.pl.totalExpenses), `${F(before.pl.totalExpenses)} -> ${F(after.pl.totalExpenses)}`);
    check("กำไรสุทธิ(ledger)เท่าเดิม", eq(before.pl.netProfit, after.pl.netProfit), `${F(before.pl.netProfit)} -> ${F(after.pl.netProfit)}`);

    // P&L == TB (ส่วน ledger)
    const tbRevExp = (tb: typeof after.tb) => {
      let rev = 0, exp = 0;
      for (const row of tb.rows) {
        if (row.type === "REVENUE") rev = r2(rev + (row.periodCredit - row.periodDebit));
        else if (row.type === "EXPENSE") exp = r2(exp + (row.periodDebit - row.periodCredit));
      }
      return { rev, exp };
    };
    const re = tbRevExp(after.tb);
    check("P&L รายได้ == งบทดลอง", eq(after.pl.totalRevenue, re.rev), `${F(after.pl.totalRevenue)} | ${F(re.rev)}`);
    check("P&L ค่าใช้จ่าย == งบทดลอง", eq(after.pl.totalExpenses, re.exp), `${F(after.pl.totalExpenses)} | ${F(re.exp)}`);

    console.log("\n=== บัญชีแยกประเภท — ป้ายสมุดรายวัน ===");
    const entries = after.gl.blocks.flatMap((b) => b.entries);
    for (const c of created) {
      const p = picks.find((x) => x.key === c.key)!;
      const es = entries.filter((e) => e.sourceNumber === c.voucherNumber);
      const okAll = es.length > 0 && es.every((e) =>
        e.sourceTypeLabel === p.book &&
        e.originHref === p.originHref &&
        e.href === `/journal-vouchers/${c.id}`
      );
      check(`${c.key}: ${es.length} บรรทัด · ป้าย "${es[0]?.sourceTypeLabel ?? "-"}" · ต้นทาง ${es[0]?.originHref ?? "-"}`, okAll);
    }

    // ไม่นับซ้ำ: ผลรวม GL Dr/Cr เพิ่มขึ้น "เท่ากับ" ยอดใบสำคัญที่สร้าง (สังเคราะห์ถูกลบ, voucher ใส่แทน => สุทธิเปลี่ยน 0)
    check("ผลรวมบัญชีแยกประเภท ΣDr เท่าเดิม (ไม่นับซ้ำ)", eq(before.glD, after.glD), `${F(before.glD)} -> ${F(after.glD)}`);
    check("ผลรวมบัญชีแยกประเภท ΣCr เท่าเดิม (ไม่นับซ้ำ)", eq(before.glC, after.glC), `${F(before.glC)} -> ${F(after.glC)}`);
  } finally {
    if (created.length) {
      await prisma.journalVoucherLine.deleteMany({ where: { voucherId: { in: created.map((c) => c.id) } } });
      const del = await prisma.journalVoucher.deleteMany({ where: { id: { in: created.map((c) => c.id) } } });
      const leftover = await prisma.journalVoucher.count({ where: { voucherNumber: { startsWith: TAG } } });
      console.log(`\n=== ลบคืน ===`);
      console.log(`  ลบใบสำคัญทดสอบ ${del.count} ใบ · หลงเหลือ ${leftover} ใบ`);
      if (leftover !== 0) pass = false;

      // กลับเท่าเดิมไหม
      const tbAfterDel = await getTrialBalance({ from: "2000-01-01", to: "2100-01-01" });
      check("หลังลบคืน งบทดลองยังดุล", tbAfterDel.balanced);
      check(
        "หลังลบคืน ยอดเคลื่อนไหวกลับเท่าเดิม",
        eq(tbAfterDel.totals.periodDebit, beforeDr) && eq(tbAfterDel.totals.periodCredit, beforeCr),
        `Dr ${F(tbAfterDel.totals.periodDebit)} (เดิม ${F(beforeDr)}) · Cr ${F(tbAfterDel.totals.periodCredit)} (เดิม ${F(beforeCr)})`
      );
    }
    await prisma.$disconnect();
  }

  console.log(`\n${pass ? "✅ ผ่านทั้งหมด — สร้าง/อนุมัติ/ลบคืน voucher ทุกชนิด งบทดลอง+กำไรขาดทุน+แยกประเภท ถูกต้อง" : "❌ มีข้อไม่ผ่าน"}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
