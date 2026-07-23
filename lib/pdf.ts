import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { registerThaiFont } from "./fonts/register";
import { numberToThaiBahtText } from "./utils";

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
    doc.text(`เลขประจำตัวผู้เสียภาษี: ${po.vendor.taxId}`, margin + 20, y);
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

const COMPANY = {
  name: "บริษัท เคมเทค อินโนเวชั่น จำกัด",
  address: "333/37 หมู่ 2 ต.มาบยางพร อ.ปลวกแดง จ.ระยอง 21140",
  taxId: "0205555008617",
};

const PND_OPTIONS = ["ภ.ง.ด.1ก", "ภ.ง.ด.1ก พิเศษ", "ภ.ง.ด.2", "ภ.ง.ด.3", "ภ.ง.ด.2ก", "ภ.ง.ด.3ก", "ภ.ง.ด.53"];

export type WHTCertificateData = {
  certNumber: string;
  paymentDate: Date | string;
  vendor: { name: string; address?: string | null; taxId?: string | null };
  items: { invoiceNumber: string; amount: number; withholdingTaxRate: number; withholdingTaxAmount: number }[];
};

/**
 * Generates a real PDF (not window.print()) so the output is guaranteed A4 with
 * no browser-injected print header/footer (title/date/URL/page-number), which
 * CSS cannot suppress since those are drawn by the browser's print dialog, not
 * the page. One page per vendor certificate, all in a single downloaded file.
 */
