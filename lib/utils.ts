import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { th } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return format(new Date(date), "dd/MM/yyyy", { locale: th });
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "0.00";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function generateNumber(prefix: string, sequence: number): string {
  const year = new Date().getFullYear() + 543;
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const seq = String(sequence).padStart(5, "0");
  return `${prefix}${year}${month}${seq}`;
}

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// Converts a non-negative integer (< 6 digits per million-group) into Thai reading, e.g. 21 -> "ยี่สิบเอ็ด".
function digitsToThai(numStr: string): string {
  let result = "";
  const len = numStr.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(numStr[i]);
    if (digit === 0) continue;
    const place = len - i - 1;
    if (place === 0) {
      result += digit === 1 && len > 1 ? "เอ็ด" : THAI_DIGITS[digit];
    } else if (place === 1) {
      result += digit === 1 ? "สิบ" : digit === 2 ? "ยี่สิบ" : THAI_DIGITS[digit] + "สิบ";
    } else {
      result += THAI_DIGITS[digit] + THAI_PLACES[place];
    }
  }
  return result;
}

function integerToThai(n: number): string {
  if (n === 0) return "ศูนย์";
  const groups: number[] = [];
  let rem = n;
  while (rem > 0) {
    groups.unshift(rem % 1000000);
    rem = Math.floor(rem / 1000000);
  }
  return groups
    .map((g, idx) => (g === 0 ? "" : digitsToThai(String(g)) + (idx < groups.length - 1 ? "ล้าน" : "")))
    .join("");
}

/** Thai baht amount in words, e.g. 1250.5 -> "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์". Used on official tax documents. */
export function numberToThaiBahtText(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const intPart = Math.floor(rounded);
  const fracPart = Math.round((rounded - intPart) * 100);

  const bahtText = integerToThai(intPart) + "บาท";
  return fracPart > 0 ? bahtText + digitsToThai(String(fracPart)) + "สตางค์" : bahtText + "ถ้วน";
}
