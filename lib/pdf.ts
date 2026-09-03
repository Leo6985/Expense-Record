import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { registerThaiFont } from "./fonts/register";
import { patchThaiMarkStacking } from "./fonts/thai-shape";
import { numberToThaiBahtText, formatDate } from "./utils";

function addThaiFont(doc: jsPDF) {
  doc.setFont("helvetica");
}

function formatNum(n: number) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(n);
}

// Delegates to the same dd/MM/yyyy (Gregorian) formatter used across the rest of the app,
// so every document — on-screen and PDF — renders dates identically.
function formatDateStr(d: Date | string | null | undefined) {
  return formatDate(d);
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
  phone: "033-650-796",
  email: "account@chemtech-th.com",
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
  // Thai vowels/tone marks sit above and below the baseline; jsPDF's default 1.15
  // line-height factor packs wrapped lines too tightly, clipping or overlapping marks
  // between lines. autoTable and doc.text() both read this factor for their internal
  // line spacing, so bumping it here fixes both free text and table cells.
  doc.setLineHeightFactor(1.5);
  // Separately: jsPDF can't stack a tone mark above an upper vowel on the SAME
  // character (e.g. "ที่") since it has no text-shaping engine — this patches
  // doc.text() to lift those marks manually. See lib/fonts/thai-shape.ts.
  patchThaiMarkStacking(doc);
  const lineHeightMM = (fontSizePt: number) =>
    (fontSizePt / doc.internal.scaleFactor) * doc.getLineHeightFactor();

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
      y += addrLines.length * lineHeightMM(9.5);
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
      const s = `[ ] (${i + 1}) ${label}`;
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
        // Column 2's header ("จำนวนเงินที่จ่าย") needs ~19.5mm at 8.5pt to stay on one
        // line once cell padding is subtracted from 22mm; widen it and take the
        // difference from column 0, which has plenty of room to spare.
        0: { cellWidth: width - 22 - 26 - 22 },
        1: { cellWidth: 22, halign: "center" },
        2: { cellWidth: 26, halign: "right" },
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
    y += pensionLine.length * lineHeightMM(8.5) + 2;
    doc.line(left, y - 4, right, y - 4);

    doc.setFontSize(9);
    doc.setFont("Sarabun", "bold");
    doc.text("ผู้จ่ายเงิน", left, y);
    doc.setFont("Sarabun", "normal");
    // ☑/☐ aren't in the embedded Sarabun font (they'd silently draw as .notdef), so
    // plain brackets are used instead — see the same substitution above for PND_OPTIONS.
    doc.text("[x] (1) หัก ณ ที่จ่าย", left + 18, y);
    doc.text("[ ] (2) ออกให้ตลอดไป", left + 58, y);
    doc.text("[ ] (3) ออกให้ครั้งเดียว", left + 100, y);
    doc.text("[ ] (4) อื่น ๆ (ระบุ)................................", left + 142, y);
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
    const blockHeight = Math.max(warnLines.length * lineHeightMM(8.5) + 12, 44);

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
    doc.text("......../.........../..........", rightColX, y + 27, { align: "center" });
    doc.text("(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)", rightColX, y + 31, { align: "center" });
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text("ประทับตรานิติบุคคล (ถ้ามี)", rightColX, y + 36, { align: "center" });
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

export type ReceiptVoucherData = {
  receiptNumber: string;
  receiptDate: Date | string;
  recordedDate: Date | string;
  paymentMethod: string;
  referenceNumber?: string | null;
  companyBankAccount: { bankName: string; accountNo: string; accountName: string };
  feeAmount: number;
  withholdingTaxAmount: number;
  withholdingTaxCertNumber?: string | null;
  actualReceivedAmount: number;
  shortageOrExcessAmount: number;
  createdByName?: string | null;
  approvedByName?: string | null;
  notes?: string | null;
  items: { invoiceNumber: string; customerName: string; amount: number }[];
};

/** Real PDF (not window.print()), Sarabun-embedded like the WHT certificate so Thai
 * text actually renders — see registerThaiFont's note on jsPDF's built-in fonts. */
export function exportReceiptVoucherPDF(data: ReceiptVoucherData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  registerThaiFont(doc);
  doc.setLineHeightFactor(1.5);
  patchThaiMarkStacking(doc);

  const left = 15;
  const right = 195;
  const width = right - left;
  let y = 18;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.text(COMPANY.name, left, y);
  y += 4.5;
  doc.text(COMPANY.address, left, y);
  y += 4.5;
  doc.text(`เลขประจำตัวผู้เสียภาษี ${COMPANY.taxId}`, left, y);

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(17);
  doc.text("ใบสำคัญรับ", right, 20, { align: "right" });
  doc.setFontSize(9);
  doc.text("RECEIPT VOUCHER", right, 25, { align: "right" });
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9.5);
  doc.text(`เลขที่ ${data.receiptNumber}`, right, 30, { align: "right" });

  y = 35;
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 6;

  const customerNames = Array.from(new Set(data.items.map((i) => i.customerName))).join(", ");
  doc.setFontSize(10);
  doc.setFont("Sarabun", "bold");
  doc.text("ได้รับเงินจาก", left, y);
  doc.setFont("Sarabun", "normal");
  doc.text(customerNames, left + 25, y);
  doc.text(`วันที่รับชำระ ${formatDateStr(data.receiptDate)}`, right, y, { align: "right" });
  y += 6;
  doc.text(`วันที่บันทึกข้อมูล ${formatDateStr(data.recordedDate)}`, right, y, { align: "right" });
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left, right: 15 },
    head: [["เลขที่ใบกำกับภาษี", "ลูกค้า", "จำนวนเงิน"]],
    body: data.items.map((item) => [item.invoiceNumber, item.customerName, formatNum(item.amount)]),
    styles: { font: "Sarabun", fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "normal" },
    columnStyles: { 2: { halign: "right" } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const totalAmount = data.items.reduce((s, i) => s + i.amount, 0);
  const netExpected = totalAmount - data.feeAmount - data.withholdingTaxAmount;

  const summaryLine = (label: string, value: string, bold = false) => {
    doc.setFont("Sarabun", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10.5 : 9.5);
    doc.text(label, right - 70, y);
    doc.text(value, right, y, { align: "right" });
    y += bold ? 6 : 5;
  };

  summaryLine("ยอดรับชำระรวม", `฿${formatNum(totalAmount)}`);
  summaryLine("หัก ค่าธรรมเนียม", `฿${formatNum(data.feeAmount)}`);
  summaryLine(
    `หัก ภาษีหัก ณ ที่จ่าย${data.withholdingTaxCertNumber ? ` (เลขที่ใบหัก ${data.withholdingTaxCertNumber})` : ""}`,
    `฿${formatNum(data.withholdingTaxAmount)}`
  );
  doc.setLineWidth(0.3);
  doc.line(right - 70, y - 3, right, y - 3);
  summaryLine("ยอดสุทธิที่คาดว่าจะได้รับ", `฿${formatNum(netExpected)}`);
  summaryLine("ยอดรับจริง", `฿${formatNum(data.actualReceivedAmount)}`, true);
  if (data.shortageOrExcessAmount !== 0) {
    summaryLine(
      data.shortageOrExcessAmount > 0 ? "เงินเกิน" : "เงินขาด",
      `฿${formatNum(Math.abs(data.shortageOrExcessAmount))}`,
      true
    );
  }

  y += 3;
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 6;

  doc.setFontSize(9.5);
  doc.setFont("Sarabun", "bold");
  doc.text("จำนวนเงิน (ตัวอักษร)", left, y);
  doc.setFont("Sarabun", "normal");
  doc.text(numberToThaiBahtText(data.actualReceivedAmount), left + 32, y);
  y += 8;

  doc.setFont("Sarabun", "bold");
  doc.text("ข้อมูลการรับเงิน", left, y);
  y += 5.5;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.text(`วิธีการรับชำระ: ${data.paymentMethod}`, left, y);
  y += 5;
  doc.text(
    `บัญชีที่รับเงิน: ${data.companyBankAccount.bankName} ${data.companyBankAccount.accountNo} ${data.companyBankAccount.accountName}`,
    left,
    y
  );
  if (data.referenceNumber) {
    y += 5;
    doc.text(`เลขที่อ้างอิง: ${data.referenceNumber}`, left, y);
  }
  if (data.notes) {
    y += 5;
    doc.text(`หมายเหตุ: ${data.notes}`, left, y);
  }

  y += 20;
  doc.setFontSize(9);
  doc.text(`ผู้จัดทำ: ${data.createdByName ? data.createdByName : "__________________"}`, left, y);
  doc.text(`ผู้อนุมัติ: ${data.approvedByName ? data.approvedByName : "__________________"}`, right - 65, y);
  y += 5;
  doc.text("วันที่: __________________", left, y);
  doc.text("วันที่: __________________", right - 65, y);

  doc.save(`RV_${data.receiptNumber}.pdf`);
}

