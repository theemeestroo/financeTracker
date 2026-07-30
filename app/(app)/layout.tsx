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
    <div className="relative min-h-svh w-full overflow-hidden bg-background">
      {/* Ambient brand-colour glow behind the floating sidebar/content
          panels — decorative only (aria-hidden, pointer-events-none), and
          only ever visible through the gap/edges around those panels since
          both have opaque backgrounds. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-16 size-96 rounded-full bg-primary/25 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-10 size-96 rounded-full bg-[var(--primary-2)]/20 blur-[110px]"
      />
      <div className="relative flex min-h-svh w-full flex-col gap-4 p-3 md:flex-row md:gap-5 md:p-5">
        <AppSidebar userEmail={user.email ?? ""} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] bg-content-panel">
          <div className="flex-1 overflow-y-auto p-5 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