export function exportWHTCertificatePDF(paymentNumber: string, certs: WHTCertificateData[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  registerThaiFont(doc);

  const left = 12;
  const right = 198;
  const width = right - left;

  certs.forEach((cert, certIdx) => {
    if (certIdx > 0) doc.addPage();

    const totalAmount = cert.items.reduce((s, i) => s + i.amount, 0);
    const totalWHT = cert.items.reduce((s, i) => s + i.withholdingTaxAmount, 0);
    const rates = Array.from(new Set(cert.items.map((i) => i.withholdingTaxRate)));
    const rateLabel = rates.length === 1 ? String(rates[0]) : "หลายอัตรา";

    let y = 18;

    // Copy note (left) + book/running number (right)
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(7.5);
    doc.text("ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)", left, y);
    doc.text("ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)", left, y + 4);
    doc.text("เล่มที่ ..........................", right, y, { align: "right" });
    doc.text(`เลขที่ ${cert.certNumber}`, right, y + 4, { align: "right" });
    y += 11;

    // Title
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(15);
    doc.text("หนังสือรับรองการหักภาษี ณ ที่จ่าย", 105, y, { align: "center" });
    y += 6;
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(10.5);
    doc.text("ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร", 105, y, { align: "center" });
    y += 5;

    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);
    y += 6;

    // Payer / payee boxes
    const party = (label: string, name: string, address: string, taxId: string) => {
      doc.setFontSize(9.5);
      doc.setFont("Sarabun", "bold");
      doc.text(label, left, y);
      doc.setFont("Sarabun", "normal");
      doc.text(`เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* ${taxId || "-"}`, right, y, { align: "right" });
      y += 5;
      doc.text(`ชื่อ ${name}`, left, y);
      y += 3.8;
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text("(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)", left, y);
      doc.setTextColor(0);
      y += 4.5;
      doc.setFontSize(9.5);
      const addrLines = doc.splitTextToSize(`ที่อยู่ ${address}`, width - 4);
      doc.text(addrLines, left, y);
      y += addrLines.length * 4.2;
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(
        "(ให้ระบุชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)",
        left,
        y
      );
      doc.setTextColor(0);
      y += 5;
    };

    party("ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -", COMPANY.name, COMPANY.address, COMPANY.taxId);
    doc.setLineWidth(0.3);
    doc.line(left, y, right, y);
    y += 5;

    party("ผู้ถูกหักภาษี ณ ที่จ่าย : -", cert.vendor.name, cert.vendor.address ?? "-", cert.vendor.taxId ?? "-");
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);
    y += 5.5;

    // PND running-number checkboxes
    doc.setFontSize(8.5);
    doc.text("ลำดับที่ ______________ ในแบบ", left, y);
    y += 4.5;
    let cx = left;
    PND_OPTIONS.forEach((label, i) => {
      const s = `☐ (${i + 1}) ${label}`;
      const w = doc.getTextWidth(s) + 5;
      if (cx + w > right) {
        cx = left;
        y += 4.5;
      }
      doc.text(s, cx, y);
      cx += w;
    });
    y += 4.5;
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)", left, y);
    doc.setTextColor(0);
    y += 4;
    doc.setLineWidth(0.5);
    doc.line(left, y, right, y);
    y += 3;

    // Income type table
    const incomeRows: (string | { content: string; styles?: Record<string, unknown> })[][] = [
      ["1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40(1)", "", "", ""],
      ["2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40(2)", "", "", ""],
      ["3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40(3)", "", "", ""],
      ["4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40(4)(ก)\n(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40(4)(ข)", "", "", ""],
      [
        `5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่ายตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ\n(ระบุ) ค่าจ้างทำของ / ค่าบริการ อัตราร้อยละ ${rateLabel}`,
        formatDateStr(cert.paymentDate),
        formatNum(totalAmount),
        formatNum(totalWHT),
      ],
      ["6. อื่น ๆ (ระบุ) ....................................", "", "", ""],
      [
        { content: "รวมเงินที่จ่ายและภาษีที่หักนำส่ง", styles: { halign: "right", fontStyle: "bold", colSpan: 2 } },
        "",
        { content: formatNum(totalAmount), styles: { fontStyle: "bold" } },
        { content: formatNum(totalWHT), styles: { fontStyle: "bold" } },
      ],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left, right: 12 },
      head: [["ประเภทเงินได้พึงประเมินที่จ่าย", "วัน เดือน หรือปีภาษี ที่จ่าย", "จำนวนเงินที่จ่าย", "ภาษีที่หัก และนำส่งไว้"]],
      body: incomeRows,
      styles: { font: "Sarabun", fontSize: 8.5, cellPadding: 1.8, minCellHeight: 7, lineColor: 0, lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "normal", halign: "center", valign: "bottom", minCellHeight: 9 },
      columnStyles: {
        0: { cellWidth: width - 3 * 22 },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 22, halign: "right" },
      },
      theme: "grid",
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    doc.setFontSize(9);
    doc.setFont("Sarabun", "bold");
    doc.text("รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)", left, y);
    doc.setFont("Sarabun", "normal");
    doc.text(numberToThaiBahtText(totalWHT), left + 52, y);
    y += 5.5;
    doc.setLineWidth(0.3);
    doc.line(left, y - 4, right, y - 4);

    doc.setFontSize(8.5);
    const pensionLine = doc.splitTextToSize(
      "เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน.......................บาท กองทุนประกันสังคม.....................บาท กองทุนสำรองเลี้ยงชีพ......................บาท",
      width - 2
    );
    doc.text(pensionLine, left, y);
    y += pensionLine.length * 4.5 + 2;
    doc.line(left, y - 4, right, y - 4);

    doc.setFontSize(9);
    doc.setFont("Sarabun", "bold");
    doc.text("ผู้จ่ายเงิน", left, y);
    doc.setFont("Sarabun", "normal");
    doc.text("☑ (1) หัก ณ ที่จ่าย", left + 18, y);
    doc.text("☐ (2) ออกให้ตลอดไป", left + 58, y);
    doc.text("☐ (3) ออกให้ครั้งเดียว", left + 100, y);
    doc.text("☐ (4) อื่น ๆ (ระบุ)................................", left + 142, y);
    y += 5.5;
    doc.line(left, y - 4, right, y - 4);
    y += 1.5;

    // Warning (left, narrower) / certification + signature (right, wider so the
    // certification sentence fits on one line) — roughly matches the source form's proportions.
    const warnColW = width * 0.36;
    const certColW = width - warnColW;
    const warnLines = doc.splitTextToSize(
      "ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร",
      warnColW - 5
    );
    const blockHeight = Math.max(warnLines.length * 4.2 + 12, 40);

    doc.setFontSize(8.5);
    doc.setFont("Sarabun", "bold");
    doc.text("คำเตือน", left, y + 5);
    doc.setFont("Sarabun", "normal");
    doc.text(warnLines, left, y + 10);
    doc.line(left + warnColW, y - 2, left + warnColW, y + blockHeight - 3);

    const rightColX = left + warnColW + certColW / 2;
    doc.setFontSize(9);
    doc.text("ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ", rightColX, y + 5, {
      align: "center",
    });
    doc.text("ลงชื่อ.................................................ผู้จ่ายเงิน", rightColX, y + 21, { align: "center" });
    doc.text("......../.........../.......... (วัน เดือน ปี ที่ออกหนังสือรับรองฯ)", rightColX, y + 27, { align: "center" });
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text("ประทับตรานิติบุคคล (ถ้ามี)", rightColX, y + 32, { align: "center" });
    doc.setTextColor(0);

    y += blockHeight;
    doc.line(left, y, right, y);
    y += 4.5;

    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text("หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง", left, y);
    y += 3.8;
    doc.text("1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง", left, y);
    y += 3.8;
    doc.text("2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า", left, y);
    y += 3.8;
    doc.text("3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร", left, y);
    doc.setTextColor(0);
    y += 6;

    // Invoice breakdown attachment — internal reference, only when multiple invoices are combined
    if (cert.items.length > 1) {
      doc.setFontSize(8.5);
      doc.setFont("Sarabun", "bold");
      doc.text("เอกสารแนบ: รายละเอียดใบแจ้งหนี้ที่รวมอยู่ในหนังสือรับรองฉบับนี้", left, y);
      y += 3;

      autoTable(doc, {
        startY: y,
        margin: { left, right: 12 },
        head: [["เลขที่ใบแจ้งหนี้", "จำนวนเงิน", "อัตรา", "ภาษีที่หัก"]],
        body: cert.items.map((item) => [
          item.invoiceNumber,
          formatNum(item.amount),
          `${item.withholdingTaxRate}%`,
          formatNum(item.withholdingTaxAmount),
        ]),
        styles: { font: "Sarabun", fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "normal" },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        theme: "grid",
      });
    }
  });

  doc.save(`WHT_${paymentNumber}.pdf`);
}
