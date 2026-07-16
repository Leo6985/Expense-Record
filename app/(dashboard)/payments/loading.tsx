import { TableSkeleton } from "@/components/TableSkeleton";
export default function Loading() {
  return <TableSkeleton cols={6} rows={6} hasSearch={false} />;
}
