"use server";

import { prisma } from "@/lib/prisma";
import { customersTable, CustomerRecord } from "@/lib/sheets-tables";
import { revalidatePath } from "next/cache";

/**
 * Postgres remains authoritative (SalesInvoice.customerId still holds a real FK to
 * Customer.id there), so every write dual-writes into the Google Sheet as a synced mirror.
 * If the Sheet side fails, the Postgres write already succeeded — surface the sync failure
 * instead of silently losing it, but don't roll back the Postgres write.
 */
async function syncCustomerToSheet(customer: {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditDays: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const record: CustomerRecord = { ...customer };
  try {
    await customersTable.update(customer.id, record);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไม่พบข้อมูล")) {
      await customersTable.create(record);
    } else {
      throw err;
    }
  }
}

export async function getCustomers(search?: string) {
  return prisma.customer.findMany({
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

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

export async function createCustomer(data: {
  code: string;
  name: string;
  taxId?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  creditDays?: number | null;
}) {
  const existing = await prisma.customer.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`รหัสลูกค้า ${data.code} มีในระบบแล้ว`);

  const customer = await prisma.customer.create({ data });
  try {
    await syncCustomerToSheet(customer);
  } catch (err) {
    console.error("syncCustomerToSheet failed after createCustomer:", err);
  }

  revalidatePath("/customers");
  return customer;
}

export async function updateCustomer(
  id: string,
  data: {
    code?: string;
    name?: string;
    taxId?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    creditDays?: number | null;
    isActive?: boolean;
  }
) {
  if (data.code) {
    const existing = await prisma.customer.findFirst({ where: { code: data.code, NOT: { id } } });
    if (existing) throw new Error(`รหัสลูกค้า ${data.code} มีในระบบแล้ว`);
  }

  const customer = await prisma.customer.update({ where: { id }, data });
  try {
    await syncCustomerToSheet(customer);
  } catch (err) {
    console.error("syncCustomerToSheet failed after updateCustomer:", err);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return customer;
}

export async function deleteCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { salesInvoices: true } } },
  });
  if (!customer) return;

  if (customer._count.salesInvoices > 0) {
    throw new Error(
      `ไม่สามารถลบลูกค้า "${customer.name}" ได้ เนื่องจากมีใบกำกับภาษีขายผูกอยู่ กรุณาปิดใช้งานแทน`
    );
  }

  await prisma.customer.delete({ where: { id } });
  await customersTable.delete(id);

  revalidatePath("/customers");
}

export async function importCustomersCSV(
  rows: {
    code: string;
    name: string;
    taxId?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    creditDays?: number;
  }[]
) {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const toCreateInSheet: CustomerRecord[] = [];
  const toUpdateInSheet: { id: string; data: Partial<CustomerRecord> }[] = [];

  for (const row of rows) {
    if (!row.code || !row.name) {
      errors.push(`แถว "${row.code || "?"}" : ต้องมีรหัสและชื่อลูกค้า`);
      continue;
    }
    try {
      const existing = await prisma.customer.findUnique({ where: { code: row.code } });
      if (existing) {
        const data = {
          name: row.name,
          taxId: row.taxId || null,
          address: row.address || null,
          contactPerson: row.contactPerson || null,
          phone: row.phone || null,
          email: row.email || null,
          creditDays: row.creditDays ?? existing.creditDays,
        };
        await prisma.customer.update({ where: { code: row.code }, data });
        updated++;
        toUpdateInSheet.push({ id: existing.id, data });
      } else {
        const customer = await prisma.customer.create({
          data: {
            code: row.code,
            name: row.name,
            taxId: row.taxId || null,
            address: row.address || null,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            creditDays: row.creditDays ?? 30,
          },
        });
        created++;
        toCreateInSheet.push(customer);
      }
    } catch {
      errors.push(`รหัส ${row.code}: บันทึกไม่สำเร็จ`);
    }
  }

  try {
    if (toCreateInSheet.length > 0) await customersTable.createMany(toCreateInSheet);
    if (toUpdateInSheet.length > 0) await customersTable.updateMany(toUpdateInSheet);
  } catch (err) {
    errors.push(
      `ข้อมูลถูกบันทึกในระบบหลักแล้ว แต่ซิงค์เข้า Google Sheet ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  revalidatePath("/customers");
  return { created, updated, errors };
}

export async function getNextCustomerCode() {
  const lastCustomer = await prisma.customer.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  if (!lastCustomer) return "C00001";
  const num = parseInt(lastCustomer.code.replace("C", "")) + 1;
  return `C${String(num).padStart(5, "0")}`;
}

/**
 * Finds an existing customer by exact case-insensitive name match, or creates one with an
 * auto-generated code. Used by the sales-invoice CSV import, which only carries a customer
 * name (not a code), so uploads don't need the customer registered ahead of time.
 */
export async function findOrCreateCustomerByName(name: string) {
  const trimmed = name.trim();
  const existing = await prisma.customer.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return { customer: existing, created: false };

  const code = await getNextCustomerCode();
  // creditDays is intentionally omitted (left null) — a customer auto-created from a sales
  // invoice import has no known credit terms yet, so the sales-invoices page flags it as
  // missing credit data until someone fills it in on the customer edit page.
  const customer = await prisma.customer.create({ data: { code, name: trimmed } });
  try {
    await syncCustomerToSheet(customer);
  } catch (err) {
    console.error("syncCustomerToSheet failed after findOrCreateCustomerByName:", err);
  }
  return { customer, created: true };
}
