"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getVendors(search?: string) {
  return prisma.vendor.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
            { taxId: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });
}

export async function getVendor(id: string) {
  return prisma.vendor.findUnique({ where: { id } });
}

export async function createVendor(data: {
  code: string;
  name: string;
  taxId?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  creditDays?: number;
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  bankAccountName?: string;
}) {
  const existing = await prisma.vendor.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`รหัสผู้ขาย ${data.code} มีในระบบแล้ว`);

  const vendor = await prisma.vendor.create({ data });

  revalidatePath("/vendors");
  return vendor;
}

export async function updateVendor(
  id: string,
  data: {
    code?: string;
    name?: string;
    taxId?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    creditDays?: number;
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
    isActive?: boolean;
  }
) {
  if (data.code) {
    const existing = await prisma.vendor.findFirst({ where: { code: data.code, NOT: { id } } });
    if (existing) throw new Error(`รหัสผู้ขาย ${data.code} มีในระบบแล้ว`);
  }

  const vendor = await prisma.vendor.update({ where: { id }, data });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  return vendor;
}

export async function deleteVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true, accountsPayable: true } } },
  });
  if (!vendor) return;

  if (vendor._count.purchaseOrders > 0 || vendor._count.accountsPayable > 0) {
    throw new Error(
      `ไม่สามารถลบผู้ขาย "${vendor.name}" ได้ เนื่องจากมีใบสั่งซื้อหรือใบตั้งหนี้ผูกอยู่ กรุณาปิดใช้งานแทน`
    );
  }

  await prisma.vendor.delete({ where: { id } });

  revalidatePath("/vendors");
}

export async function importVendorsCSV(
  rows: {
    code: string;
    name: string;
    taxId?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    creditDays?: number;
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankAccountName?: string;
  }[]
) {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.code || !row.name) {
      errors.push(`เนเธ–เธง "${row.code || "?"}" : เธ•เนเธญเธเธกเธตเธฃเธซเธฑเธชเนเธฅเธฐเธเธทเนเธญเธเธนเนเธเธฒเธข`);
      continue;
    }
    try {
      const existing = await prisma.vendor.findUnique({ where: { code: row.code } });
      if (existing) {
        await prisma.vendor.update({
          where: { code: row.code },
          data: {
            name: row.name,
            taxId: row.taxId || null,
            address: row.address || null,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            creditDays: row.creditDays ?? existing.creditDays,
            bankName: row.bankName || null,
            bankBranch: row.bankBranch || null,
            bankAccountNo: row.bankAccountNo || null,
            bankAccountName: row.bankAccountName || null,
          },
        });
        updated++;
      } else {
        await prisma.vendor.create({
          data: {
            code: row.code,
            name: row.name,
            taxId: row.taxId || null,
            address: row.address || null,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            creditDays: row.creditDays ?? 30,
            bankName: row.bankName || null,
            bankBranch: row.bankBranch || null,
            bankAccountNo: row.bankAccountNo || null,
            bankAccountName: row.bankAccountName || null,
          },
        });
        created++;
      }
    } catch {
      errors.push(`เธฃเธซเธฑเธช ${row.code}: เธเธฑเธเธ—เธถเธเนเธกเนเธชเธณเน€เธฃเนเธ`);
    }
  }


  revalidatePath("/vendors");
  return { created, updated, errors };
}

export async function getNextVendorCode() {
  const lastVendor = await prisma.vendor.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  if (!lastVendor) return "V00001";
  const num = parseInt(lastVendor.code.replace("V", "")) + 1;
  return `V${String(num).padStart(5, "0")}`;
}
