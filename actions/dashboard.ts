"use server";

import { prisma } from "@/lib/prisma";
import { CashFlowMonth } from "@/components/CashFlowChart";

const THAI_MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// เงินสดเข้า/ออกจริง (ไม่ใช่ยอดรับรู้ตามบัญชี) จากใบรับชำระและการจ่ายเงินตลอดปีที่เลือก — ใช้ข้อมูล
// ดิบจากเอกสารรับ/จ่ายเงินโดยตรง ไม่ผ่าน buildLedger() (ซึ่งหนักเกินไปสำหรับกราฟหน้าหลักที่โหลด
// ทุกครั้ง) ให้ผลเป็น "เงินสดที่เคลื่อนไหวจริง" รายเดือน ตรงกับความหมายของ "กระแสเงินสด"
export async function getMonthlyCashFlowByYear(year: number): Promise<CashFlowMonth[]> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [receipts, payments] = await Promise.all([
    prisma.receipt.findMany({
      where: { status: { not: "CANCELLED" }, receiptDate: { gte: yearStart, lt: yearEnd } },
      select: { receiptDate: true, actualReceivedAmount: true },
    }),
    prisma.payment.findMany({
      where: { paymentDate: { gte: yearStart, lt: yearEnd } },
      select: { paymentDate: true, amount: true },
    }),
  ]);

  const buckets = THAI_MONTH_SHORT.map((label) => ({ label, cashIn: 0, cashOut: 0 }));

  for (const r of receipts) buckets[r.receiptDate.getUTCMonth()].cashIn += r.actualReceivedAmount;
  for (const p of payments) buckets[p.paymentDate.getUTCMonth()].cashOut += p.amount;

  return buckets.map((b) => ({
    label: b.label,
    cashIn: Math.round(b.cashIn * 100) / 100,
    cashOut: Math.round(b.cashOut * 100) / 100,
    net: Math.round((b.cashIn - b.cashOut) * 100) / 100,
  }));
}

// ปีที่มีข้อมูลรับ/จ่ายเงินจริง (เรียงใหม่ไปเก่า) + ปีปัจจุบันเสมอ แม้ยังไม่มีรายการ — ใช้เติม
// ตัวเลือกใน filter ปีของกราฟกระแสเงินสด
export async function getCashFlowYearOptions(): Promise<number[]> {
  const [firstReceipt, firstPayment] = await Promise.all([
    prisma.receipt.findFirst({ orderBy: { receiptDate: "asc" }, select: { receiptDate: true } }),
    prisma.payment.findFirst({ orderBy: { paymentDate: "asc" }, select: { paymentDate: true } }),
  ]);

  const currentYear = new Date().getUTCFullYear();
  const earliestYear = Math.min(
    currentYear,
    firstReceipt?.receiptDate.getUTCFullYear() ?? currentYear,
    firstPayment?.paymentDate.getUTCFullYear() ?? currentYear
  );

  const years: number[] = [];
  for (let y = currentYear; y >= earliestYear; y--) years.push(y);
  return years;
}
