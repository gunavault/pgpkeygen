import { auth } from "@/auth";
import { TabNav } from "./TabNav";
import { logout } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{session!.user.email}</h1>
        <form action={logout}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </div>

      <TabNav isAdmin={session!.user.role === "admin"} />

      {children}
    </div>
  );
}
