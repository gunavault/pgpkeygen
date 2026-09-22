const MAX_FILENAME_STEM = 64;

export function sanitizeKeyFilenamePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FILENAME_STEM)
    .replace(/-+$/g, "");

  return normalized || "key";
}

export function fingerprintFilenameSuffix(fingerprint: string): string {
  const normalized = fingerprint.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  return normalized.slice(-16) || "UNKNOWN";
}

export function keyExportFilenames(name: string, fingerprint: string) {
  const stem = sanitizeKeyFilenamePart(name);
  const suffix = fingerprintFilenameSuffix(fingerprint);

  return {
    publicKey: `${stem}-${suffix}.pub.asc`,
    privateKey: `${stem}-${suffix}.sec.asc`,
    revocationCertificate: `${stem}-${suffix}.rev.asc`,
  };
}
