// บัญชีแยกประเภท / งบทดลอง — โครงสร้างข้อมูลและตัวช่วยล้วน (pure, ไม่ใช่ "use server")
//
// ระบบเอกสารเดิม (PO/GR/AP/จ่ายเงิน/ขาย/รับเงิน) ไม่ได้บันทึกคู่บัญชีเดบิต-เครดิตไว้ จึงต้อง
// "สังเคราะห์" รายการบัญชีจากเอกสารต้นทางแต่ละใบตามกติกาที่กำหนดไว้ที่นี่ แล้วให้ actions/ledger.ts
// นำไปรวมเป็นบัญชีแยกประเภทและงบทดลอง. บัญชีคุมยอด (ลูกหนี้/เจ้าหนี้/ภาษี/ธนาคาร ฯลฯ) ไม่มีใน
// เอกสารเดิม ผู้ใช้ต้องผูกรหัสบัญชีเองในหน้า /accounting-config (โมเดล AccountingConfig).

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const LEDGER_TOLERANCE = 0.01;

// key ของบัญชีคุมยอดที่ต้องตั้งค่า + ชื่อไทยสำหรับแสดงผล และประเภทบัญชีที่แนะนำ
export type ConfigKey =
  | "ar"
  | "revenue"
  | "vat_output"
  | "ap"
  | "vat_input"
  | "wht_receivable"
  | "wht_payable"
  | "bank_fee"
  | "receipt_variance"
  | "ap_suspense"
  | "imbalance"
  | "bank_default";

export const CONFIG_KEY_META: Record<
  ConfigKey,
  { label: string; hint: string; suggestType: string }
> = {
  ar:               { label: "ลูกหนี้การค้า",                     hint: "ใช้ตอนออกใบกำกับภาษีขาย / รับชำระ",            suggestType: "ASSET" },
  revenue:          { label: "รายได้จากการขายและบริการ",          hint: "ยอดขายก่อน VAT จากใบกำกับภาษีขาย",             suggestType: "REVENUE" },
  vat_output:       { label: "ภาษีขาย (ภาษีมูลค่าเพิ่ม)",         hint: "VAT ฝั่งขาย",                                  suggestType: "LIABILITY" },
  ap:               { label: "เจ้าหนี้การค้า",                    hint: "ใช้ตอนตั้งหนี้ (AP) / จ่ายเงิน",               suggestType: "LIABILITY" },
  vat_input:        { label: "ภาษีซื้อ (ภาษีมูลค่าเพิ่ม)",        hint: "VAT ฝั่งซื้อ จากการตั้งหนี้",                  suggestType: "ASSET" },
  wht_receivable:   { label: "ภาษีเงินได้ถูกหัก ณ ที่จ่าย",       hint: "ยอดที่ลูกค้าหักตอนรับชำระ (สินทรัพย์)",        suggestType: "ASSET" },
  wht_payable:      { label: "ภาษีหัก ณ ที่จ่าย ค้างนำส่ง",       hint: "ยอดที่บริษัทหักผู้ขายตอนจ่ายเงิน (หนี้สิน)",  suggestType: "LIABILITY" },
  bank_fee:         { label: "ค่าธรรมเนียมธนาคาร",                hint: "ค่าธรรมเนียมจากเอกสารรับชำระ",                 suggestType: "EXPENSE" },
  receipt_variance: { label: "ผลต่างรับชำระ (เงินขาด/เกิน)",      hint: "เงินขาด/เกินจากเอกสารรับชำระ",                 suggestType: "EXPENSE" },
  ap_suspense:      { label: "ค่าใช้จ่ายรอปันส่วน (พัก)",         hint: "ปลายทางของ AP ที่ไม่มีหมวดบัญชี/สาย GR",       suggestType: "EXPENSE" },
  imbalance:        { label: "ผลต่างจากเอกสารไม่สมดุล",           hint: "ปลายทางเมื่อยอดในเอกสารไม่ลงตัว (ควรเป็น 0)", suggestType: "EXPENSE" },
  bank_default:     { label: "เงินฝากธนาคาร (ค่าเริ่มต้น)",       hint: "ใช้เมื่อบัญชีบริษัทนั้นยังไม่ได้ผูกบัญชีแยก",  suggestType: "ASSET" },
};

export const CONFIG_KEYS = Object.keys(CONFIG_KEY_META) as ConfigKey[];

export const bankConfigKey = (companyBankAccountId: string) => `bank:${companyBankAccountId}`;

export type LedgerSourceType = "JV" | "SI" | "DCN" | "RC" | "PAY" | "AP";

export const SOURCE_TYPE_LABEL: Record<LedgerSourceType, string> = {
  JV:  "สมุดรายวันทั่วไป",
  SI:  "ใบกำกับภาษีขาย",
  DCN: "ใบเพิ่ม/ลดหนี้",
  RC:  "รับชำระ",
  PAY: "จ่ายเงิน",
  AP:  "ตั้งหนี้",
};

