/**
 * ตรวจว่าบัญชีแยกประเภทจะติดป้าย "สมุดรายวัน" ถูกต้องหลังอนุมัติใบสำคัญ — แบบไม่แตะฐานข้อมูล.
 *
 * ทดสอบทีละจุดของสายส่งค่า:
 *   1) AUTO_VOUCHER_BOOK_LABEL / autoVoucherOrigin  (ฟังก์ชันบริสุทธิ์)
 *   2) DocEntries.balance() ส่ง bookLabel/originHref/originLabel ต่อไปยังทุก RawLedgerEntry
 *   3) นิพจน์เดียวกับ getGeneralLedger:  sourceTypeLabel = bookLabel ?? SOURCE_TYPE_LABEL[sourceType]
 *   4) ข้อมูลจริง: ใบสำคัญที่ "ไม่มี sourceType" (สร้างเอง) ยังแสดง "สมุดรายวันทั่วไป" และไม่มี origin
 *
 * buildLedger step 1 ตั้ง bookLabel = v.sourceType ? AUTO_VOUCHER_BOOK_LABEL[v.sourceType] : undefined
 * (jvs query ดึง sourceType/sourceId, where status = APPROVED) — ข้อ 2+3 พิสูจน์ว่าค่าที่ตั้งตรงนั้น
 * จะไปถึงหน้าจอครบถ้วน.
 */
import { prisma } from "../lib/prisma";
import {
  DocEntries,
  AUTO_VOUCHER_BOOK_LABEL,
  autoVoucherOrigin,
  SOURCE_TYPE_LABEL,
  type LedgerSourceType,
} from "../lib/ledger";
import { getGeneralLedger } from "../actions/ledger";

