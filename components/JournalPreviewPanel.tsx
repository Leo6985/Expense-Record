import { formatCurrency } from "@/lib/utils";

export type JournalPreviewLine = { code: string; name: string; debit: number; credit: number };

export default function JournalPreviewPanel({ lines }: { lines: JournalPreviewLine[] }) {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3 text-xs">
      <div className="font-medium text-gray-600 mb-1.5">ตัวอย่างการบันทึกบัญชี (เดบิต/เครดิต)</div>
      <table className="w-full">
        <thead>
          <tr className="text-gray-500 border-b border-blue-200">
            <th className="text-left py-1 font-medium">บัญชี</th>
            <th className="text-right py-1 font-medium">เดบิต</th>
            <th className="text-right py-1 font-medium">เครดิต</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-blue-100 last:border-0">
              <td className="py-1 text-gray-700">
                <span className="font-mono text-gray-400 mr-1.5">{l.code}</span>
                {l.name}
              </td>
              <td className="py-1 text-right text-gray-800">{l.debit ? `฿${formatCurrency(l.debit)}` : ""}</td>
              <td className="py-1 text-right text-gray-800">{l.credit ? `฿${formatCurrency(l.credit)}` : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-gray-800 border-t border-blue-200">
            <td className="py-1">รวม</td>
            <td className="py-1 text-right">฿{formatCurrency(totalDebit)}</td>
            <td className="py-1 text-right">฿{formatCurrency(totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
