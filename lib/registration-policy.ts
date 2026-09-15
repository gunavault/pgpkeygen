export type RegistrationRole = "user" | "admin";

/**
 * Public self-registration is intentionally unprivileged.
 *
 * An email address is a self-asserted identifier until ownership has been
 * established out of band. Administrator elevation is therefore handled only
 * by the operator-side bootstrap command, never by this request path.
 */
export function roleForSelfRegistration(email: string): RegistrationRole {
  void email;
  return "user";
}
