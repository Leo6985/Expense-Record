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
