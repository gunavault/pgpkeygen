import Link from "next/link";
import { register } from "./actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex-1 grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div
        className="hidden md:flex flex-col justify-between p-14"
        style={{ borderRight: "2px solid var(--color-divider)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex w-[34px] h-[34px] items-center justify-center"
            style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 18 8.5-8.5" /><circle cx="16.5" cy="7.5" r="4.5" /><path d="m2 18 3 3" /><path d="m5 15 3 3" />
            </svg>
          </span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
            PGPKEYGEN
          </span>
        </div>
        <div style={{ maxWidth: "34ch" }}>
          <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 16 }}>
            Key management
          </div>
          <h1 style={{ fontSize: 46, lineHeight: 1.04, margin: "0 0 18px" }}>
            Generate, store and audit your PGP keys.
          </h1>
          <p className="text-[15px] m-0" style={{ color: "var(--color-neutral-700)" }}>
            Keys are created in your browser. Private-key passphrases never leave your browser and cannot be recovered by the server.
          </p>
        </div>
        <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
          Curve25519 · RSA-4096 · Client-side generation
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form action={register} className="w-full flex flex-col gap-[18px]" style={{ maxWidth: 340 }}>
          <div>
            <h2 className="m-0" style={{ fontSize: 28, marginBottom: 4 }}>
              Create account
            </h2>
            <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
              Start your key vault.
            </p>
          </div>

          {error === "ratelimited" && (
            <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
              Too many attempts. Try again in an hour.
            </p>
          )}
          {error === "exists" && (
            <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
              An account with that email already exists.
            </p>
          )}
          {error === "invalid" && (
            <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
              Enter a valid email and a password (8+ chars).
            </p>
          )}
          {error === "server" && (
            <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
              Registration could not be completed. Please try again later.
            </p>
          )}

          <div className="field">
            <label htmlFor="re-email">Email</label>
            <input id="re-email" name="email" type="email" placeholder="you@example.com" required className="input" />
          </div>
          <div className="field">
            <label htmlFor="re-pass">Password</label>
            <input
              id="re-pass"
              name="password"
              type="password"
              placeholder="8+ characters"
              minLength={8}
              required
              className="input"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            Register
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>

          <div style={{ height: 2, background: "var(--color-divider)" }} />

          <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
            Already have an account?{" "}
            <Link href="/login" className="lnk">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
