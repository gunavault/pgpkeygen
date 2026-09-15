import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const { error, registered } = await searchParams;

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
            Keys are created in your browser. Passphrases stay client-side; optional recovery encrypts them in the browser before any recovery data is stored.
          </p>
        </div>
        <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
          Curve25519 · RSA-4096 · Client-side generation
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full flex flex-col gap-[18px]" style={{ maxWidth: 340 }}>
          <LoginForm initialError={error ?? null} registered={Boolean(registered)} />
          <div style={{ height: 2, background: "var(--color-divider)" }} />
          <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
            No account?{" "}
            <Link href="/register" className="lnk">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
