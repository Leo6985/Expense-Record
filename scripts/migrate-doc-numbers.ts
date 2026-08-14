// One-time migration: renumbers PO/AP/GR/PP/PAY document numbers from the old
// PREFIX + 2-digit Buddhist year + 2-digit month + 4-digit sequence format
// (e.g. PP69080001) to PREFIX + 4-digit Gregorian year + 2-digit month + 3-digit
// sequence (e.g. PP202608001), matching the new getNext*Number() generators.
//
// Sales invoices, receipts, and debit/credit notes are intentionally NOT touched —
// those are legal tax documents where renumbering an already-issued number is not
// acceptable.
//
// Run with no args (default) for a dry run that only prints the planned renames.
// Pass --apply to actually write the changes to Postgres, then does ONE full
// resync of the number field to the Sheet per table (not per row) — SheetTable.update()
// re-reads the whole tab on every call, so a per-row loop blows through Sheets API's
// 60-reads/min quota; updateMany() batches it into a single read + single batchUpdate.

import { PrismaClient } from "@prisma/client";
import {
  purchaseOrdersTable,
  accountsPayableTable,
  goodsReceiptsTable,
  paymentPrepsTable,
  paymentsTable,
} from "../lib/sheets-tables";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Doc = { id: string; number: string; createdAt: Date };

function newNumberFor(prefix: string, createdAt: Date, seq: number): string {
  const year = String(createdAt.getFullYear());
  const month = String(createdAt.getMonth() + 1).padStart(2, "0");
  return `${prefix}${year}${month}${String(seq).padStart(3, "0")}`;
}

function planRenames(prefix: string, docs: Doc[]): { id: string; oldNumber: string; newNumber: string }[] {
  const sorted = [...docs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const seqByMonth = new Map<string, number>();
  const plan: { id: string; oldNumber: string; newNumber: string }[] = [];

  for (const doc of sorted) {
    const monthKey = `${doc.createdAt.getFullYear()}-${doc.createdAt.getMonth() + 1}`;
    const seq = (seqByMonth.get(monthKey) ?? 0) + 1;
    seqByMonth.set(monthKey, seq);
    const newNumber = newNumberFor(prefix, doc.createdAt, seq);
    if (newNumber !== doc.number) {
      plan.push({ id: doc.id, oldNumber: doc.number, newNumber });
    }
  }
  return plan;
}

async function migrate<TField extends string>(
  label: string,
  prefix: string,
  findMany: () => Promise<{ id: string; createdAt: Date; number: string }[]>,
  updatePostgres: (id: string, newNumber: string) => Promise<unknown>,
  field: TField,
  sheetTable: { updateMany: (u: { id: string; data: Record<string, string> }[]) => Promise<void> }
) {
  const rows = await findMany();
  const plan = planRenames(prefix, rows.map((r) => ({ id: r.id, number: r.number, createdAt: r.createdAt })));
  console.log(`\n=== ${label}: ${plan.length} to rename (of ${rows.length} total) ===`);
  for (const p of plan) console.log(`  ${p.oldNumber} -> ${p.newNumber}`);
  if (!APPLY) return;

  for (const p of plan) {
    await updatePostgres(p.id, p.newNumber);
  }

  // Full resync (not just this run's delta) so the Sheet ends up consistent with
  // Postgres even if a previous partial run already renamed some rows here.
  const freshRows = await findMany();
  await sheetTable.updateMany(freshRows.map((r) => ({ id: r.id, data: { [field]: r.number } })));
  console.log(`  Synced ${freshRows.length} rows to the Sheet.`);
}

async function main() {
  console.log(APPLY ? "APPLYING changes to Postgres + Google Sheets..." : "DRY RUN — pass --apply to write changes.");

  await migrate(
    "Purchase Orders",
    "PO",
    async () => (await prisma.purchaseOrder.findMany({ select: { id: true, poNumber: true, createdAt: true } })).map((r) => ({ id: r.id, createdAt: r.createdAt, number: r.poNumber })),
    (id, n) => prisma.purchaseOrder.update({ where: { id }, data: { poNumber: n } }),
    "poNumber",
    purchaseOrdersTable
  );

  await migrate(
    "Accounts Payable",
    "AP",
    async () => (await prisma.accountsPayable.findMany({ select: { id: true, apNumber: true, createdAt: true } })).map((r) => ({ id: r.id, createdAt: r.createdAt, number: r.apNumber })),
    (id, n) => prisma.accountsPayable.update({ where: { id }, data: { apNumber: n } }),
    "apNumber",
    accountsPayableTable
  );

  await migrate(
    "Goods Receipts",
    "GR",
    async () => (await prisma.goodsReceipt.findMany({ select: { id: true, grNumber: true, createdAt: true } })).map((r) => ({ id: r.id, createdAt: r.createdAt, number: r.grNumber })),
    (id, n) => prisma.goodsReceipt.update({ where: { id }, data: { grNumber: n } }),
    "grNumber",
    goodsReceiptsTable
  );

  await migrate(
    "Payment Preps",
    "PP",
    async () => (await prisma.paymentPrep.findMany({ select: { id: true, prepNumber: true, createdAt: true } })).map((r) => ({ id: r.id, createdAt: r.createdAt, number: r.prepNumber })),
    (id, n) => prisma.paymentPrep.update({ where: { id }, data: { prepNumber: n } }),
    "prepNumber",
    paymentPrepsTable
  );

  await migrate(
    "Payments",
    "PAY",
    async () => (await prisma.payment.findMany({ select: { id: true, paymentNumber: true, createdAt: true } })).map((r) => ({ id: r.id, createdAt: r.createdAt, number: r.paymentNumber })),
    (id, n) => prisma.payment.update({ where: { id }, data: { paymentNumber: n } }),
    "paymentNumber",
    paymentsTable
  );

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
