import { TableSkeleton } from "@/components/TableSkeleton";
export default function Loading() {
  return <TableSkeleton cols={6} rows={8} hasSearch={false} />;
}
