import { prisma } from "../lib/prisma";
import {
  purchaseOrdersTable, poItemsTable, goodsReceiptsTable, goodsReceiptItemsTable,
  accountsPayableTable, paymentPrepsTable, paymentPrepItemsTable, paymentsTable,
} from "../lib/sheets-tables";
import { copyMissingToSheet, verifyAgainstSheet } from "../lib/sheets-migrate-helper";

process.loadEnvFile(".env.local");

async function main() {
  const pos = await prisma.purchaseOrder.findMany({ orderBy: { createdAt: "asc" } });
  const poItems = await prisma.pOItem.findMany();
  const grs = await prisma.goodsReceipt.findMany({ orderBy: { createdAt: "asc" } });
  const grItems = await prisma.goodsReceiptItem.findMany();
  const aps = await prisma.accountsPayable.findMany({ orderBy: { createdAt: "asc" } });
  const preps = await prisma.paymentPrep.findMany({ orderBy: { createdAt: "asc" } });
  const prepItems = await prisma.paymentPrepItem.findMany();
  const payments = await prisma.payment.findMany({ orderBy: { createdAt: "asc" } });

  console.log(
    `พบใน Postgres: PurchaseOrder ${pos.length}, POItem ${poItems.length}, GoodsReceipt ${grs.length}, ` +
    `GoodsReceiptItem ${grItems.length}, AccountsPayable ${aps.length}, PaymentPrep ${preps.length}, ` +
    `PaymentPrepItem ${prepItems.length}, Payment ${payments.length}\n`
  );

  let ok = true;
  ok = (await copyMissingToSheet("PurchaseOrder", pos, purchaseOrdersTable)) && ok;
  ok = (await copyMissingToSheet("POItem", poItems, poItemsTable)) && ok;
  ok = (await copyMissingToSheet("GoodsReceipt", grs, goodsReceiptsTable)) && ok;
  ok = (await copyMissingToSheet("GoodsReceiptItem", grItems, goodsReceiptItemsTable)) && ok;
  ok = (await copyMissingToSheet("AccountsPayable", aps, accountsPayableTable)) && ok;
  ok = (await copyMissingToSheet("PaymentPrep", preps, paymentPrepsTable)) && ok;
  ok = (await copyMissingToSheet("PaymentPrepItem", prepItems, paymentPrepItemsTable)) && ok;
  ok = (await copyMissingToSheet("Payment", payments, paymentsTable)) && ok;

  console.log("\n--- ตรวจสอบข้อมูลทุกฟิลด์ ---");
  ok = (await verifyAgainstSheet("PurchaseOrder", pos, purchaseOrdersTable, [
    "poNumber", "prNumber", "vendorId", "status", "totalAmount", "vatRate", "vatAmount", "notes",
  ])) && ok;
  ok = (await verifyAgainstSheet("POItem", poItems, poItemsTable, [
    "poId", "productId", "description", "quantity", "unit", "unitPrice", "totalPrice",
  ])) && ok;
  ok = (await verifyAgainstSheet("GoodsReceipt", grs, goodsReceiptsTable, [
    "grNumber", "poId", "receivedBy", "notes",
  ])) && ok;
  ok = (await verifyAgainstSheet("GoodsReceiptItem", grItems, goodsReceiptItemsTable, [
    "grId", "poItemId", "quantity", "unitPrice", "totalPrice",
  ])) && ok;
  ok = (await verifyAgainstSheet("AccountsPayable", aps, accountsPayableTable, [
    "apNumber", "vendorId", "poId", "grId", "invoiceNumber", "amount", "vatAmount", "totalAmount", "status", "notes",
  ])) && ok;
  ok = (await verifyAgainstSheet("PaymentPrep", preps, paymentPrepsTable, [
    "prepNumber", "totalAmount", "totalWithholdingTax", "netPayableAmount", "status", "notes",
  ])) && ok;
  ok = (await verifyAgainstSheet("PaymentPrepItem", prepItems, paymentPrepItemsTable, [
    "prepId", "apId", "amount", "withholdingTaxRate", "withholdingTaxAmount", "netAmount",
  ])) && ok;
  ok = (await verifyAgainstSheet("Payment", payments, paymentsTable, [
    "paymentNumber", "prepId", "paymentMethod", "companyBankAccountId", "amount", "referenceNumber", "notes",
  ])) && ok;

  if (!ok) {
    console.error("\n❌ พบปัญหา — ตรวจสอบก่อนใช้งานต่อ (ข้อมูลใน Postgres ไม่ถูกแก้ไขใดๆ ทั้งสิ้น)");
    process.exitCode = 1;
  } else {
    console.log("\n✅ ทุกอย่างตรงกัน — Postgres ไม่ถูกแก้ไขหรือลบใดๆ ทั้งสิ้น");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
