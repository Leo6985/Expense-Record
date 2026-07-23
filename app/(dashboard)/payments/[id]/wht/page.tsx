import { getPayment } from "@/actions/payments";
import { notFound } from "next/navigation";
import DownloadCertificate from "./DownloadCertificate";
import type { WHTCertificateData } from "@/lib/pdf";

export default async function WHTCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = await getPayment(id);
  if (!payment) notFound();

  type Item = (typeof payment.prep.items)[number];
  const byVendor = new Map<string, { vendor: Item["ap"]["vendor"]; items: Item[] }>();
  for (const item of payment.prep.items) {
    if (item.withholdingTaxAmount <= 0) continue;
    const vId = item.ap.vendor.id;
    if (!byVendor.has(vId)) byVendor.set(vId, { vendor: item.ap.vendor, items: [] });
    byVendor.get(vId)!.items.push(item);
  }
  const grouped = Array.from(byVendor.values());

  if (grouped.length === 0) {
    return (
      <div className="p-10 text-center text-gray-400 text-sm">
        การชำระเงินนี้ไม่มีรายการหัก ณ ที่จ่าย จึงไม่สามารถออกหนังสือรับรองได้
      </div>
    );
  }

  const certs: WHTCertificateData[] = grouped.map((cert, certIdx) => ({
    certNumber: `${payment.paymentNumber}-${String(certIdx + 1).padStart(2, "0")}`,
    paymentDate: payment.paymentDate.toISOString(),
    vendor: {
      name: cert.vendor.name,
      address: cert.vendor.address,
      taxId: cert.vendor.taxId,
    },
    items: cert.items.map((item) => ({
      invoiceNumber: item.ap.invoiceNumber,
      amount: item.amount,
      withholdingTaxRate: item.withholdingTaxRate,
      withholdingTaxAmount: item.withholdingTaxAmount,
    })),
  }));

  return <DownloadCertificate paymentNumber={payment.paymentNumber} certs={certs} />;
}
