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
type PendingKey = Parameters<typeof saveKey>[0] & {
  name: string;
  email: string;
  algorithm: string;
  expiresAt: string | null;
  fingerprint: string;
};

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
  const [revocationCertificate, setRevocationCertificate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState<PendingKey | null>(null);
  const [passphraseSaved, setPassphraseSaved] = useState(false);
  const [revocationSaved, setRevocationSaved] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setStatus("Generating key in your browser…");
      const keyExpirationTime = EXPIRATIONS[expiration].seconds;
      const generated = await openpgp.generateKey({
        ...ALGORITHMS[algorithm].genOptions,
        userIDs: [{ name, email }],
        passphrase,
        keyExpirationTime,
        format: "armored",
      });
      const publicKeyObj = await openpgp.readKey({ armoredKey: generated.publicKey });

      setPendingKey({
        title,
        details: details || null,
        name,
        email,
        algorithm: ALGORITHMS[algorithm].label,
        expiresAt: keyExpirationTime ? new Date(Date.now() + keyExpirationTime * 1000).toISOString() : null,
        fingerprint: publicKeyObj.getFingerprint(),
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
      });
      setRevocationCertificate(generated.revocationCertificate);
      setShowPassphrase(true);
      setPassphraseSaved(false);
      setRevocationSaved(false);
      setStatus("Key generated locally. Save both recovery artifacts before storing the encrypted key.");
    } catch {
      setStatus("Failed to generate key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!pendingKey || !passphraseSaved || !revocationSaved) return;
    setBusy(true);
    try {
      setStatus("Validating and saving encrypted key material…");
      await saveKey({
        title: pendingKey.title,
        details: pendingKey.details,
        publicKey: pendingKey.publicKey,
        privateKey: pendingKey.privateKey,
      });
      setPassphrase("");
      setRevocationCertificate("");
      setPendingKey(null);
      setStatus("Key saved after server-side OpenPGP validation. Recovery artifacts stayed in your browser.");
      router.push("/dashboard");
    } catch {
      setStatus("Failed to validate or save key. Your local recovery artifacts have not been sent to the server.");
    } finally {
      setBusy(false);
    }
  }

  if (pendingKey) {
    return (
      <section className="flex flex-col gap-5 max-w-3xl">
        <div>
          <h2 className="m-0" style={{ fontSize: 28, marginBottom: 8 }}>
            Save your recovery artifacts before storing this key
          </h2>
          <p className="text-sm m-0 text-muted">
            Neither the passphrase nor the revocation certificate will be stored by the server for new keys.
          </p>
        </div>

        <div className="field">
          <label htmlFor="generated-passphrase">Passphrase</label>
          <div className="flex gap-2 items-center">
            <input id="generated-passphrase" value={passphrase} readOnly type={showPassphrase ? "text" : "password"} className="input mono flex-1" />
            <CopyButton text={passphrase} />
            <button type="button" className="btn btn-secondary" onClick={() => setShowPassphrase((value) => !value)}>{showPassphrase ? "Hide" : "Show"}</button>
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={passphraseSaved} onChange={(event) => setPassphraseSaved(event.target.checked)} style={{ marginTop: 3 }} />
          <span>I have copied or stored the passphrase somewhere safe.</span>
        </label>

        <div className="field">
          <div className="flex items-center justify-between mb-2"><label htmlFor="generated-revocation">Revocation certificate</label><CopyButton text={revocationCertificate} /></div>
          <textarea id="generated-revocation" value={revocationCertificate} readOnly rows={8} className="input mono text-xs" />
          <p className="text-xs text-muted m-0 mt-2">Keep this separately. Anyone who obtains it can permanently revoke this key.</p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={revocationSaved} onChange={(event) => setRevocationSaved(event.target.checked)} style={{ marginTop: 3 }} />
          <span>I have copied or stored the revocation certificate somewhere safe.</span>
        </label>

        {status && <p className="text-[12.5px] text-muted m-0">{status}</p>}
        <div className="flex gap-3">
          <button type="button" disabled={!passphraseSaved || !revocationSaved || busy} className="btn btn-primary" onClick={handleSave}>{busy ? "Saving…" : "Save key to vault"}</button>
          <button type="button" disabled={busy} className="btn btn-secondary" onClick={() => { if (window.confirm("Discard this generated key and its unsaved recovery artifacts?")) { setPendingKey(null); setPassphraseSaved(false); setRevocationSaved(false); setRevocationCertificate(""); setStatus(null); } }}>Discard generated key</button>
        </div>
      </section>
    );
  }

  const kicker = { fontSize: 13, letterSpacing: ".06em", textTransform: "uppercase" as const, fontFamily: "var(--font-heading)", fontWeight: 800 };

  return (
    <form onSubmit={handleGenerate} className="flex flex-col gap-8 max-w-3xl">
      <section>
        <div className="flex items-center gap-2.5 mb-4"><span style={kicker}>01 · Identity</span><div className="flex-1" style={{ height: 2, background: "var(--color-divider)" }} /></div>
        <div className="flex flex-col gap-4">
          <div className="field"><label htmlFor="g-title">Title</label><input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Release signing key" required className="input" /></div>
          <div className="field"><label htmlFor="g-details">Details <span className="normal-case text-muted font-normal">— optional</span></label><textarea id="g-details" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Notes about this key" rows={2} className="input" /></div>
          <div className="field"><label htmlFor="g-name">Name</label><input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required className="input" /></div>
          <div className="field"><label htmlFor="g-email">Key email</label><input id="g-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="ada@lovelace.dev" required className="input" /></div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2.5 mb-4"><span style={kicker}>02 · Security</span><div className="flex-1" style={{ height: 2, background: "var(--color-divider)" }} /></div>
        <div className="flex flex-col gap-4">
          <div className="field"><label>Algorithm</label><div className="flex flex-col gap-px" style={{ border: "1px solid var(--color-divider)", background: "var(--color-divider)" }}>{Object.entries(ALGORITHMS).map(([key, { label }]) => (<label key={key} className="keyrow flex items-center gap-3 px-3.5 py-2.5 cursor-pointer" style={{ background: algorithm === key ? "color-mix(in srgb,var(--color-accent) 7%,var(--color-bg))" : "var(--color-bg)" }}><input type="radio" name="algo" checked={algorithm === key} onChange={() => setAlgorithm(key as AlgorithmKey)} style={{ accentColor: "var(--color-accent)", width: 15, height: 15, flexShrink: 0 }} /><span className="text-[13.5px] font-semibold whitespace-nowrap" style={{ fontFamily: "var(--font-heading)" }}>{label}</span></label>))}</div></div>
          <div className="field"><label>Expires</label><div className="seg flex">{Object.entries(EXPIRATIONS).map(([key, { label }]) => (<label key={key} className="seg-opt flex-1"><input type="radio" name="exp" checked={expiration === key} onChange={() => setExpiration(key as ExpirationKey)} />{label}</label>))}</div></div>
          <div className="field"><label htmlFor="g-pass">Passphrase <span className="normal-case text-muted font-normal">— protects the private key</span></label><div className="flex gap-2"><input id="g-pass" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} type={showPassphrase ? "text" : "password"} placeholder="8+ characters" minLength={8} required className="input mono flex-1" /><button type="button" onClick={() => { setPassphrase(generatePassphrase()); setShowPassphrase(true); }} className="btn btn-secondary whitespace-nowrap">Generate</button></div>{passphrase && <div className="flex items-center gap-4 mt-2.5 text-xs text-muted"><button type="button" onClick={() => setShowPassphrase((v) => !v)} className="lnk">{showPassphrase ? "Hide" : "Show"}</button><CopyButton text={passphrase} /><span>Keep it safe — the server will never receive it.</span></div>}</div>
        </div>
      </section>

      <div style={{ height: 2, background: "var(--color-divider)" }} />
      <div className="flex items-center justify-between">{status ? <p className="text-[12.5px] text-muted m-0">{status}</p> : <span />}<button type="submit" disabled={busy} className="btn btn-primary" style={{ minWidth: 190 }}>{busy ? "Working…" : "Generate key"}</button></div>
    </form>
  );
}
