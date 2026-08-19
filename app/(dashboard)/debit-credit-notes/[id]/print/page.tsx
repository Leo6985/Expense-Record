import { getDebitCreditNote } from "@/actions/debit-credit-notes";
import { notFound } from "next/navigation";
import DownloadNote from "./DownloadNote";
import type { DebitCreditNoteData } from "@/lib/pdf";

export default async function DebitCreditNotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getDebitCreditNote(id);
  if (!note) notFound();

  const data: DebitCreditNoteData = {
    noteNumber: note.noteNumber,
    type: note.type as "DEBIT" | "CREDIT",
    noteDate: note.noteDate,
    reason: note.reason,
    notes: note.notes,
    createdByName: note.createdByName,
    approvedByName: note.approvedByName,
    approvedAt: note.approvedAt,
    createdAt: note.createdAt,
    amount: note.amount,
    vatAmount: note.vatAmount,
    totalAmount: note.totalAmount,
    customer: {
      name: note.invoice.customer.name,
      address: note.invoice.customer.address,
      taxId: note.invoice.customer.taxId,
    },
    invoice: {
      invoiceNumber: note.invoice.invoiceNumber,
      invoiceDate: note.invoice.invoiceDate,
    },
  };

  return <DownloadNote note={data} />;
}
