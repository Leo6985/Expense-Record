"use client";

import { useEffect, useState } from "react";
import { exportWHTCertificatePDF, type WHTCertificateData } from "@/lib/pdf";

export default function DownloadCertificate({
  paymentNumber,
  certs,
}: {
  paymentNumber: string;
  certs: WHTCertificateData[];
}) {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    exportWHTCertificatePDF(paymentNumber, certs);
    setDownloaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="text-4xl mb-3">🧾</div>
      <div className="text-gray-800 font-medium mb-1">
        {downloaded ? "ดาวน์โหลดหนังสือรับรองหัก ณ ที่จ่ายแล้ว" : "กำลังสร้างไฟล์..."}
      </div>
      <div className="text-sm text-gray-500 mb-4">
        ตรวจสอบไฟล์ WHT_{paymentNumber}.pdf ในโฟลเดอร์ดาวน์โหลดของคุณ
        {certs.length > 1 && ` (${certs.length} หน้า สำหรับผู้ขาย ${certs.length} ราย)`}
      </div>
      <button
        onClick={() => exportWHTCertificatePDF(paymentNumber, certs)}
        className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
      >
        ดาวน์โหลดอีกครั้ง
      </button>
    </div>
  );
}
