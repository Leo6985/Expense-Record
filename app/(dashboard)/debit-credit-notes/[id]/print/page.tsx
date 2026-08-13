import { getDebitCreditNote } from "@/actions/debit-credit-notes";
import { formatDate, formatCurrency } from "@/lib/utils";
import { notFound } from "next/navigation";
import AutoPrint from "./PrintButton";

const TYPE_TITLE: Record<string, { th: string; en: string }> = {
  DEBIT: { th: "ใบเพิ่มหนี้", en: "Debit Note" },
  CREDIT: { th: "ใบลดหนี้", en: "Credit Note" },
};

export default async function DebitCreditNotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getDebitCreditNote(id);
  if (!note) notFound();

  const fmt = (d: Date | null | undefined) =>
    d ? new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", calendar: "gregory" }).format(new Date(d)) : null;

  const title = TYPE_TITLE[note.type] ?? { th: note.type, en: note.type };
  const docDate = fmt(note.noteDate);
  const createdDate = fmt(note.createdAt);
  const approvedDate = fmt(note.approvedAt);
  const sign = note.type === "DEBIT" ? "+" : "-";
  const correctedInvoiceAmount =
    note.type === "DEBIT" ? note.invoice.amount + note.amount : note.invoice.amount - note.amount;

  return (
    <div className="print-page bg-white">
      <AutoPrint />

      <div className="max-w-4xl mx-auto px-10 py-8">

        {/* Header: company left, document title right */}
        <div className="flex items-start justify-between mb-8 pb-5 border-b-2 border-gray-800">
          <div>
            <div className="text-base font-bold text-gray-900 leading-snug">
              บริษัท เคมเทค อินโนเวชั่น จำกัด
            </div>
            <div className="text-xs text-gray-600 mt-1 leading-relaxed">
              333/37 หมู่ 2 ต.มาบยางพร อ.ปลวกแดง จ.ระยอง 21140
            </div>
            <div className="text-xs text-gray-600">
              เลขประจำตัวผู้เสียภาษี 0205555008617
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              โทร 033-650-796 &nbsp;|&nbsp; purchase@chemtech-th.com
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 tracking-wide">{title.th}</div>
            <div className="text-sm text-gray-500 mt-0.5">{title.en}</div>
            <div className="mt-2 text-sm">
              <span className="text-gray-500">เลขที่ </span>
              <span className="font-bold font-mono text-blue-700">{note.noteNumber}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">วันที่ </span>
              <span className="font-medium">{docDate}</span>
            </div>
          </div>
        </div>

        {/* Customer & reference info */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="border border-gray-300 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ลูกค้า</div>
            <div className="font-semibold text-gray-900">{note.invoice.customer.name}</div>
            {note.invoice.customer.address && (
              <div className="text-gray-600 text-xs mt-1 leading-relaxed">{note.invoice.customer.address}</div>
            )}
            {note.invoice.customer.taxId && (
              <div className="text-gray-500 text-xs mt-1">
                เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{note.invoice.customer.taxId}</span>
              </div>
            )}
          </div>

          <div className="border border-gray-300 rounded-lg p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">อ้างอิงใบกำกับภาษี</div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">เลขที่ใบกำกับภาษี</span>
                <span className="font-mono font-semibold text-gray-800">{note.invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">วันที่ใบกำกับภาษี</span>
                <span className="font-medium">{formatDate(note.invoice.invoiceDate)}</span>
              </div>
              {note.reason && (
                <div className="pt-1 border-t border-gray-100">
                  <span className="text-gray-500 block text-xs mb-0.5">เหตุผล</span>
                  <span className="text-gray-700">{note.reason}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="mb-6">
          <div className="font-semibold text-gray-800 mb-2 text-sm border-b border-gray-300 pb-1">รายละเอียด</div>
          <div className="border border-gray-300 rounded-lg p-3 min-h-16 text-sm text-gray-700 whitespace-pre-wrap">
            {note.detail || "-"}
          </div>
        </div>

        {/* Value comparison table — required per มาตรา 86/9, 86/10 แห่งประมวลรัษฎากร */}
        <table className="w-full text-sm border-collapse mb-6">
          <tbody>
            <tr>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-600 bg-gray-50">
                มูลค่าใบกำกับภาษีฉบับเดิม (ก่อนภาษีมูลค่าเพิ่ม)
              </td>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-700 w-40">
                {formatCurrency(note.invoice.amount)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-600 bg-gray-50">
                มูลค่าใบกำกับภาษีที่ถูกต้อง (ก่อนภาษีมูลค่าเพิ่ม)
              </td>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-700">
                {formatCurrency(correctedInvoiceAmount)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-600 bg-gray-50">ผลต่าง</td>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-700">
                {sign}{formatCurrency(note.amount)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-600 bg-gray-50">
                ยอดรวมมูลค่าใบ{note.type === "DEBIT" ? "เพิ่ม" : "ลด"}หนี้ (ก่อนภาษีมูลค่าเพิ่ม)
              </td>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-700">
                {sign}{formatCurrency(note.amount)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-600 bg-gray-50">
                ภาษีมูลค่าเพิ่ม
              </td>
              <td className="border border-gray-300 px-3 py-2.5 text-right text-gray-700">
                {sign}{formatCurrency(note.vatAmount)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2.5 text-right font-semibold text-gray-700 bg-gray-50">
                จำนวนเงินรวมทั้งสิ้น ({note.type === "DEBIT" ? "เพิ่มหนี้" : "ลดหนี้"})
              </td>
              <td className={`border border-gray-300 px-3 py-2.5 text-right font-bold text-base ${note.type === "DEBIT" ? "text-orange-700" : "text-teal-700"}`}>
                {sign}{formatCurrency(note.totalAmount)}
              </td>
            </tr>
          </tbody>
        </table>

        {note.notes && (
          <div className="mb-6">
            <div className="font-semibold text-gray-800 mb-2 text-sm">หมายเหตุ</div>
            <div className="border border-gray-300 rounded-lg p-3 text-sm text-gray-600">{note.notes}</div>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-16 mt-12 text-sm text-center">
          <div>
            <div className="border-b-2 border-gray-400 mb-3 pb-10"></div>
            <div className="text-gray-600 font-medium">ผู้จัดทำ</div>
            <div className="text-gray-800 mt-1">{note.createdByName || "................................"}</div>
            <div className="text-gray-500 text-xs mt-1">{createdDate ?? "..................."}</div>
          </div>
          <div>
            <div className="border-b-2 border-gray-400 mb-3 pb-10"></div>
            <div className="text-gray-600 font-medium">ผู้อนุมัติ</div>
            <div className="text-gray-800 mt-1">{note.approvedByName || "................................"}</div>
            <div className="text-gray-500 text-xs mt-1">{approvedDate ?? "..................."}</div>
          </div>
        </div>
      </div>

      <style>{`
        @page {
          size: A4 portrait;
          margin: 15mm;
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
