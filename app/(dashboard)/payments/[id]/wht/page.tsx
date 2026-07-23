import { getPayment } from "@/actions/payments";
import { formatCurrency, numberToThaiBahtText } from "@/lib/utils";
import { notFound } from "next/navigation";
import AutoPrint from "./PrintButton";

const COMPANY = {
  name: "บริษัท เคมเทค อินโนเวชั่น จำกัด",
  address: "333/37 หมู่ 2 ต.มาบยางพร อ.ปลวกแดง จ.ระยอง 21140",
  taxId: "0205555008617",
};

export default async function WHTCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = await getPayment(id);
  if (!payment) notFound();

  const fmt = (d: Date | string | null | undefined) =>
    d ? new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "-";

  type Item = (typeof payment.prep.items)[number];
  const byVendor = new Map<string, { vendor: Item["ap"]["vendor"]; items: Item[] }>();
  for (const item of payment.prep.items) {
    if (item.withholdingTaxAmount <= 0) continue;
    const vId = item.ap.vendor.id;
    if (!byVendor.has(vId)) byVendor.set(vId, { vendor: item.ap.vendor, items: [] });
    byVendor.get(vId)!.items.push(item);
  }
  const certificates = Array.from(byVendor.values());

  if (certificates.length === 0) {
    return (
      <div className="p-10 text-center text-gray-400 text-sm">
        การชำระเงินนี้ไม่มีรายการหัก ณ ที่จ่าย จึงไม่สามารถออกหนังสือรับรองได้
      </div>
    );
  }

  return (
    <div className="bg-white">
      <AutoPrint />

      {certificates.map((cert, certIdx) => {
        const totalAmount = cert.items.reduce((s, i) => s + i.amount, 0);
        const totalWHT = cert.items.reduce((s, i) => s + i.withholdingTaxAmount, 0);
        const rates = Array.from(new Set(cert.items.map((i) => i.withholdingTaxRate)));
        const rateLabel = rates.length === 1 ? String(rates[0]) : "หลายอัตรา";
        const certNumber = `${payment.paymentNumber}-${String(certIdx + 1).padStart(2, "0")}`;

        return (
          <div key={cert.vendor.id} className={certIdx > 0 ? "wht-page-break" : ""}>
            <div className="max-w-3xl mx-auto px-10 py-8 text-sm">
              <div className="text-center mb-1">
                <div className="text-lg font-bold text-gray-900">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
                <div className="text-xs text-gray-600">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
              </div>
              <div className="text-right text-xs text-gray-500 mb-4">เลขที่ {certNumber}</div>

              {/* Payer / Payee */}
              <div className="border border-gray-800 mb-4">
                <div className="p-3 border-b border-gray-800">
                  <div className="font-semibold mb-1">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</div>
                  <div>ชื่อ {COMPANY.name}</div>
                  <div>ที่อยู่ {COMPANY.address}</div>
                  <div>
                    เลขประจำตัวผู้เสียภาษีอากร <span className="font-mono">{COMPANY.taxId}</span>
                  </div>
                </div>
                <div className="p-3">
                  <div className="font-semibold mb-1">ผู้ถูกหักภาษี ณ ที่จ่าย</div>
                  <div>ชื่อ {cert.vendor.name}</div>
                  <div>ที่อยู่ {cert.vendor.address ?? "-"}</div>
                  <div>
                    เลขประจำตัวผู้เสียภาษีอากร <span className="font-mono">{cert.vendor.taxId ?? "-"}</span>
                  </div>
                </div>
              </div>

              {/* Income type table */}
              <table className="w-full border-collapse border border-gray-800 mb-4 text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-800 px-2 py-1.5 text-left" colSpan={2}>
                      ประเภทเงินได้พึงประเมินที่จ่าย
                    </th>
                    <th className="border border-gray-800 px-2 py-1.5 text-center w-28">วัน เดือน ปี ที่จ่าย</th>
                    <th className="border border-gray-800 px-2 py-1.5 text-right w-24">จำนวนเงินที่จ่าย</th>
                    <th className="border border-gray-800 px-2 py-1.5 text-right w-24">ภาษีที่หักและนำส่ง</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1.5 align-top w-4">1.</td>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">
                      เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40(1)
                    </td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">2.</td>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">
                      ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40(2)
                    </td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">3.</td>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40(3)</td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">4.</td>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">
                      <div>ก. ดอกเบี้ย ฯลฯ ตามมาตรา 40(4)(ก)</div>
                      <div>ข. เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40(4)(ข)</div>
                    </td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                  </tr>
                  <tr className="bg-yellow-50">
                    <td className="border border-gray-800 px-2 py-1.5 align-top font-semibold">5.</td>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">
                      <div>การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่ายตามคำสั่งกรมสรรพากรที่ ทป.4/2528</div>
                      <div>
                        (ระบุ) <span className="font-medium">ค่าจ้างทำของ / ค่าบริการ</span> อัตราร้อยละ {rateLabel}
                      </div>
                    </td>
                    <td className="border border-gray-800 px-2 py-1.5 text-center align-top">{fmt(payment.paymentDate)}</td>
                    <td className="border border-gray-800 px-2 py-1.5 text-right align-top">{formatCurrency(totalAmount)}</td>
                    <td className="border border-gray-800 px-2 py-1.5 text-right align-top font-medium">
                      {formatCurrency(totalWHT)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">6.</td>
                    <td className="border border-gray-800 px-2 py-1.5 align-top">อื่น ๆ (ระบุ) ....................................</td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                    <td className="border border-gray-800"></td>
                  </tr>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="border border-gray-800 px-2 py-1.5 text-right" colSpan={3}>
                      รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                    </td>
                    <td className="border border-gray-800 px-2 py-1.5 text-right">{formatCurrency(totalAmount)}</td>
                    <td className="border border-gray-800 px-2 py-1.5 text-right">{formatCurrency(totalWHT)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mb-4 text-xs">
                <span className="text-gray-600">รวมภาษีที่หักนำส่ง (ตัวอักษร) </span>
                <span className="font-medium">{numberToThaiBahtText(totalWHT)}</span>
              </div>

              <div className="mb-6 text-xs flex flex-wrap gap-4">
                <span>ผู้จ่ายเงินได้</span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3.5 h-3.5 border border-gray-800 text-center leading-3 text-[10px]">✓</span>
                  หัก ณ ที่จ่าย
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3.5 h-3.5 border border-gray-800"></span>
                  ออกให้ตลอดไป
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3.5 h-3.5 border border-gray-800"></span>
                  ออกให้ครั้งเดียว
                </span>
              </div>

              {/* Invoice breakdown attachment — only needed when multiple invoices are combined into this certificate */}
              {cert.items.length > 1 && (
                <div className="mb-6">
                  <div className="text-xs font-semibold text-gray-700 mb-1">
                    รายละเอียดใบแจ้งหนี้ที่รวมอยู่ในหนังสือรับรองฉบับนี้
                  </div>
                  <table className="w-full border-collapse border border-gray-300 text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-2 py-1 text-left">เลขที่ใบแจ้งหนี้</th>
                        <th className="border border-gray-300 px-2 py-1 text-right">จำนวนเงิน</th>
                        <th className="border border-gray-300 px-2 py-1 text-right">อัตรา</th>
                        <th className="border border-gray-300 px-2 py-1 text-right">ภาษีที่หัก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cert.items.map((item) => (
                        <tr key={item.id}>
                          <td className="border border-gray-300 px-2 py-1 font-mono">{item.ap.invoiceNumber}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(item.amount)}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right">{item.withholdingTaxRate}%</td>
                          <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(item.withholdingTaxAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="text-xs mb-8">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความเป็นจริงทุกประการ</div>

              <div className="grid grid-cols-2 gap-16 text-sm text-center">
                <div>
                  <div className="border-b border-gray-400 mb-2 pb-8"></div>
                  <div className="text-gray-600">ลงชื่อ ผู้จ่ายเงิน</div>
                  <div className="text-gray-500 text-xs mt-1">({COMPANY.name})</div>
                </div>
                <div>
                  <div className="text-gray-600">วันที่ {fmt(payment.paymentDate)}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        .wht-page-break {
          page-break-before: always;
        }
        @media print {
          aside { display: none !important; }
          html, body, main { background-color: white !important; }
          main { margin-left: 0 !important; }
          main > div { padding: 0 !important; background-color: white !important; }
          html, body {
            width: 210mm;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
