"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDebitCreditNote, updateDebitCreditNote } from "@/actions/debit-credit-notes";
import NoteForm, { NoteFormInitial, NoteFormValues } from "../../NoteForm";
import Link from "next/link";
import PageLoading from "@/components/PageLoading";

type Note = Awaited<ReturnType<typeof getDebitCreditNote>>;

export default function EditDebitCreditNotePage() {
  const params = useParams();
  const router = useRouter();
  const [note, setNote] = useState<Note>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    getDebitCreditNote(params.id as string).then((data) => {
      setNote(data);
      if (!data || data.status !== "DRAFT") setLocked(true);
    });
  }, [params.id]);

  if (!note) return <PageLoading />;

  if (locked) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/debit-credit-notes/${note.id}`} className="text-gray-400 hover:text-gray-600">← กลับ</Link>
          <h1 className="text-2xl font-bold text-gray-900">แก้ไข {note.noteNumber}</h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          ไม่สามารถแก้ไขรายการนี้ได้ เนื่องจากอนุมัติแล้วหรือถูกยกเลิกไปแล้ว
        </div>
      </div>
    );
  }

  const initialValues: NoteFormInitial = {
    type: note.type as "DEBIT" | "CREDIT",
    invoice: note.invoice,
    noteDate: new Date(note.noteDate).toISOString().split("T")[0],
    amount: String(note.amount),
    vatAmount: String(note.vatAmount),
    reason: note.reason ?? "",
    detail: note.detail ?? "",
    notes: note.notes ?? "",
  };

  async function handleSubmit(values: NoteFormValues) {
    await updateDebitCreditNote(note!.id, values);
    router.push(`/debit-credit-notes/${note!.id}`);
  }

  return (
    <NoteForm
      title={`แก้ไข ${note.noteNumber}`}
      backHref={`/debit-credit-notes/${note.id}`}
      submitLabel="บันทึกการเปลี่ยนแปลง"
      savingLabel="กำลังบันทึก..."
      initialValues={initialValues}
      lockType
      lockInvoice
      onSubmit={handleSubmit}
    />
  );
}
