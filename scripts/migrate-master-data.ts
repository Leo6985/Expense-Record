import { prisma } from "../lib/prisma";
import {
  vendorsTable, chartOfAccountsTable, productsTable, companyBankAccountsTable, usersTable,
} from "../lib/sheets-tables";
import { copyMissingToSheet, verifyAgainstSheet } from "../lib/sheets-migrate-helper";

process.loadEnvFile(".env.local");

async function main() {
  const vendors = await prisma.vendor.findMany({ orderBy: { createdAt: "asc" } });
  const accounts = await prisma.chartOfAccount.findMany({ orderBy: { createdAt: "asc" } });
  const products = await prisma.product.findMany({ orderBy: { createdAt: "asc" } });
  const bankAccounts = await prisma.companyBankAccount.findMany({ orderBy: { createdAt: "asc" } });
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } }); // includes password — never written to the sheet (see lib/sheets-tables.ts UserRecord)

  console.log(
    `พบใน Postgres: Vendor ${vendors.length}, ChartOfAccount ${accounts.length}, Product ${products.length}, ` +
    `CompanyBankAccount ${bankAccounts.length}, User ${users.length}\n`
  );

  let ok = true;
  ok = (await copyMissingToSheet("Vendor", vendors, vendorsTable)) && ok;
  ok = (await copyMissingToSheet("ChartOfAccount", accounts, chartOfAccountsTable)) && ok;
  ok = (await copyMissingToSheet("Product", products, productsTable)) && ok;
  ok = (await copyMissingToSheet("CompanyBankAccount", bankAccounts, companyBankAccountsTable)) && ok;
  ok = (await copyMissingToSheet("User", users, usersTable)) && ok;

  console.log("\n--- ตรวจสอบข้อมูลทุกฟิลด์ ---");
  ok = (await verifyAgainstSheet("Vendor", vendors, vendorsTable, [
    "code", "name", "taxId", "address", "contactPerson", "phone", "email",
    "creditDays", "bankName", "bankBranch", "bankAccountNo", "bankAccountName", "isActive",
  ])) && ok;
  ok = (await verifyAgainstSheet("ChartOfAccount", accounts, chartOfAccountsTable, [
    "code", "name", "type", "isActive",
  ])) && ok;
  ok = (await verifyAgainstSheet("Product", products, productsTable, [
    "code", "name", "description", "unit", "accountId", "isActive",
  ])) && ok;
  ok = (await verifyAgainstSheet("CompanyBankAccount", bankAccounts, companyBankAccountsTable, [
    "bankName", "branch", "accountNo", "accountName", "isActive",
  ])) && ok;
  ok = (await verifyAgainstSheet("User", users, usersTable, [
    "name", "email", "role", "level", "isActive",
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
