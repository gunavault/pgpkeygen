export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return (error as { code?: unknown }).code === "23505";
}
