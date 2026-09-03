"use client";

import { useEffect, useState } from "react";
import { exportJournalVoucherPDF, type JournalVoucherData } from "@/lib/pdf";

export default function DownloadVoucher({ data }: { data: JournalVoucherData }) {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    exportJournalVoucherPDF(data);
    setDownloaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="text-4xl mb-3">🧾</div>
      <div className="text-gray-800 font-medium mb-1">
        {downloaded ? "ดาวน์โหลดใบสำคัญรายวันแล้ว" : "กำลังสร้างไฟล์..."}
      </div>
      <div className="text-sm text-gray-500 mb-4">
        ตรวจสอบไฟล์ {data.voucherNumber}.pdf ในโฟลเดอร์ดาวน์โหลดของคุณ
      </div>
      <button
        onClick={() => exportJournalVoucherPDF(data)}
        className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
      >
        ดาวน์โหลดอีกครั้ง
      </button>
    </div>
  );
}