export type JournalVoucherData = {
  voucherNumber: string;
  voucherDate: Date | string;
  description: string;
  notes?: string | null;
  status: string;
  createdByName?: string | null;
  approvedByName?: string | null;
  lines: {
    accountCode: string;
    accountName: string;
    department?: string | null;
    description?: string | null;
    debit: number;
    credit: number;
  }[];
};

/** Real PDF (Sarabun-embedded) for the general-journal voucher — laid out to match the
 * บริษัท เคมเทค อินโนเวชั่น จำกัด "สมุดรายวันทั่วไป" paper form: เลขที่บัญชี | แผนก |
 * รายละเอียด | เดบิต | เครดิต, a totals row, the amount in Thai words, and a signature block. */
export function exportJournalVoucherPDF(data: JournalVoucherData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  registerThaiFont(doc);
  doc.setLineHeightFactor(1.5);
  patchThaiMarkStacking(doc);

  const left = 15;
  const right = 195;
  let y = 18;

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(13);
  doc.text(COMPANY.name, 105, y, { align: "center" });
  y += 5;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8.5);
  doc.text(COMPANY.address, 105, y, { align: "center" });
  y += 6;
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(14);
  doc.text("สมุดรายวันทั่วไป", 105, y, { align: "center" });

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9.5);
  doc.text(`เลขที่  ${data.voucherNumber}`, right, 16, { align: "right" });
  doc.text(`วันที่  ${formatDateStr(data.voucherDate)}`, right, 21, { align: "right" });

  y += 6;
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(9.5);
  doc.text("รายละเอียด :", left, y);
  doc.setFont("Sarabun", "normal");
  doc.text(doc.splitTextToSize(data.description, right - left - 25), left + 22, y);
  y += 4;

  const totalDebit = data.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = data.lines.reduce((s, l) => s + l.credit, 0);

  autoTable(doc, {
    startY: y,
    margin: { left, right: 15 },
    head: [["เลขที่บัญชี", "แผนก", "รายละเอียด", "เดบิต", "เครดิต"]],
    body: data.lines.map((l) => [
      l.accountCode,
      l.department ?? "",
      l.description || l.accountName,
      l.debit ? formatNum(l.debit) : "",
      l.credit ? formatNum(l.credit) : "",
    ]),
    foot: [["", "", "รวม", formatNum(totalDebit), formatNum(totalCredit)]],
    styles: { font: "Sarabun", fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "normal", halign: "center" },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 22 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 28 },
    },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(9.5);
  doc.text("จำนวนเงิน (ตัวอักษร)", left, y);
  doc.setFont("Sarabun", "normal");
  doc.text(`(${numberToThaiBahtText(totalDebit)})`, left + 34, y);
  y += 7;

  if (data.notes) {
    doc.setFont("Sarabun", "bold");
    doc.text("หมายเหตุ", left, y);
    doc.setFont("Sarabun", "normal");
    doc.text(doc.splitTextToSize(data.notes, right - left - 22), left + 20, y);
    y += 7;
  }

  // Signature block: two rows of three, matching the paper form
  y = Math.max(y + 16, 235);
  const cols = [left + 18, 105, right - 18];
  const rows: [string, string, string][] = [
    ["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผจก.ฝ่ายบัญชี"],
    ["ผู้ช่วยกรรมการผู้จัดการ", "กรรมการผู้จัดการ", "ผู้รับเงิน"],
  ];
  doc.setFontSize(9);
  for (const row of rows) {
    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    row.forEach((label, i) => {
      const cx = cols[i];
      doc.line(cx - 22, y, cx + 22, y);
      doc.setFont("Sarabun", "normal");
      doc.text(label, cx, y + 5, { align: "center" });
      if (i === 0 && row === rows[0] && data.createdByName)
        doc.text(data.createdByName, cx, y - 2, { align: "center" });
      if (i === 2 && row === rows[0] && data.approvedByName)
        doc.text(data.approvedByName, cx, y - 2, { align: "center" });
    });
    y += 20;
  }

  doc.save(`${data.voucherNumber}.pdf`);
}

