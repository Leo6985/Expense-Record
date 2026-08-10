import { getReceipt } from "@/actions/receipts";
import { notFound } from "next/navigation";
import DownloadVoucher from "./DownloadVoucher";
import type { ReceiptVoucherData } from "@/lib/pdf";

export default async function ReceiptVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) notFound();

  const data: ReceiptVoucherData = {
    receiptNumber: receipt.receiptNumber,
    receiptDate: receipt.receiptDate.toISOString(),
    recordedDate: receipt.recordedDate.toISOString(),
    paymentMethod: receipt.paymentMethod,
    referenceNumber: receipt.referenceNumber,
    companyBankAccount: {
      bankName: receipt.companyBankAccount.bankName,
      accountNo: receipt.companyBankAccount.accountNo,
      accountName: receipt.companyBankAccount.accountName,
    },
    feeAmount: receipt.feeAmount,
    withholdingTaxAmount: receipt.withholdingTaxAmount,
    withholdingTaxCertNumber: receipt.withholdingTaxCertNumber,
    actualReceivedAmount: receipt.actualReceivedAmount,
    shortageOrExcessAmount: receipt.shortageOrExcessAmount,
    createdByName: receipt.createdByName,
    approvedByName: receipt.approvedByName,
    notes: receipt.notes,
    items: receipt.items.map((item) => ({
      invoiceNumber: item.invoice.invoiceNumber,
      customerName: item.invoice.customer.name,
      amount: item.amount,
    })),
  };

  return <DownloadVoucher data={data} />;
}
