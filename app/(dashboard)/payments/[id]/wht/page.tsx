import { getPayment } from "@/actions/payments";
import { formatCurrency, numberToThaiBahtText } from "@/lib/utils";
import { notFound } from "next/navigation";
import AutoPrint from "./PrintButton";

const COMPANY = {
  name: "บริษัท เคมเทค อินโนเวชั่น จำกัด",
  address: "333/37 หมู่ 2 ต.มาบยางพร อ.ปลวกแดง จ.ระยอง 21140",
  taxId: "0205555008617",
};

const PND_OPTIONS = ["ภ.ง.ด.1ก", "ภ.ง.ด.1ก พิเศษ", "ภ.ง.ด.2", "ภ.ง.ด.3", "ภ.ง.ด.2ก", "ภ.ง.ด.3ก", "ภ.ง.ด.53"];

function Checkbox({ checked }: { checked?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-3 h-3 border border-black text-[9px] leading-none shrink-0">
      {checked ? "✓" : ""}
    </span>
  );
}

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
            <div className="max-w-3xl mx-auto px-8 py-6 text-[11px] leading-snug">
              <div className="border-2 border-black">
                {/* Copy note + book/running number */}
                <div className="flex justify-between px-2 pt-1.5">
                  <div className="text-[9px] leading-tight">
                    <div>ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
                    <div>ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</div>
                  </div>
                  <div className="text-[10px] text-right whitespace-nowrap">
                    <div>เล่มที่ ..........................</div>
                    <div>เลขที่ {certNumber}</div>
                  </div>
                </div>

                {/* Title */}
                <div className="text-center mt-1 mb-1.5">
                  <div className="font-bold text-sm">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
                  <div className="text-[11px]">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
                </div>

                {/* Payer */}
                <div className="border-t-2 border-black px-2 py-1.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -</span>
                    <span>
                      เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*{" "}
                      <span className="font-mono border-b border-black px-1">{COMPANY.taxId}</span>
                    </span>
                  </div>
                  <div>ชื่อ {COMPANY.name}</div>
                  <div className="text-[9px] text-gray-500 -mt-0.5">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
                  <div>ที่อยู่ {COMPANY.address}</div>
                  <div className="text-[9px] text-gray-500 -mt-0.5">
                    (ให้ระบุชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)
                  </div>
                </div>

                {/* Payee */}
                <div className="border-t-2 border-black px-2 py-1.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">ผู้ถูกหักภาษี ณ ที่จ่าย : -</span>
                    <span>
                      เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*{" "}
                      <span className="font-mono border-b border-black px-1">{cert.vendor.taxId ?? ""}</span>
                    </span>
                  </div>
                  <div>ชื่อ {cert.vendor.name}</div>
                  <div className="text-[9px] text-gray-500 -mt-0.5">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
                  <div>ที่อยู่ {cert.vendor.address ?? "-"}</div>
                  <div className="text-[9px] text-gray-500 -mt-0.5">
                    (ให้ระบุชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)
                  </div>
                </div>

                {/* Running number in PND filing */}
                <div className="border-t-2 border-black px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      ลำดับที่ <span className="inline-block border-b border-black w-14 text-center">&nbsp;</span> ในแบบ
                    </span>
                    {PND_OPTIONS.map((label, i) => (
                      <span key={label} className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Checkbox />({i + 1}) {label}
                      </span>
                    ))}
                  </div>
                  <div className="text-[9px] text-gray-500 mt-0.5">
                    (ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)
                  </div>
                </div>

                {/* Income type table */}
                <table className="w-full border-collapse text-[10.5px]">
                  <thead>
                    <tr>
                      <th className="border-t-2 border-black px-2 py-1 text-left font-normal align-bottom">
                        ประเภทเงินได้พึงประเมินที่จ่าย
                      </th>
                      <th className="border-t-2 border-l-2 border-black px-1 py-1 text-center font-normal w-20 align-bottom">
                        วัน เดือน หรือปีภาษี ที่จ่าย
                      </th>
                      <th className="border-t-2 border-l-2 border-black px-1 py-1 text-center font-normal w-20 align-bottom">
                        จำนวนเงินที่จ่าย
                      </th>
                      <th className="border-t-2 border-l-2 border-black px-1 py-1 text-center font-normal w-20 align-bottom">
                        ภาษีที่หัก และนำส่งไว้
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border-t border-black px-2 py-1 align-top">
                        1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40(1)
                      </td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                    </tr>
                    <tr>
                      <td className="border-t border-black px-2 py-1 align-top">
                        2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40(2)
                      </td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                    </tr>
                    <tr>
                      <td className="border-t border-black px-2 py-1 align-top">3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40(3)</td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                    </tr>
                    <tr>
                      <td className="border-t border-black px-2 py-1 align-top">
                        <div>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40(4)(ก)</div>
                        <div>(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40(4)(ข)</div>
                      </td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                    </tr>
                    <tr>
                      <td className="border-t border-black px-2 py-1 align-top">
                        5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่ายตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล
                        ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค
                        ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ
                        <div className="mt-0.5 font-medium">(ระบุ) ค่าจ้างทำของ / ค่าบริการ อัตราร้อยละ {rateLabel}</div>
                      </td>
                      <td className="border-t border-l-2 border-black px-1 py-1 text-center align-top">{fmt(payment.paymentDate)}</td>
                      <td className="border-t border-l-2 border-black px-1 py-1 text-right align-top">{formatCurrency(totalAmount)}</td>
                      <td className="border-t border-l-2 border-black px-1 py-1 text-right align-top font-medium">
                        {formatCurrency(totalWHT)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-t border-black px-2 py-1 align-top">6. อื่น ๆ (ระบุ) ....................................</td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                      <td className="border-t border-l-2 border-black"></td>
                    </tr>
                    <tr>
                      <td className="border-t-2 border-black px-2 py-1 text-right font-semibold" colSpan={2}>
                        รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                      </td>
                      <td className="border-t-2 border-l-2 border-black px-1 py-1 text-right font-semibold">
                        {formatCurrency(totalAmount)}
                      </td>
                      <td className="border-t-2 border-l-2 border-black px-1 py-1 text-right font-semibold">
                        {formatCurrency(totalWHT)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="border-t-2 border-black px-2 py-1 font-semibold">
                  รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <span className="font-normal">{numberToThaiBahtText(totalWHT)}</span>
                </div>

                <div className="border-t-2 border-black px-2 py-1">
                  เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน.......................บาท กองทุนประกันสังคม.....................บาท
                  กองทุนสำรองเลี้ยงชีพ......................บาท
                </div>

                <div className="border-t-2 border-black px-2 py-1.5 flex flex-wrap items-center gap-3">
                  <span className="font-semibold">ผู้จ่ายเงิน</span>
                  <span className="inline-flex items-center gap-1">
                    <Checkbox checked />
                    (1) หัก ณ ที่จ่าย
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Checkbox />
                    (2) ออกให้ตลอดไป
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Checkbox />
                    (3) ออกให้ครั้งเดียว
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Checkbox />
                    (4) อื่น ๆ (ระบุ)................................
                  </span>
                </div>

                {/* Warning + certification/signature */}
                <div className="border-t-2 border-black grid grid-cols-2">
                  <div className="border-r-2 border-black px-2 py-2 text-[9px]">
                    <div className="font-semibold mb-0.5">คำเตือน</div>
                    <div>
                      ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
                      ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
                    </div>
                  </div>
                  <div className="px-2 py-2 text-center">
                    <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
                    <div className="mt-5">ลงชื่อ.................................................ผู้จ่ายเงิน</div>
                    <div className="mt-1">......../.........../.......... (วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
                    <div className="text-[9px] text-gray-500 mt-1">ประทับตรานิติบุคคล (ถ้ามี)</div>
                  </div>
                </div>

                {/* Footnote */}
                <div className="border-t-2 border-black px-2 py-1.5 text-[9px] text-gray-700">
                  <div>หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง</div>
                  <div>1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง</div>
                  <div>2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</div>
                  <div>3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</div>
                </div>
              </div>

              {/* Invoice breakdown attachment — internal reference only, not part of the official form,
                  needed when one certificate combines multiple invoices from the same vendor */}
              {cert.items.length > 1 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-1">
                    เอกสารแนบ: รายละเอียดใบแจ้งหนี้ที่รวมอยู่ในหนังสือรับรองฉบับนี้
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
            </div>
          </div>
        );
      })}

      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
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
