import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const { error, registered } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form action={login} className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Sign in</h1>

        {registered && (
          <p className="text-sm text-green-600">Account created. Sign in below.</p>
        )}
        {error === "ratelimited" && (
          <p className="text-sm text-red-600">Too many attempts. Try again in a few minutes.</p>
        )}
        {error === "invalid" && <p className="text-sm text-red-600">Invalid email or password.</p>}

        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="border rounded px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="border rounded px-3 py-2"
        />
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          Sign in
        </button>

        <p className="text-sm text-zinc-500">
          No account?{" "}
          <Link href="/register" className="underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
