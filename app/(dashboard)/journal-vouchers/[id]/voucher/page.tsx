import { getJournalVoucher } from "@/actions/journal-vouchers";
import { notFound } from "next/navigation";
import DownloadVoucher from "./DownloadVoucher";
import type { JournalVoucherData } from "@/lib/pdf";

export default async function JournalVoucherPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const voucher = await getJournalVoucher(id);
  if (!voucher) notFound();

  const data: JournalVoucherData = {
    voucherNumber: voucher.voucherNumber,
    voucherDate: voucher.voucherDate.toISOString(),
    description: voucher.description,
    notes: voucher.notes,
    status: voucher.status,
    createdByName: voucher.createdByName,
    approvedByName: voucher.approvedByName,
    lines: voucher.lines.map((l) => ({
      accountCode: l.account.code,
      accountName: l.account.name,
      department: l.department,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
  };

  return <DownloadVoucher data={data} />;
}
