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

  const kicker = { fontSize: 13, letterSpacing: ".06em", textTransform: "uppercase" as const, fontFamily: "var(--font-heading)", fontWeight: 800 };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 max-w-3xl">
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <span style={kicker}>01 · Identity</span>
          <div className="flex-1" style={{ height: 2, background: "var(--color-divider)" }} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="g-title">Title</label>
            <input
              id="g-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Release signing key"
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="g-details">
              Details <span className="normal-case text-muted font-normal">— optional</span>
            </label>
            <textarea
              id="g-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Notes about this key"
              rows={2}
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="g-name">Name</label>
            <input
              id="g-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              required
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="g-email">Key email</label>
            <input
              id="g-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="ada@lovelace.dev"
              required
              className="input"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <span style={kicker}>02 · Security</span>
          <div className="flex-1" style={{ height: 2, background: "var(--color-divider)" }} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="field">
            <label>Algorithm</label>
            <div className="flex flex-col gap-px" style={{ border: "1px solid var(--color-divider)", background: "var(--color-divider)" }}>
              {Object.entries(ALGORITHMS).map(([key, { label }]) => (
                <label
                  key={key}
                  className="keyrow flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
                  style={{ background: algorithm === key ? "color-mix(in srgb,var(--color-accent) 7%,var(--color-bg))" : "var(--color-bg)" }}
                >
                  <input
                    type="radio"
                    name="algo"
                    checked={algorithm === key}
                    onChange={() => setAlgorithm(key as AlgorithmKey)}
                    style={{ accentColor: "var(--color-accent)", width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span className="text-[13.5px] font-semibold whitespace-nowrap" style={{ fontFamily: "var(--font-heading)" }}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Expires</label>
            <div className="seg flex">
              {Object.entries(EXPIRATIONS).map(([key, { label }]) => (
                <label key={key} className="seg-opt flex-1">
                  <input
                    type="radio"
                    name="exp"
                    checked={expiration === key}
                    onChange={() => setExpiration(key as ExpirationKey)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="g-pass">
              Passphrase <span className="normal-case text-muted font-normal">— protects the private key</span>
            </label>
            <div className="flex gap-2">
              <input
                id="g-pass"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                type={showPassphrase ? "text" : "password"}
                placeholder="8+ characters"
                minLength={8}
                required
                className="input mono flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  setPassphrase(generatePassphrase());
                  setShowPassphrase(true);
                }}
                className="btn btn-secondary whitespace-nowrap"
              >
                Generate
              </button>
            </div>
            {passphrase && (
              <div className="flex items-center gap-4 mt-2.5 text-xs text-muted">
                <button type="button" onClick={() => setShowPassphrase((v) => !v)} className="lnk">
                  {showPassphrase ? "Hide" : "Show"}
                </button>
                <CopyButton text={passphrase} />
                <span>Save it — it can&apos;t be recovered.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={{ height: 2, background: "var(--color-divider)" }} />

      <div className="flex items-center justify-between">
        {status ? (
          <p className="text-[12.5px] text-muted m-0">{status}</p>
        ) : (
          <span />
        )}
        <button type="submit" disabled={busy} className="btn btn-primary" style={{ minWidth: 190 }}>
          {busy ? "Working…" : "Generate & save"}
        </button>
      </div>
    </form>
  );
}
