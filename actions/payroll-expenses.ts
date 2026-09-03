"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PAYROLL_EXPENSE_CODES } from "@/lib/payroll-expenses";
import { monthlyPayrollExpensesTable, MonthlyPayrollExpenseRecord } from "@/lib/sheets-tables";

export type PayrollExpenseRow = {
  accountId: string;
  code: string;
  name: string;
  months: number[]; // ความยาว 12 (ม.ค.–ธ.ค.)
};

export type PayrollExpensesResult = {
  year: number;
  rows: PayrollExpenseRow[];
  // รหัสผังบัญชีที่กำหนดไว้ในโครงสร้างแต่ยังไม่มีในระบบ (ควรไปเพิ่มที่หน้าผังบัญชีก่อน)
  missingCodes: string[];
};

function monthsFromRecord(rec: { [k: string]: unknown } | undefined): number[] {
  return Array.from({ length: 12 }, (_, i) => (rec ? Number(rec[`m${i + 1}`]) || 0 : 0));
}

export async function getPayrollExpenses(year: number): Promise<PayrollExpensesResult> {
  const accounts = await prisma.chartOfAccount.findMany({
    where: { code: { in: PAYROLL_EXPENSE_CODES } },
    select: { id: true, code: true, name: true },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const missingCodes = PAYROLL_EXPENSE_CODES.filter((c) => !byCode.has(c));

  const existing = await prisma.monthlyPayrollExpense.findMany({ where: { year } });
  const byAccountId = new Map(existing.map((e) => [e.accountId, e as unknown as { [k: string]: unknown }]));

  const rows: PayrollExpenseRow[] = [];
  for (const code of PAYROLL_EXPENSE_CODES) {
    const acc = byCode.get(code);
    if (!acc) continue;
    rows.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      months: monthsFromRecord(byAccountId.get(acc.id)),
    });
  }

  return { year, rows, missingCodes };
}

/**
 * บันทึกยอดค่าใช้จ่ายรายเดือนทั้ง 12 เดือนของปีที่เลือก (upsert ต่อ (ปี, ผังบัญชี)).
 * ไม่มีขั้นตอนอนุมัติ — กดบันทึกแล้วมีผลทันที และซิงค์เข้า Google Sheet เป็นสำเนา.
 */
export async function savePayrollExpenses(
  year: number,
  entries: { accountId: string; months: number[] }[]
): Promise<{ saved: number; sheetError?: string }> {
  // ยอมรับเฉพาะผังบัญชีที่อยู่ในโครงสร้างที่กำหนดไว้
  const allowed = new Set(
    (
      await prisma.chartOfAccount.findMany({
        where: { code: { in: PAYROLL_EXPENSE_CODES } },
        select: { id: true },
      })
    ).map((a) => a.id)
  );

  const saved: MonthlyPayrollExpenseRecord[] = [];
  for (const entry of entries) {
    if (!allowed.has(entry.accountId)) continue;
    const data: Record<string, number> = {};
    for (let i = 0; i < 12; i++) data[`m${i + 1}`] = Number(entry.months[i]) || 0;

    const rec = await prisma.monthlyPayrollExpense.upsert({
      where: { year_accountId: { year, accountId: entry.accountId } },
      update: data,
      create: { year, accountId: entry.accountId, ...data },
    });
    saved.push(rec as unknown as MonthlyPayrollExpenseRecord);
  }

  // ซิงค์เข้า Google Sheet แบบกลุ่ม (create/update ในคำขอเดียว) — Postgres เป็นฐานหลักอยู่แล้ว
  let sheetError: string | undefined;
  try {
    const sheetRows = await monthlyPayrollExpensesTable.findMany();
    const sheetIds = new Set(sheetRows.map((r) => r.id));
    const toCreate = saved.filter((r) => !sheetIds.has(r.id));
    const toUpdate = saved.filter((r) => sheetIds.has(r.id));
    if (toCreate.length > 0) await monthlyPayrollExpensesTable.createMany(toCreate);
    if (toUpdate.length > 0)
      await monthlyPayrollExpensesTable.updateMany(toUpdate.map((r) => ({ id: r.id, data: r })));
  } catch (err) {
    sheetError = err instanceof Error ? err.message : String(err);
    console.error("savePayrollExpenses: sync to Google Sheet failed:", err);
  }

  revalidatePath("/payroll-expenses");
  revalidatePath("/reports/profit-loss");

  return { saved: saved.length, sheetError };
}