let pass = true;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${detail ? `   —   ${detail}` : ""}`);
  if (!cond) pass = false;
};

// getGeneralLedger ใช้บรรทัดนี้เป๊ะ ๆ ในการเลือกป้าย
const glLabel = (e: { bookLabel?: string; sourceType: LedgerSourceType }) =>
  e.bookLabel ?? SOURCE_TYPE_LABEL[e.sourceType];

async function main() {
  console.log("=== 1) ฟังก์ชันบริสุทธิ์ ===");
  check("AUTO_VOUCHER_BOOK_LABEL.SI", AUTO_VOUCHER_BOOK_LABEL.SI === "สมุดรายวันขาย", AUTO_VOUCHER_BOOK_LABEL.SI);
  check("AUTO_VOUCHER_BOOK_LABEL.AP", AUTO_VOUCHER_BOOK_LABEL.AP === "สมุดรายวันซื้อ", AUTO_VOUCHER_BOOK_LABEL.AP);
  check("AUTO_VOUCHER_BOOK_LABEL.RC", AUTO_VOUCHER_BOOK_LABEL.RC === "สมุดรายวันรับเงิน", AUTO_VOUCHER_BOOK_LABEL.RC);
  check("AUTO_VOUCHER_BOOK_LABEL.PAY", AUTO_VOUCHER_BOOK_LABEL.PAY === "สมุดรายวันจ่ายเงิน", AUTO_VOUCHER_BOOK_LABEL.PAY);

  const originCases: [string, string, string, string][] = [
    ["SI", "abc", "ใบกำกับภาษีขาย", "/sales-invoices/abc"],
    ["AP", "abc", "ใบตั้งหนี้", "/accounts-payable/abc"],
    ["RC", "abc", "ใบรับชำระ", "/receipts/abc"],
    ["PAY", "abc", "การจ่ายเงิน", "/payments/abc"],
  ];
  for (const [st, id, label, href] of originCases) {
    const o = autoVoucherOrigin(st, id);
    check(`autoVoucherOrigin(${st})`, !!o && o.label === label && o.href === href, o ? `${o.label} · ${o.href}` : "null");
  }
  check("autoVoucherOrigin(unknown) = null", autoVoucherOrigin("XX", "abc") === null);

  console.log("\n=== 2) DocEntries.balance() ส่ง field ต่อครบ ===");
  {
    const doc = new DocEntries({
      date: new Date("2026-01-15"),
      sourceType: "JV",
      sourceId: "voucher-id-1",
      sourceNumber: "JV202601001",
      description: "ขาย — ลูกค้า ก (INV-1)",
      bookLabel: AUTO_VOUCHER_BOOK_LABEL.SI,
      originHref: "/sales-invoices/inv-1",
      originLabel: "ใบกำกับภาษีขาย",
    });
    doc.debit("acc-ar", "ar", 107);
    doc.credit("acc-rev", "revenue", 100);
    doc.credit("acc-vat", "vat_output", 7);
    const rows = doc.balance("acc-imb", "imbalance");
    check("ทุกบรรทัดมี bookLabel = สมุดรายวันขาย", rows.length > 0 && rows.every((r) => r.bookLabel === "สมุดรายวันขาย"), `${rows.length} บรรทัด`);
    check("ทุกบรรทัดมี originHref = /sales-invoices/inv-1", rows.every((r) => r.originHref === "/sales-invoices/inv-1"));
    check("ทุกบรรทัดมี originLabel = ใบกำกับภาษีขาย", rows.every((r) => r.originLabel === "ใบกำกับภาษีขาย"));
    check("sourceType ยังเป็น JV (href ชี้ตัวใบสำคัญ)", rows.every((r) => r.sourceType === "JV"));

    console.log("\n=== 3) นิพจน์เลือกป้ายของ getGeneralLedger ===");
    check('bookLabel มี -> sourceTypeLabel = "สมุดรายวันขาย"', glLabel(rows[0]) === "สมุดรายวันขาย", glLabel(rows[0]));

    const manual = new DocEntries({
      date: new Date("2026-01-15"),
      sourceType: "JV",
      sourceId: "v2",
      sourceNumber: "JV202601002",
      description: "ปรับปรุง",
    });
    manual.debit("a", "imbalance", 50);
    manual.credit("b", "imbalance", 50);
    const mrows = manual.balance("acc-imb", "imbalance");
    check('ไม่มี bookLabel -> sourceTypeLabel = "สมุดรายวันทั่วไป"', glLabel(mrows[0]) === "สมุดรายวันทั่วไป", glLabel(mrows[0]));
    check("ไม่มี bookLabel -> ไม่มี origin", mrows.every((r) => r.originHref === undefined && r.originLabel === undefined));
  }

  console.log("\n=== 4) ข้อมูลจริง — ใบสำคัญที่สร้างเอง (sourceType = null) ===");
  const manualVouchers = await prisma.journalVoucher.count({ where: { status: "APPROVED", sourceType: null } });
  const autoVouchers = await prisma.journalVoucher.count({ where: { status: "APPROVED", sourceType: { not: null } } });
  console.log(`  ใบสำคัญอนุมัติแล้ว: สร้างเอง ${manualVouchers} ใบ, จากสมุดรายวันย่อย ${autoVouchers} ใบ`);
  const from = "2000-01-01";
  const to = new Date().toISOString().slice(0, 10);
  const gl = await getGeneralLedger({ accountId: "ALL", from, to });
  const jvEntries = gl.blocks.flatMap((b) => b.entries).filter((e) => e.href.startsWith("/journal-vouchers/"));
  if (jvEntries.length === 0) {
    console.log("  (ไม่มีรายการจากใบสำคัญในช่วงนี้ — ข้ามการตรวจข้อมูลจริง)");
  } else {
    check(
      `รายการจากใบสำคัญสร้างเอง ${jvEntries.length} บรรทัด แสดง "สมุดรายวันทั่วไป" และไม่มี origin`,
      jvEntries.every((e) => e.sourceTypeLabel === "สมุดรายวันทั่วไป" && !e.originHref && !e.originLabel)
    );
  }
  if (autoVouchers > 0) {
    const autoEntries = gl.blocks
      .flatMap((b) => b.entries)
      .filter((e) => ["สมุดรายวันขาย", "สมุดรายวันซื้อ", "สมุดรายวันรับเงิน", "สมุดรายวันจ่ายเงิน"].includes(e.sourceTypeLabel));
    check(
      `รายการจากสมุดรายวันย่อย ${autoEntries.length} บรรทัด มี originHref ครบ`,
      autoEntries.length > 0 && autoEntries.every((e) => !!e.originHref && !!e.originLabel)
    );
  }

  await prisma.$disconnect();
  console.log(`\n${pass ? "✅ ผ่าน — บัญชีแยกประเภทติดป้ายสมุดรายวันถูกต้องหลังอนุมัติ voucher" : "❌ มีข้อไม่ผ่าน"}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
