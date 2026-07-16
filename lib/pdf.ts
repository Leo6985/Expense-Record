import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function addThaiFont(doc: jsPDF) {
  doc.setFont("helvetica");
}

function formatNum(n: number) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(n);
}

function formatDateStr(d: Date | string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear() + 543}`;
}

export function exportPurchaseOrderPDF(po: {
  poNumber: string;
  orderDate: Date | string;
  expectedDate?: Date | string | null;
  status: string;
  vendor: { name: string; address?: string | null; taxId?: string | null; phone?: string | null };
  items: { description: string; quantity: number; unit?: string | null; unitPrice: number; totalPrice: number }[];
  totalAmount: number;
  notes?: string | null;
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addThaiFont(doc);

  const margin = 15;
  let y = margin;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("PURCHASE ORDER", 105, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.text(`เลขที่: ${po.poNumber}`, 105, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`วันที่สั่งซื้อ: ${formatDateStr(po.orderDate)}`, margin, y);
  if (po.expectedDate) {
    doc.text(`วันที่รับของ: ${formatDateStr(po.expectedDate)}`, 105, y);
  }
  y += 6;

  doc.setDrawColor(200);
  doc.line(margin, y, 195, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("ผู้ขาย:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.vendor.name, margin + 20, y);
  y += 5;
  if (po.vendor.address) {
    doc.text(po.vendor.address, margin + 20, y);
    y += 5;
  }
  if (po.vendor.taxId) {
    doc.text(`เลขผู้เสียภาษี: ${po.vendor.taxId}`, margin + 20, y);
    y += 5;
  }
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["รายการ", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม"]],
    body: po.items.map((item) => [
      item.description,
      item.quantity.toString(),
      item.unit ?? "-",
      formatNum(item.unitPrice),
      formatNum(item.totalPrice),
    ]),
    foot: [["", "", "", "ยอดรวมทั้งสิ้น", formatNum(po.totalAmount)]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    footStyles: { fillColor: [240, 245, 255], textColor: [30, 64, 175], fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  if (po.notes) {
    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    doc.setFontSize(9);
    doc.text(`หมายเหตุ: ${po.notes}`, margin, finalY);
  }

  doc.save(`PO_${po.poNumber}.pdf`);
}

export function exportPaymentPrepPDF(prep: {
  prepNumber: string;
  prepDate: Date | string;
  paymentDate: Date | string;
  totalAmount: number;
  notes?: string | null;
  items: {
    ap: {
      apNumber: string;
      invoiceNumber: string;
      vendor: {
        name: string;
        bankName?: string | null;
        bankAccountNo?: string | null;
        bankAccountName?: string | null;
      };
    };
    amount: number;
  }[];
  payment?: {
    paymentNumber: string;
    paymentDate: Date | string;
    paymentMethod: string;
    referenceNumber?: string | null;
    companyBankAccount: { bankName: string; accountNo: string; accountName: string };
  } | null;
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addThaiFont(doc);

  const margin = 15;
  let y = margin;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ใบเตรียมจ่ายเงิน", 105, y, { align: "center" });
  y += 7;
  doc.setFontSize(12);
  doc.text(`เลขที่: ${prep.prepNumber}`, 105, y, { align: "center" });
  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`วันที่เตรียม: ${formatDateStr(prep.prepDate)}`, margin, y);
  doc.text(`วันที่กำหนดจ่าย: ${formatDateStr(prep.paymentDate)}`, 110, y);
  y += 7;

  doc.setDrawColor(200);
  doc.line(margin, y, 195, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [["เลข AP", "ผู้ขาย", "เลขใบแจ้งหนี้", "บัญชีปลายทาง", "จำนวนเงิน"]],
    body: prep.items.map((item) => [
      item.ap.apNumber,
      item.ap.vendor.name,
      item.ap.invoiceNumber,
      item.ap.vendor.bankAccountNo
        ? `${item.ap.vendor.bankAccountNo}\n${item.ap.vendor.bankAccountName ?? ""}`
        : "-",
      formatNum(item.amount),
    ]),
    foot: [["", "", "", "รวมทั้งสิ้น", formatNum(prep.totalAmount)]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    footStyles: { fillColor: [240, 245, 255], textColor: [30, 64, 175], fontStyle: "bold" },
    columnStyles: { 4: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  let finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (prep.payment) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("ข้อมูลการชำระเงิน", margin, finalY);
    finalY += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`วันที่ชำระ: ${formatDateStr(prep.payment.paymentDate)}`, margin, finalY);
    finalY += 5;
    doc.text(`วิธีการชำระ: ${prep.payment.paymentMethod}`, margin, finalY);
    finalY += 5;
    doc.text(
      `บัญชีที่ใช้จ่าย: ${prep.payment.companyBankAccount.bankName} ${prep.payment.companyBankAccount.accountNo} ${prep.payment.companyBankAccount.accountName}`,
      margin,
      finalY
    );
    if (prep.payment.referenceNumber) {
      finalY += 5;
      doc.text(`เลขอ้างอิง: ${prep.payment.referenceNumber}`, margin, finalY);
    }
  }

  if (prep.notes) {
    finalY += 8;
    doc.setFontSize(9);
    doc.text(`หมายเหตุ: ${prep.notes}`, margin, finalY);
  }

  finalY += 15;
  doc.setFontSize(9);
  doc.text("ผู้จัดทำ: __________________", margin, finalY);
  doc.text("ผู้อนุมัติ: __________________", 110, finalY);
  finalY += 5;
  doc.text("วันที่: __________________", margin, finalY);
  doc.text("วันที่: __________________", 110, finalY);

  doc.save(`PaymentPrep_${prep.prepNumber}.pdf`);
}
