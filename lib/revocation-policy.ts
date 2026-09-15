export function chooseRevocationCertificate(
  supplied: string | null | undefined,
  legacyStored: string | null | undefined,
): string {
  const provided = supplied?.trim();
  if (provided) return provided;

  const legacy = legacyStored?.trim();
  if (legacy) return legacy;

  throw new Error("A revocation certificate is required");
}