const NOTE_TYPE_TITLE: Record<string, { th: string; en: string }> = {
  DEBIT: { th: "ใบเพิ่มหนี้", en: "Debit Note" },
  CREDIT: { th: "ใบลดหนี้", en: "Credit Note" },
};

export type DebitCreditNoteData = {
  noteNumber: string;
  type: "DEBIT" | "CREDIT";
  noteDate: Date | string;
  detail?: string | null;
  reason?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  approvedByName?: string | null;
  approvedAt?: Date | string | null;
  createdAt: Date | string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  customer: { name: string; address?: string | null; taxId?: string | null };
  invoice: { invoiceNumber: string; invoiceDate: Date | string; amount: number };
};

const GRAY_900: [number, number, number] = [17, 24, 39];
const GRAY_700: [number, number, number] = [55, 65, 81];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_500: [number, number, number] = [107, 114, 128];
const GRAY_400: [number, number, number] = [156, 163, 175];
const GRAY_300: [number, number, number] = [209, 213, 219];
const BLUE_700: [number, number, number] = [29, 78, 216];
const ORANGE_700: [number, number, number] = [194, 65, 12];
const TEAL_700: [number, number, number] = [15, 118, 110];

/** Real PDF (not window.print()), same Sarabun-embedded pattern as the WHT certificate and
 * receipt voucher — avoids the browser print dialog's own header/footer (page title + URL)
 * being stamped onto a document that must stand as an official tax record. Laid out to match
 * the app's bordered-card print style (see purchase-orders/payment-prep print pages). */