// รายการบัญชีดิบ 1 บรรทัด (ยังไม่ผูกชื่อบัญชี). accountId อาจเป็น sentinel "__unset__:<key>"
// เมื่อ key ของบัญชีคุมยอดยังไม่ได้ตั้งค่า — actions/ledger.ts จะแปลงเป็นแถว "ยังไม่ได้ตั้งค่า"
export type RawLedgerEntry = {
  date: Date;
  accountId: string;
  debit: number;
  credit: number;
  sourceType: LedgerSourceType;
  sourceId: string;
  sourceNumber: string;
  description: string;
  // ป้ายชื่อ "สมุดรายวัน" ที่รายการนี้ผ่าน — ใช้กับใบสำคัญที่สร้างอัตโนมัติจากสมุดรายวันย่อย
  // (ขาย/ซื้อ/รับเงิน/จ่ายเงิน). ถ้าไม่มีให้ใช้ SOURCE_TYPE_LABEL[sourceType] แทน
  bookLabel?: string;
  // ลิงก์ + ป้ายของ "เอกสารต้นทาง" (นอกเหนือจากลิงก์ใบสำคัญ) เช่น ใบกำกับภาษีขาย/ใบตั้งหนี้
  originHref?: string;
  originLabel?: string;
};

// ชื่อสมุดรายวันย่อยตาม sourceType ของ JournalVoucher ที่สร้างอัตโนมัติ
export const AUTO_VOUCHER_BOOK_LABEL: Record<string, string> = {
  SI: "สมุดรายวันขาย",
  AP: "สมุดรายวันซื้อ",
  RC: "สมุดรายวันรับเงิน",
  PAY: "สมุดรายวันจ่ายเงิน",
};

// เอกสารต้นทางของใบสำคัญที่สร้างอัตโนมัติ — ลิงก์ + ป้าย (null ถ้าไม่รู้จัก sourceType)
export function autoVoucherOrigin(
  sourceType: string,
  sourceId: string
): { label: string; href: string } | null {
  switch (sourceType) {
    case "SI":  return { label: "ใบกำกับภาษีขาย", href: `/sales-invoices/${sourceId}` };
    case "AP":  return { label: "ใบตั้งหนี้", href: `/accounts-payable/${sourceId}` };
    case "RC":  return { label: "ใบรับชำระ", href: `/receipts/${sourceId}` };
    case "PAY": return { label: "การจ่ายเงิน", href: `/payments/${sourceId}` };
    default:    return null;
  }
}

export const UNSET_PREFIX = "__unset__:";
export const isUnsetAccountId = (id: string) => id.startsWith(UNSET_PREFIX);
export const unsetKeyOf = (id: string) => id.slice(UNSET_PREFIX.length);

// ตัวสะสมรายการของ "หนึ่งเอกสาร" — เพิ่มบรรทัดแล้วปิดท้ายด้วย balance() เพื่อดันผลต่าง (ถ้ามี)
// ลงบัญชีปลายทางที่กำหนด ทำให้ทุกเอกสารเดบิตรวม = เครดิตรวมเสมอ
export class DocEntries {
  private rows: Array<{ accountId: string; debit: number; credit: number }> = [];

  constructor(
    private readonly base: {
      date: Date;
      sourceType: LedgerSourceType;
      sourceId: string;
      sourceNumber: string;
      description: string;
      bookLabel?: string;
      originHref?: string;
      originLabel?: string;
    }
  ) {}

  debit(accountId: string | null, key: ConfigKey | string, amount: number) {
    this.add(accountId, key, amount, 0);
  }

  credit(accountId: string | null, key: ConfigKey | string, amount: number) {
    this.add(accountId, key, 0, amount);
  }

  private add(accountId: string | null, key: string, debit: number, credit: number) {
    const d = round2(debit);
    const c = round2(credit);
    if (d === 0 && c === 0) return;
    this.rows.push({ accountId: accountId ?? `${UNSET_PREFIX}${key}`, debit: d, credit: c });
  }

  // ปิดเอกสาร: ดันผลต่างเดบิต-เครดิตลง fallback แล้วคืนรายการทั้งหมด
  balance(fallbackAccountId: string | null, fallbackKey: ConfigKey): RawLedgerEntry[] {
    const totalDebit = round2(this.rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(this.rows.reduce((s, r) => s + r.credit, 0));
    const diff = round2(totalDebit - totalCredit);
    if (Math.abs(diff) > 0.0001) {
      if (diff > 0) this.add(fallbackAccountId, fallbackKey, 0, diff);
      else this.add(fallbackAccountId, fallbackKey, -diff, 0);
    }
    return this.rows.map((r) => ({
      date: this.base.date,
      accountId: r.accountId,
      debit: r.debit,
      credit: r.credit,
      sourceType: this.base.sourceType,
      sourceId: this.base.sourceId,
      sourceNumber: this.base.sourceNumber,
      description: this.base.description,
      bookLabel: this.base.bookLabel,
      originHref: this.base.originHref,
      originLabel: this.base.originLabel,
    }));
  }
}

export function sourceHref(type: LedgerSourceType, id: string): string {
  switch (type) {
    case "JV":  return `/journal-vouchers/${id}`;
    case "SI":  return `/sales-invoices/${id}`;
    case "DCN": return `/debit-credit-notes/${id}`;
    case "RC":  return `/receipts/${id}`;
    case "PAY": return `/payments/${id}`;
    case "AP":  return `/accounts-payable/${id}`;
  }
}
