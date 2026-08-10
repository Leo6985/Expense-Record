"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createDebitCreditNote } from "@/actions/debit-credit-notes";
import NoteForm, { NoteFormValues } from "../NoteForm";

export default function NewDebitCreditNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const initialType = typeParam === "CREDIT" ? "CREDIT" : "DEBIT";

  async function handleSubmit(values: NoteFormValues) {
    const note = await createDebitCreditNote(values);
    router.push(`/debit-credit-notes/${note.id}`);
  }

  return (
    <NoteForm
      title="สร้างใบเพิ่ม/ลดหนี้"
      backHref="/debit-credit-notes"
      submitLabel="บันทึก"
      savingLabel="กำลังบันทึก..."
      initialType={initialType}
      onSubmit={handleSubmit}
    />
  );
}
