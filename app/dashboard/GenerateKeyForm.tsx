"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as openpgp from "openpgp";
import { CopyButton } from "./CopyButton";
import { saveKey } from "./actions";

const PASSPHRASE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";

function generatePassphrase(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSPHRASE_CHARS[b % PASSPHRASE_CHARS.length]).join("");
}

const ALGORITHMS = {
  curve25519: { label: "ECC (Curve25519) — recommended", genOptions: { type: "curve25519" as const } },
  curve448: { label: "ECC (Curve448)", genOptions: { type: "curve448" as const } },
  nistP256: { label: "ECC (NIST P-256)", genOptions: { type: "ecc" as const, curve: "nistP256" as const } },
  nistP384: { label: "ECC (NIST P-384)", genOptions: { type: "ecc" as const, curve: "nistP384" as const } },
  rsa2048: { label: "RSA 2048", genOptions: { type: "rsa" as const, rsaBits: 2048 } },
  rsa4096: { label: "RSA 4096", genOptions: { type: "rsa" as const, rsaBits: 4096 } },
};
type AlgorithmKey = keyof typeof ALGORITHMS;

const EXPIRATIONS = {
  never: { label: "Never", seconds: 0 },
  "1y": { label: "1 year", seconds: 60 * 60 * 24 * 365 },
  "2y": { label: "2 years", seconds: 60 * 60 * 24 * 365 * 2 },
  "4y": { label: "4 years", seconds: 60 * 60 * 24 * 365 * 4 },
};
type ExpirationKey = keyof typeof EXPIRATIONS;

export function GenerateKeyForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [algorithm, setAlgorithm] = useState<AlgorithmKey>("curve25519");
  const [expiration, setExpiration] = useState<ExpirationKey>("never");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setStatus("Generating key in your browser…");
      const keyExpirationTime = EXPIRATIONS[expiration].seconds;

      const { privateKey, publicKey, revocationCertificate } = await openpgp.generateKey({
        ...ALGORITHMS[algorithm].genOptions,
        userIDs: [{ name, email }],
        passphrase,
        keyExpirationTime,
        format: "armored",
      });

      const publicKeyObj = await openpgp.readKey({ armoredKey: publicKey });

      setStatus("Saving…");
      const { emailSent } = await saveKey({
        title,
        details: details || null,
        name,
        email,
        algorithm: ALGORITHMS[algorithm].label,
        expiresAt: keyExpirationTime ? new Date(Date.now() + keyExpirationTime * 1000).toISOString() : null,
        fingerprint: publicKeyObj.getFingerprint(),
        publicKey,
        privateKey,
        revocationCertificate,
        passphrase,
      });

      if (emailSent) {
        setStatus("Key generated and saved. Passphrase emailed to you.");
        setTitle("");
        setDetails("");
        setName("");
        setEmail("");
        setPassphrase("");
        setShowPassphrase(false);
        router.push("/dashboard");
      } else {
        // Don't clear the passphrase or navigate away — Copy/Show above is the
        // only remaining way to get it since the email didn't go out.
        setStatus("Key generated and saved, but the passphrase email failed to send. Copy it above before leaving this page.");
        setShowPassphrase(true);
      }
    } catch {
      setStatus("Failed to generate or save key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm border rounded p-4">
      <h2 className="font-semibold">Generate a new key</h2>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Release signing key)"
        required
        className="border rounded px-3 py-2"
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Details (optional notes about this key)"
        rows={2}
        className="border rounded px-3 py-2"
      />

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        required
        className="border rounded px-3 py-2"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Key email"
        required
        className="border rounded px-3 py-2"
      />

      <label className="text-sm text-zinc-500">
        Algorithm
        <select
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value as AlgorithmKey)}
          className="mt-1 w-full border rounded px-3 py-2"
        >
          {Object.entries(ALGORITHMS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-zinc-500">
        Expires
        <select
          value={expiration}
          onChange={(e) => setExpiration(e.target.value as ExpirationKey)}
          className="mt-1 w-full border rounded px-3 py-2"
        >
          {Object.entries(EXPIRATIONS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            type={showPassphrase ? "text" : "password"}
            placeholder="Passphrase (protects the private key)"
            minLength={8}
            required
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            type="button"
            onClick={() => {
              setPassphrase(generatePassphrase());
              setShowPassphrase(true);
            }}
            className="border rounded px-3 py-2 text-sm whitespace-nowrap"
          >
            Generate
          </button>
        </div>
        {passphrase && (
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <button type="button" onClick={() => setShowPassphrase((v) => !v)} className="underline">
              {showPassphrase ? "Hide" : "Show"}
            </button>
            <CopyButton text={passphrase} />
            <span>Save this somewhere — it can&apos;t be recovered if lost.</span>
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
      >
        {busy ? "Working…" : "Generate & save"}
      </button>
      {status && <p className="text-sm text-zinc-500">{status}</p>}
    </form>
  );
}
