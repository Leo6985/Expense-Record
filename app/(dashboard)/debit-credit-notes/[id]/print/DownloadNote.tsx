"use client";

import { useEffect, useState } from "react";
import { exportDebitCreditNotePDF, type DebitCreditNoteData } from "@/lib/pdf";

const TYPE_LABEL: Record<string, string> = { DEBIT: "ใบเพิ่มหนี้", CREDIT: "ใบลดหนี้" };

export default function DownloadNote({ note }: { note: DebitCreditNoteData }) {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    exportDebitCreditNotePDF(note);
    setDownloaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = TYPE_LABEL[note.type] ?? note.type;
  const fileName = `${note.type === "DEBIT" ? "DBN" : "CRN"}_${note.noteNumber}.pdf`;

  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="text-4xl mb-3">📝</div>
      <div className="text-gray-800 font-medium mb-1">
        {downloaded ? `ดาวน์โหลด${label}แล้ว` : "กำลังสร้างไฟล์..."}
      </div>
      <div className="text-sm text-gray-500 mb-4">ตรวจสอบไฟล์ {fileName} ในโฟลเดอร์ดาวน์โหลดของคุณ</div>
      <button
        onClick={() => exportDebitCreditNotePDF(note)}
        className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
      >
        ดาวน์โหลดอีกครั้ง
      </button>
    </div>
  );
}
