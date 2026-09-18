import { PasswordChangeForm } from "./PasswordChangeForm";

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--color-neutral-600)",
            marginBottom: 6,
          }}
        >
          Account
        </div>
        <h1 className="text-3xl m-0">Password</h1>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl">
          Rotate your account password without re-encrypting each recovered PGP passphrase.
          The browser verifies that the same vault key survives the re-wrap before anything is
          committed.
        </p>
      </div>

      <PasswordChangeForm />
    </div>
  );
}
