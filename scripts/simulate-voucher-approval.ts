/**
 * จำลอง (ไม่เขียนฐานข้อมูล) ว่า "ถ้าอนุมัติใบสำคัญสมุดรายวันย่อยทุกใบ" งบทดลองจะยังดุลไหม
 * และค่ายังตรงเดิมไหม — เทียบ (ก) ผลของการสังเคราะห์ใน buildLedger step 2/4/5/6
 * กับ (ข) ผลของบรรทัดใบสำคัญที่ generate*Vouchers จะสร้าง สำหรับเอกสารจริงทุกใบในฐานข้อมูล
 */
import { prisma } from "../lib/prisma";
import { configResolver } from "../lib/auto-voucher";
import { bankConfigKey } from "../lib/ledger";

const r2 = (n: number) => Math.round(n * 100) / 100;
type Leg = Map<string, number>; // accountId -> net (debit +, credit -)
const add = (m: Leg, acc: string, d: number, c: number) => m.set(acc, r2((m.get(acc) ?? 0) + d - c));
const totals = (m: Leg) => {
  let D = 0;
  let C = 0;
  for (const v of m.values()) {
    if (v > 0) D += v;
    else C += -v;
  }
  return { D: r2(D), C: r2(C) };
};
const diffLegs = (a: Leg, b: Leg) => {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let maxAbs = 0;
  for (const k of keys) maxAbs = Math.max(maxAbs, Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)));
  return r2(maxAbs);
};

