import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { name?: string; email?: string; role?: string };
  const role = user?.role ?? "PURCHASING";
  const userName = user?.name ?? "";

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar role={role} userName={userName} />
      <main className="ml-60 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
