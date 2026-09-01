import { auth } from "@/auth";
import { TabNav } from "./TabNav";
import { logout } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = session!.user.role === "admin";
  const initials = (session!.user.email ?? "??").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: "236px 1fr" }}>
      <aside className="flex flex-col py-[22px]" style={{ borderRight: "2px solid var(--color-divider)" }}>
        <div className="flex items-center gap-[11px] px-5 pb-[22px]">
          <span
            className="inline-flex w-[30px] h-[30px] items-center justify-center"
            style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 18 8.5-8.5" /><circle cx="16.5" cy="7.5" r="4.5" /><path d="m2 18 3 3" /><path d="m5 15 3 3" />
            </svg>
          </span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>
            PGPKEYGEN
          </span>
        </div>
        <div style={{ height: 2, background: "var(--color-divider)", margin: "0 20px 14px" }} />
        <div
          className="px-5 pb-2"
          style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}
        >
          Vault
        </div>
        <TabNav isAdmin={isAdmin} />
        <div className="mt-auto px-5">
          <div style={{ height: 2, background: "var(--color-divider)", marginBottom: 14 }} />
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="inline-flex w-[30px] h-[30px] items-center justify-center text-xs"
              style={{ background: "var(--color-neutral-800)", color: "var(--color-bg)", fontFamily: "var(--font-heading)", fontWeight: 700 }}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                {session!.user.email}
              </div>
              {isAdmin && (
                <div style={{ fontSize: "10.5px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
                  Admin
                </div>
              )}
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="btn btn-secondary btn-block">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex flex-col p-8">
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-6 flex-1">{children}</div>
      </main>
    </div>
  );
}
