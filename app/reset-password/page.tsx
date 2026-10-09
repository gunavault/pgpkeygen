import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full flex flex-col gap-[18px]" style={{ maxWidth: 420 }}>
        <div>
          <h2 className="m-0" style={{ fontSize: 28, marginBottom: 4 }}>Reset password</h2>
          <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
            For a forgotten account password.
          </p>
        </div>
        <ResetPasswordForm />
        <div style={{ height: 2, background: "var(--color-divider)" }} />
        <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
          Remembered it? <Link href="/login" className="lnk">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