export function exportDebitCreditNotePDF(note: DebitCreditNoteData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  registerThaiFont(doc);
  doc.setLineHeightFactor(1.4);
  patchThaiMarkStacking(doc);
  const lineHeightMM = (fontSizePt: number) =>
    (fontSizePt / doc.internal.scaleFactor) * doc.getLineHeightFactor();

  const left = 15;
  const right = 195;
  const width = right - left;
  let y = 20;

  const title = NOTE_TYPE_TITLE[note.type] ?? { th: note.type, en: note.type };
  const sign = note.type === "DEBIT" ? "+" : "-";
  const totalColor = note.type === "DEBIT" ? ORANGE_700 : TEAL_700;
  const correctedInvoiceAmount = note.type === "DEBIT" ? note.invoice.amount + note.amount : note.invoice.amount - note.amount;

  // Header: company left, document title right
  doc.setTextColor(...GRAY_900);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(11);
  doc.text(COMPANY.name, left, y);
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_600);
  y += 4.5;
  doc.text(COMPANY.address, left, y);
  y += 4;
  doc.text(`เลขประจำตัวผู้เสียภาษี ${COMPANY.taxId}`, left, y);
  y += 4;
  doc.text(`โทร ${COMPANY.phone}  |  ${COMPANY.email}`, left, y);

  doc.setTextColor(...GRAY_900);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(18);
  doc.text(title.th, right, 21, { align: "right" });
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_500);
  doc.text(title.en, right, 26, { align: "right" });
  doc.setFontSize(9.5);
  doc.text("เลขที่ ", right - doc.getTextWidth(note.noteNumber) - 1, 32, { align: "right" });
  doc.setFont("Sarabun", "bold");
  doc.setTextColor(...BLUE_700);
  doc.text(note.noteNumber, right, 32, { align: "right" });
  doc.setFont("Sarabun", "normal");
  doc.setTextColor(...GRAY_500);
  doc.text("วันที่ ", right - doc.getTextWidth(formatDateStr(note.noteDate)) - 1, 37, { align: "right" });
  doc.setFont("Sarabun", "normal");
  doc.setTextColor(...GRAY_900);
  doc.text(formatDateStr(note.noteDate), right, 37, { align: "right" });

  y = 42;
  doc.setDrawColor(...GRAY_900);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 6;

  // Customer & invoice-reference cards
  const gap = 6;
  const boxW = (width - gap) / 2;
  const rightBoxX = left + boxW + gap;
  const padX = 4;
  const padTop = 5;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  const addrLines = note.customer.address ? doc.splitTextToSize(note.customer.address, boxW - padX * 2) : [];
  let leftContentH = padTop + 4 + 4.5 + (addrLines.length ? addrLines.length * lineHeightMM(8.5) : 0) + (note.customer.taxId ? 4 : 0) + 4;

  const refRows = 2 + (note.reason ? 1 : 0);
  const reasonLines = note.reason ? doc.splitTextToSize(note.reason, boxW - padX * 2) : [];
  let rightContentH = padTop + 4 + refRows * 5 + (note.reason ? (reasonLines.length - 1) * lineHeightMM(8.5) : 0) + 4;

  const boxH = Math.max(leftContentH, rightContentH, 26);

  doc.setDrawColor(...GRAY_300);
  doc.setLineWidth(0.3);
  doc.roundedRect(left, y, boxW, boxH, 2, 2, "S");
  doc.roundedRect(rightBoxX, y, boxW, boxH, 2, 2, "S");

  let ly = y + padTop;
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_400);
  doc.text("ลูกค้า", left + padX, ly);
  ly += 4;
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY_900);
  doc.text(note.customer.name, left + padX, ly);
  ly += 4.5;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_600);
  if (addrLines.length) {
    doc.text(addrLines, left + padX, ly);
    ly += addrLines.length * lineHeightMM(8.5);
  }
  if (note.customer.taxId) {
    doc.setTextColor(...GRAY_500);
    doc.text(`เลขประจำตัวผู้เสียภาษี: ${note.customer.taxId}`, left + padX, ly);
  }

  let ry = y + padTop;
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_400);
  doc.text("อ้างอิงใบกำกับภาษี", rightBoxX + padX, ry);
  ry += 4;
  doc.setFontSize(8.5);
  const refRow = (labelText: string, valueText: string, bold?: boolean) => {
    doc.setFont("Sarabun", "normal");
    doc.setTextColor(...GRAY_500);
    doc.text(labelText, rightBoxX + padX, ry);
    doc.setFont("Sarabun", bold ? "bold" : "normal");
    doc.setTextColor(...GRAY_700);
    doc.text(valueText, rightBoxX + boxW - padX, ry, { align: "right" });
    ry += 5;
  };
  refRow("เลขที่ใบกำกับภาษี", note.invoice.invoiceNumber, true);
  refRow("วันที่ใบกำกับภาษี", formatDateStr(note.invoice.invoiceDate));
  if (note.reason) {
    doc.setFont("Sarabun", "normal");
    doc.setTextColor(...GRAY_500);
    doc.text("เหตุผล", rightBoxX + padX, ry);
    doc.setTextColor(...GRAY_700);
    doc.text(reasonLines, rightBoxX + padX, ry + 4);
  }

  y += boxH + 6;

  // Detail box (always shown, matching the on-screen/print card layout)
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_700);
  doc.text("รายละเอียด", left, y);
  doc.setDrawColor(...GRAY_300);
  doc.line(left, y + 1.5, right, y + 1.5);
  y += 5;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_700);
  const detailLines = doc.splitTextToSize(note.detail || "-", width - padX * 2);
  const detailBoxH = Math.max(detailLines.length * lineHeightMM(9) + padTop, 14);
  doc.setDrawColor(...GRAY_300);
  doc.roundedRect(left, y, width, detailBoxH, 2, 2, "S");
  doc.text(detailLines, left + padX, y + padTop);
  y += detailBoxH + 6;

  // Value comparison table, required per มาตรา 86/9, 86/10 แห่งประมวลรัษฎากร — plain rows,
  // no grid lines, matching the on-screen card's flat list style.
  autoTable(doc, {
    startY: y,
    margin: { left, right: 15 },
    theme: "plain",
    body: [
      ["มูลค่าใบกำกับภาษีฉบับเดิม (ก่อนภาษีมูลค่าเพิ่ม)", formatNum(note.invoice.amount)],
      ["มูลค่าใบกำกับภาษีที่ถูกต้อง (ก่อนภาษีมูลค่าเพิ่ม)", formatNum(correctedInvoiceAmount)],
      ["ผลต่าง", `${sign}${formatNum(note.amount)}`],
      [`ยอดรวมมูลค่าใบ${note.type === "DEBIT" ? "เพิ่ม" : "ลด"}หนี้ (ก่อนภาษีมูลค่าเพิ่ม)`, `${sign}${formatNum(note.amount)}`],
      ["ภาษีมูลค่าเพิ่ม", `${sign}${formatNum(note.vatAmount)}`],
      [
        { content: `จำนวนเงินรวมทั้งสิ้น (${note.type === "DEBIT" ? "เพิ่มหนี้" : "ลดหนี้"})`, styles: { fontStyle: "bold", textColor: totalColor } },
        { content: `${sign}${formatNum(note.totalAmount)}`, styles: { fontStyle: "bold", textColor: totalColor, fontSize: 10.5 } },
      ],
    ],
    styles: { font: "Sarabun", fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 0 }, textColor: GRAY_600 },
    columnStyles: { 0: { halign: "right" }, 1: { halign: "right", cellWidth: 45 } },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  doc.setFontSize(9);
  doc.setFont("Sarabun", "bold");
  doc.setTextColor(...GRAY_700);
  doc.text("จำนวนเงิน (ตัวอักษร)", left, y);
  doc.setFont("Sarabun", "normal");
  doc.text(numberToThaiBahtText(note.totalAmount), left + 32, y);
  y += 8;

  if (note.notes) {
    doc.setFont("Sarabun", "bold");
    doc.setFontSize(9);
    doc.text("หมายเหตุ", left, y);
    y += 4.5;
    doc.setFont("Sarabun", "normal");
    doc.setTextColor(...GRAY_600);
    const notesLines = doc.splitTextToSize(note.notes, width);
    doc.text(notesLines, left, y);
    y += notesLines.length * lineHeightMM(9) + 3;
  }

  // Signature block: line above, role label, name, date — centered under each line
  y = Math.max(y + 12, 250);
  const colCenters = [left + width * 0.25, left + width * 0.75];
  const lineHalfW = 30;
  doc.setDrawColor(...GRAY_400);
  doc.setLineWidth(0.4);
  for (const cx of colCenters) doc.line(cx - lineHalfW, y, cx + lineHalfW, y);

  y += 5;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_600);
  doc.text("ผู้จัดทำ", colCenters[0], y, { align: "center" });
  doc.text("ผู้อนุมัติ", colCenters[1], y, { align: "center" });

  y += 5;
  doc.setTextColor(...GRAY_900);
  doc.text(note.createdByName || "................................", colCenters[0], y, { align: "center" });
  doc.text(note.approvedByName || "................................", colCenters[1], y, { align: "center" });

  y += 4.5;
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_500);
  doc.text(note.createdAt ? formatDateStr(note.createdAt) : "...................", colCenters[0], y, { align: "center" });
  doc.text(note.approvedAt ? formatDateStr(note.approvedAt) : "...................", colCenters[1], y, { align: "center" });

  doc.save(`${note.type === "DEBIT" ? "DBN" : "CRN"}_${note.noteNumber}.pdf`);
}
