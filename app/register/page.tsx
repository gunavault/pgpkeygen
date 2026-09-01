import Link from "next/link";
import { register } from "./actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form action={register} className="w-full max-w-sm flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Create account</h1>

        {error === "ratelimited" && (
          <p className="text-sm text-red-600">Too many attempts. Try again in an hour.</p>
        )}
        {error === "exists" && (
          <p className="text-sm text-red-600">An account with that email already exists.</p>
        )}
        {error === "invalid" && (
          <p className="text-sm text-red-600">Enter a valid email and a password (8+ chars).</p>
        )}

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
          placeholder="Password (min 8 characters)"
          minLength={8}
          required
          className="border rounded px-3 py-2"
        />
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          Register
        </button>

        <p className="text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
