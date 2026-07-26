import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-svh w-full flex-col gap-4 bg-background p-3 md:flex-row md:gap-5 md:p-5">
      <AppSidebar userEmail={user.email ?? ""} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] bg-content-panel">
        <div className="flex-1 overflow-y-auto p-5 md:p-8">{children}</div>
      </main>
    </div>
  );
}
