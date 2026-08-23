import { prisma } from "./prisma";
import { salesInvoicesTable, SalesInvoiceRecord } from "./sheets-tables";

// Pure computation helper shared by every place that needs a sales invoice's due date — CSV
// import and the customer-credit-change recompute below (actions/*.ts can't share a plain
// function between "use server" files directly since Next.js requires every export of a
// "use server" module to itself be an async server action). Falls back to 30 days when the
// customer has no credit data set; this fallback is display-only and doesn't imply the
// customer's credit terms are actually known (the sales-invoices/customers UI separately
// flags that as missing).
export function computeDueDate(invoiceDate: Date, creditDays: number | null): Date {
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + (creditDays ?? 30));
  return due;
}

/**
 * Recomputes and persists dueDate for every non-CANCELLED invoice belonging to a customer,
 * using that customer's *current* creditDays. Must be called from every place a customer's
 * credit terms can change (single edit form AND CSV import) so existing invoices don't keep
 * showing a stale or 30-day-fallback due date. Also dual-writes each updated invoice to the
 * Google Sheets mirror, same pattern as every other write in this app.
 */
export async function recomputeCustomerInvoiceDueDates(customerId: string, creditDays: number | null): Promise<string[]> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { customerId, status: { not: "CANCELLED" } },
  });
  if (invoices.length === 0) return [];

  const updated = await Promise.all(
    invoices.map((inv) =>
      prisma.salesInvoice.update({
        where: { id: inv.id },
        data: { dueDate: computeDueDate(inv.invoiceDate, creditDays) },
      })
    )
  );

  // One read + one batched write for the whole set, not a per-row loop — looping individual
  // .update()/.create() calls here hits the Sheets API's 60-reads/min quota fast once a
  // customer has more than a couple dozen invoices (each call re-reads the whole tab first).
  try {
    await salesInvoicesTable.updateMany(updated.map((invoice) => ({ id: invoice.id, data: invoice as Partial<SalesInvoiceRecord> })));
  } catch (err) {
    console.error("salesInvoicesTable.updateMany failed during recomputeCustomerInvoiceDueDates:", err);
  }

  return updated.map((i) => i.id);
}
