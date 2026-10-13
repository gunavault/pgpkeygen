import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/identity";
import { verifyPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import { isSessionAllowed } from "@/lib/session-validity";
import { checkCredentials } from "@/lib/credential-check";

// Thrown only after the password has been verified, so the distinction between
// "wrong password" and "not approved yet" is never revealed to a guesser.
export class AccountNotApproved extends CredentialsSignin {
  code = "not_approved";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = normalizeEmail(credentials?.email);
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const result = await checkCredentials(email, password, {
          async findUserByEmail(lookup) {
            const [user] = await db.select().from(users).where(eq(users.email, lookup)).limit(1);
            return user ?? null;
          },
          verifyPassword,
          audit: (actor, action, details) => logAudit(actor, action, undefined, details),
        });
        if (result.ok) return result.user;
        if (result.reason === "not_approved") throw new AccountNotApproved();
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionIssuedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      const userId = typeof token.id === "string" ? token.id : null;
      if (!session.user || !userId) return session;

      const [user] = await db
        .select({
          role: users.role,
          status: users.status,
          sessionsValidAfter: users.sessionsValidAfter,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const issuedAtMs =
        typeof token.sessionIssuedAt === "number"
          ? token.sessionIssuedAt
          : typeof token.iat === "number"
            ? token.iat * 1000
            : null;

      if (!isSessionAllowed(user ?? null, issuedAtMs)) {
        session.user.id = "";
        session.user.role = "user";
        return session;
      }

      session.user.id = userId;
      session.user.role = user.role;
      return session;
    },
    authorized({ request, auth: session }) {
      // Only gates authentication (logged in or not). Role-based access (e.g. admin-only
      // pages) is enforced by the page itself, which can render "Access denied" instead
      // of bouncing an already-authenticated user back to the login screen.
      if (request.nextUrl.pathname.startsWith("/dashboard")) return !!session?.user?.id;
      return true;
    },
  },
});