async function main() {
  const config = await prisma.accountingConfig.findMany();
  const res = configResolver(config);
  const chart = await prisma.chartOfAccount.findMany({ select: { id: true } });
  const valid = new Set(chart.map((a) => a.id));
  const G = (k: string) => res.get(k) ?? `__unset__:${k}`;
  const bank = (id: string) => res.bank(id) ?? `__unset__:${bankConfigKey(id)}`;
  const safe = (id: string | null | undefined) => (id && valid.has(id) ? id : G("ap_suspense"));

  const report: Record<string, { docs: number; internallyUnbalanced: number; worstAccDiff: number }> = {};

  // ---------- SI ----------
  {
    const invoices = await prisma.salesInvoice.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { id: true, amount: true, discountAmount: true, vatAmount: true, totalAmount: true },
    });
    let unbal = 0;
    let worst = 0;
    for (const si of invoices) {
      const synth: Leg = new Map();
      const vch: Leg = new Map();
      add(synth, G("ar"), r2(si.totalAmount), 0);
      add(synth, G("revenue"), 0, r2(si.amount - si.discountAmount));
      add(synth, G("vat_output"), 0, r2(si.vatAmount));
      {
        const { D, C } = totals(synth);
        if (Math.abs(D - C) > 0.0001) add(synth, G("imbalance"), C > D ? r2(C - D) : 0, D > C ? r2(D - C) : 0);
      }
      add(vch, G("ar"), r2(si.totalAmount), 0);
      add(vch, G("revenue"), 0, r2(si.amount - si.discountAmount));
      if (r2(si.vatAmount) !== 0) add(vch, G("vat_output"), 0, r2(si.vatAmount));
      const vt = totals(vch);
      if (Math.abs(vt.D - vt.C) > 0.01) unbal++;
      worst = Math.max(worst, diffLegs(synth, vch));
    }
    report.SI = { docs: invoices.length, internallyUnbalanced: unbal, worstAccDiff: worst };
  }

  // ---------- AP ----------
  {
    const aps = await prisma.accountsPayable.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        id: true,
        amount: true,
        vatAmount: true,
        totalAmount: true,
        account: { select: { id: true } },
        gr: {
          select: {
            items: {
              select: { totalPrice: true, poItem: { select: { product: { select: { accountId: true } } } } },
            },
          },
        },
      },
    });
    let unbal = 0;
    let worst = 0;
    for (const ap of aps) {
      const amount = r2(ap.amount);
      const vat = r2(ap.vatAmount);
      const tot = r2(ap.totalAmount);
      const synth: Leg = new Map();
      const vch: Leg = new Map();
      add(synth, G("ap"), 0, tot);
      add(synth, G("vat_input"), vat, 0);
      const items = ap.gr?.items ?? [];
      const sum = items.reduce((s, it) => s + it.totalPrice, 0);
      if (items.length === 0 || sum <= 0) add(synth, ap.account?.id ?? G("ap_suspense"), amount, 0);
      else
        for (const it of items)
          add(synth, it.poItem.product?.accountId ?? ap.account?.id ?? G("ap_suspense"), r2((it.totalPrice / sum) * amount), 0);
      {
        const { D, C } = totals(synth);
        if (Math.abs(D - C) > 0.0001) add(synth, G("ap_suspense"), C > D ? r2(C - D) : 0, D > C ? r2(D - C) : 0);
      }
      add(vch, G("ap"), 0, tot);
      if (vat !== 0) add(vch, G("vat_input"), vat, 0);
      const byAcc = new Map<string, number>();
      if (items.length === 0 || sum <= 0) byAcc.set(safe(ap.account?.id), amount);
      else
        for (const it of items) {
          const a = safe(it.poItem.product?.accountId ?? ap.account?.id);
          byAcc.set(a, (byAcc.get(a) ?? 0) + (it.totalPrice / sum) * amount);
        }
      const ent = [...byAcc.entries()].map(([a, n]) => ({ a, n: r2(n) }));
      const assigned = r2(ent.reduce((s, e) => s + e.n, 0));
      const resid = r2(amount - assigned);
      if (resid !== 0 && ent.length) ent[ent.length - 1].n = r2(ent[ent.length - 1].n + resid);
      for (const e of ent) if (e.n !== 0) add(vch, e.a, e.n, 0);
      const vt = totals(vch);
      if (Math.abs(vt.D - vt.C) > 0.01 || tot === 0) unbal++;
      worst = Math.max(worst, diffLegs(synth, vch));
    }
    report.AP = { docs: aps.length, internallyUnbalanced: unbal, worstAccDiff: worst };
  }

  // ---------- RC ----------
  {
    const receipts = await prisma.receipt.findMany({
      where: { status: { not: "CANCELLED" } },
      select: {
        id: true,
        companyBankAccountId: true,
        feeAmount: true,
        withholdingTaxAmount: true,
        actualReceivedAmount: true,
        items: { select: { amount: true } },
      },
    });
    let unbal = 0;
    let worst = 0;
    for (const rc of receipts) {
      const arTotal = r2(rc.items.reduce((s, i) => s + i.amount, 0));
      const recv = r2(rc.actualReceivedAmount);
      const fee = r2(rc.feeAmount);
      const wht = r2(rc.withholdingTaxAmount);
      const synth: Leg = new Map();
      const vch: Leg = new Map();
      add(synth, bank(rc.companyBankAccountId), recv, 0);
      add(synth, G("bank_fee"), fee, 0);
      add(synth, G("wht_receivable"), wht, 0);
      add(synth, G("ar"), 0, arTotal);
      {
        const { D, C } = totals(synth);
        if (Math.abs(D - C) > 0.0001) add(synth, G("receipt_variance"), C > D ? r2(C - D) : 0, D > C ? r2(D - C) : 0);
      }
      const cand: [string, number, number][] = [];
      if (recv !== 0) cand.push([bank(rc.companyBankAccountId), recv, 0]);
      if (fee !== 0) cand.push([G("bank_fee"), fee, 0]);
      if (wht !== 0) cand.push([G("wht_receivable"), wht, 0]);
      if (arTotal !== 0) cand.push([G("ar"), 0, arTotal]);
      const D0 = r2(cand.reduce((s, c) => s + c[1], 0));
      const C0 = r2(cand.reduce((s, c) => s + c[2], 0));
      const d = r2(D0 - C0);
      if (d < 0) cand.push([G("receipt_variance"), r2(-d), 0]);
      else if (d > 0) cand.push([G("receipt_variance"), 0, d]);
      for (const [a, dd, cc] of cand) add(vch, a, dd, cc);
      const vt = totals(vch);
      if (Math.abs(vt.D - vt.C) > 0.01) unbal++;
      worst = Math.max(worst, diffLegs(synth, vch));
    }
    report.RC = { docs: receipts.length, internallyUnbalanced: unbal, worstAccDiff: worst };
  }

  // ---------- PAY ----------
  {
    const payments = await prisma.payment.findMany({
      select: { id: true, amount: true, companyBankAccountId: true, prep: { select: { totalWithholdingTax: true } } },
    });
    let unbal = 0;
    let worst = 0;
    for (const p of payments) {
      const amount = r2(p.amount);
      const wht = r2(p.prep.totalWithholdingTax ?? 0);
      const synth: Leg = new Map();
      const vch: Leg = new Map();
      add(synth, G("ap"), r2(amount + wht), 0);
      add(synth, G("wht_payable"), 0, wht);
      add(synth, bank(p.companyBankAccountId), 0, amount);
      {
        const { D, C } = totals(synth);
        if (Math.abs(D - C) > 0.0001) add(synth, G("imbalance"), C > D ? r2(C - D) : 0, D > C ? r2(D - C) : 0);
      }
      if (r2(amount + wht) !== 0) add(vch, G("ap"), r2(amount + wht), 0);
      if (wht !== 0) add(vch, G("wht_payable"), 0, wht);
      if (amount !== 0) add(vch, bank(p.companyBankAccountId), 0, amount);
      const vt = totals(vch);
      if (Math.abs(vt.D - vt.C) > 0.01) unbal++;
      worst = Math.max(worst, diffLegs(synth, vch));
    }
    report.PAY = { docs: payments.length, internallyUnbalanced: unbal, worstAccDiff: worst };
  }

  console.log("จำลองการอนุมัติใบสำคัญทุกใบของแต่ละสมุดรายวัน — เทียบผลกับการสังเคราะห์เดิม\n");
  console.table(
    Object.entries(report).map(([type, v]) => ({
      สมุด: type,
      "เอกสาร(ใบ)": v.docs,
      "ใบสำคัญไม่ดุล": v.internallyUnbalanced,
      "ผลต่างรายบัญชีสูงสุด(บาท)": v.worstAccDiff,
    }))
  );
  console.log(
    "\nใบสำคัญไม่ดุล = 0 ทุกแถว -> อนุมัติแล้วงบทดลองยังดุล (เดบิตรวม = เครดิตรวม)\n" +
      "ผลต่างรายบัญชีสูงสุด ~ 0 -> ยอดในงบทดลอง/แยกประเภท/กำไรขาดทุน ไม่เปลี่ยนหลังอนุมัติ"
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
