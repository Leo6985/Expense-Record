// Pure helper shared between actions/sales-invoices.ts and actions/receipts.ts. Kept out of
// either "use server" file because Next.js requires every export of a "use server" module to
// be an async function (they're treated as server action endpoints), and this is a plain
// synchronous calculation with no DB access.

// An invoice's settleable total isn't always its original totalAmount — an APPROVED debit
// note raises it (e.g. a billed correction) and an APPROVED credit note lowers it (e.g. a
// return/discount), even for an invoice that's already RECEIVED. DRAFT/CANCELLED notes don't
// count yet. Used everywhere "how much can still be settled against this invoice" is computed.
export function getEffectiveInvoiceTotal(invoice: {
  totalAmount: number;
  debitCreditNotes: { type: string; totalAmount: number; status: string }[];
}): number {
  const adjustment = invoice.debitCreditNotes
    .filter((n) => n.status === "APPROVED")
    .reduce((s, n) => s + (n.type === "DEBIT" ? n.totalAmount : -n.totalAmount), 0);
  return Math.round((invoice.totalAmount + adjustment) * 100) / 100;
}
