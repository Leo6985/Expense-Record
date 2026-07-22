// One-time repair: Google Sheets silently auto-detected purely-numeric-looking string
// values (e.g. a 13-digit tax ID) as Number-typed cells and later reformatted them for
// display (e.g. "1.05539E+11"), even though we wrote them with valueInputOption=RAW.
// lib/sheets.ts now forces plain-text storage (leading apostrophe + USER_ENTERED) for
// all future writes; this script rewrites every existing row from Postgres (the source
// of truth) so already-corrupted cells get fixed too. Postgres is read-only here.
import { prisma } from "../lib/prisma";
import {
  vendorsTable, chartOfAccountsTable, productsTable, companyBankAccountsTable, usersTable,
  purchaseOrdersTable, poItemsTable, goodsReceiptsTable, goodsReceiptItemsTable,
  accountsPayableTable, paymentPrepsTable, paymentPrepItemsTable, paymentsTable,
} from "../lib/sheets-tables";
import { SheetTable } from "../lib/sheets";

process.loadEnvFile(".env.local");

async function repairTable<T extends { id: string }>(name: string, rows: T[], table: SheetTable<T>) {
  if (rows.length === 0) {
    console.log(`[${name}] ไม่มีข้อมูล ข้าม`);
    return;
  }
  await table.updateMany(rows.map((r) => ({ id: r.id, data: r })));
  console.log(`[${name}] เขียนทับ ${rows.length} แถวเรียบร้อย`);
}

async function main() {
  await repairTable("Vendor", await prisma.vendor.findMany(), vendorsTable);
  await repairTable("ChartOfAccount", await prisma.chartOfAccount.findMany(), chartOfAccountsTable);
  await repairTable("Product", await prisma.product.findMany(), productsTable);
  await repairTable("CompanyBankAccount", await prisma.companyBankAccount.findMany(), companyBankAccountsTable);
  await repairTable("User", await prisma.user.findMany(), usersTable); // password field is ignored by the sheet's column list
  await repairTable("PurchaseOrder", await prisma.purchaseOrder.findMany(), purchaseOrdersTable);
  await repairTable("POItem", await prisma.pOItem.findMany(), poItemsTable);
  await repairTable("GoodsReceipt", await prisma.goodsReceipt.findMany(), goodsReceiptsTable);
  await repairTable("GoodsReceiptItem", await prisma.goodsReceiptItem.findMany(), goodsReceiptItemsTable);
  await repairTable("AccountsPayable", await prisma.accountsPayable.findMany(), accountsPayableTable);
  await repairTable("PaymentPrep", await prisma.paymentPrep.findMany(), paymentPrepsTable);
  await repairTable("PaymentPrepItem", await prisma.paymentPrepItem.findMany(), paymentPrepItemsTable);
  await repairTable("Payment", await prisma.payment.findMany(), paymentsTable);
  console.log("\n✅ ซ่อมแซมข้อมูลทั้งหมดเสร็จสิ้น — Postgres ไม่ถูกแก้ไขใดๆ ทั้งสิ้น");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
