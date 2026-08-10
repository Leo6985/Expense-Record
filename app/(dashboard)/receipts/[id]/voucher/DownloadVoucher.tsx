"use client";

import { useEffect, useState } from "react";
import { exportReceiptVoucherPDF, type ReceiptVoucherData } from "@/lib/pdf";

export default function DownloadVoucher({ data }: { data: ReceiptVoucherData }) {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    exportReceiptVoucherPDF(data);
    setDownloaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="text-4xl mb-3">🧾</div>
      <div className="text-gray-800 font-medium mb-1">
        {downloaded ? "ดาวน์โหลดใบสำคัญรับแล้ว" : "กำลังสร้างไฟล์..."}
      </div>
      <div className="text-sm text-gray-500 mb-4">
        ตรวจสอบไฟล์ RV_{data.receiptNumber}.pdf ในโฟลเดอร์ดาวน์โหลดของคุณ
      </div>
      <button
        onClick={() => exportReceiptVoucherPDF(data)}
        className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
      >
        ดาวน์โหลดอีกครั้ง
      </button>
    </div>
  );
}
