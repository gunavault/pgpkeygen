import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/identity";
import { verifyPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import { isSessionValidAfterCutoff } from "@/lib/session-validity";

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

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          await logAudit(email, "login.failed");
          return null;
        }

        await logAudit(email, "login.success");
        return { id: user.id, email: user.email, role: user.role };
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
      if (!session.user || !token.id) return session;

      const [user] = await db
        .select({
          role: users.role,
          sessionsValidAfter: users.sessionsValidAfter,
        })
        .from(users)
        .where(eq(users.id, token.id))
        .limit(1);

      const issuedAtMs =
        typeof token.sessionIssuedAt === "number"
          ? token.sessionIssuedAt
          : typeof token.iat === "number"
            ? token.iat * 1000
            : null;

      if (
        !user ||
        !isSessionValidAfterCutoff(issuedAtMs, user.sessionsValidAfter)
      ) {
        session.user.id = "";
        session.user.role = "user";
        return session;
      }

      session.user.id = token.id;
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
