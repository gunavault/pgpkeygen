/**
 * Labels which of the two reset secrets is on screen. They share a format,
 * so the tag (and the matching .secret-panel colour) is how users tell the
 * administrator's short-lived reset token from their own recovery code.
 */
export function SecretTag({ kind }: { kind: "token" | "recovery" }) {
  return kind === "token" ? (
    <span className="tag tag-token">Reset token · from administrator</span>
  ) : (
    <span className="tag tag-recovery">Recovery code · yours</span>
  );
}
