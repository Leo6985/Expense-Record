import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  // Owner / เจ้าของ — MANAGER level
  await prisma.user.upsert({
    where: { email: "owner@company.com" },
    update: { level: "MANAGER" },
    create: {
      name: "เจ้าของกิจการ",
      email: "owner@company.com",
      password: await hash("owner1234"),
      role: "OWNER",
      level: "MANAGER",
    },
  });

  // Purchasing manager
  await prisma.user.upsert({
    where: { email: "purchase.mgr@company.com" },
    update: {},
    create: {
      name: "ผู้จัดการจัดซื้อ",
      email: "purchase.mgr@company.com",
      password: await hash("mgr1234"),
      role: "PURCHASING",
      level: "MANAGER",
    },
  });

  // Purchasing / จัดซื้อ — EMPLOYEE level
  await prisma.user.upsert({
    where: { email: "purchase@company.com" },
    update: { level: "EMPLOYEE" },
    create: {
      name: "สมชาย จัดซื้อ",
      email: "purchase@company.com",
      password: await hash("purchase1234"),
      role: "PURCHASING",
      level: "EMPLOYEE",
    },
  });

  // Accounting manager
  await prisma.user.upsert({
    where: { email: "accounting.mgr@company.com" },
    update: {},
    create: {
      name: "ผู้จัดการบัญชี",
      email: "accounting.mgr@company.com",
      password: await hash("mgr1234"),
      role: "ACCOUNTING",
      level: "MANAGER",
    },
  });

  // Accounting / บัญชีและการเงิน — EMPLOYEE level
  await prisma.user.upsert({
    where: { email: "accounting@company.com" },
    update: { level: "EMPLOYEE" },
    create: {
      name: "สมหญิง บัญชี",
      email: "accounting@company.com",
      password: await hash("accounting1234"),
      role: "ACCOUNTING",
      level: "EMPLOYEE",
    },
  });

  // Migrate old admin → owner MANAGER
  await prisma.user.updateMany({
    where: { email: "admin@company.com" },
    data: { role: "OWNER", level: "MANAGER" },
  });

  // Company bank accounts
  const existingAccounts = await prisma.companyBankAccount.count();
  if (existingAccounts === 0) {
    await prisma.companyBankAccount.createMany({
      data: [
        {
          bankName: "ธนาคารกสิกรไทย",
          branch: "สาขาสีลม",
          accountNo: "123-4-56789-0",
          accountName: "บริษัท ตัวอย่าง จำกัด",
        },
        {
          bankName: "ธนาคารไทยพาณิชย์",
          branch: "สาขาอโศก",
          accountNo: "987-6-54321-0",
          accountName: "บริษัท ตัวอย่าง จำกัด",
        },
      ],
    });
  }

  console.log("Seed completed!");
  console.log("Users:");
  console.log("  เจ้าของ (MANAGER):           owner@company.com          / owner1234");
  console.log("  ผจก.จัดซื้อ (MANAGER):       purchase.mgr@company.com   / mgr1234");
  console.log("  พนักงานจัดซื้อ (EMPLOYEE):   purchase@company.com       / purchase1234");
  console.log("  ผจก.บัญชี (MANAGER):         accounting.mgr@company.com / mgr1234");
  console.log("  พนักงานบัญชี (EMPLOYEE):     accounting@company.com     / accounting1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
