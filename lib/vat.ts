// ตัวเลือกภาษีซื้อสำหรับใบรับสินค้า/ตั้งหนี้ — ใช้ร่วมกันในหลายฟอร์ม (goods-receipts, accounts-payable)
// "DEFERRED" (ภาษีซื้อไม่ถึงกำหนด) ยังคำนวณอัตรา 7% เท่ากับปกติ แต่ลงบัญชีคุมยอดคนละตัว
// (vat_input_deferred แทน vat_input) ดู lib/ledger.ts และ actions/ledger.ts

export type VatType = "NONE" | "STANDARD" | "DEFERRED";

export const VAT_RATE_BY_TYPE: Record<VatType, number> = {
  NONE: 0,
  STANDARD: 7,
  DEFERRED: 7,
};

export const VAT_TYPE_OPTIONS: { value: VatType; label: string }[] = [
  { value: "NONE", label: "0% (ไม่มี VAT)" },
  { value: "STANDARD", label: "7% (มาตรฐาน)" },
  { value: "DEFERRED", label: "7% (ภาษีซื้อไม่ถึงกำหนด)" },
];

export const VAT_TYPE_LABEL: Record<VatType, string> = {
  NONE: "ไม่มี VAT",
  STANDARD: "VAT มาตรฐาน",
  DEFERRED: "ภาษีซื้อไม่ถึงกำหนด",
};
