import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) return transporter;

  if (!process.env.SMTP_HOST) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

// Best-effort: a down/misconfigured SMTP server must never block key generation,
// since the passphrase is already shown on-screen (Show/Copy) regardless.
export async function sendPassphraseEmail(
  to: string,
  keyTitle: string,
  passphrase: string,
): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject: `PGP key passphrase: ${keyTitle}`,
      text: `Your passphrase for the key "${keyTitle}" is:\n\n${passphrase}\n\nStore this somewhere safe — it cannot be recovered if lost.`,
    });
    return true;
  } catch {
    return false;
  }
}
