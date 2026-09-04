export interface ExportableKey {
  id: string;
  title: string;
  details?: string | null;
  name: string;
  email: string;
  algorithm: string;
  fingerprint: string;
  publicKey: string;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
  createdAt: Date | string;
}

export function formatKeyForExport(key: ExportableKey) {
  const expires = key.expiresAt ? new Date(key.expiresAt).toISOString() : null;
  const revoked = key.revokedAt ? new Date(key.revokedAt).toISOString() : null;
  const created = new Date(key.createdAt).toISOString();
  const status = key.revokedAt ? "Revoked" : "Active";

  return {
    id: key.id,
    title: key.title,
    details: key.details ?? "",
    name: key.name,
    email: key.email,
    algorithm: key.algorithm,
    fingerprint: key.fingerprint,
    status,
    publicKey: key.publicKey,
    expiresAt: expires,
    revokedAt: revoked,
    createdAt: created,
  };
}

export function exportKeysToJSON(keys: ExportableKey[]): string {
  const formatted = keys.map(formatKeyForExport);
  return JSON.stringify(formatted, null, 2);
}

function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportKeysToCSV(keys: ExportableKey[]): string {
  const headers = [
    "ID",
    "Title",
    "Details",
    "Name",
    "Email",
    "Algorithm",
    "Fingerprint",
    "Status",
    "Expires At",
    "Revoked At",
    "Created At",
    "Public Key",
  ];

  const rows = keys.map((key) => {
    const formatted = formatKeyForExport(key);
    return [
      formatted.id,
      formatted.title,
      formatted.details,
      formatted.name,
      formatted.email,
      formatted.algorithm,
      formatted.fingerprint,
      formatted.status,
      formatted.expiresAt ?? "",
      formatted.revokedAt ?? "",
      formatted.createdAt,
      formatted.publicKey,
    ]
      .map(escapeCSVField)
      .join(",");
  });

  return [headers.map(escapeCSVField).join(","), ...rows].join("\n");
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
