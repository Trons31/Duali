import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { comparePassword, sanitizeClient, signToken } from "@/lib/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET ?? "dev-secret-change-me",
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const client = await prisma.client.findFirst({
          where: {
            email: String(credentials.email).toLowerCase(),
            deletedAt: null
          }
        });

        if (!client) return null;

        const isValid = await comparePassword(String(credentials.password), client.passwordHash);
        if (!isValid) return null;

        const safeClient = sanitizeClient(client);

        return {
          id: safeClient.id,
          name: safeClient.nombre,
          email: safeClient.email,
          businessName: safeClient.businessName,
          telefono: safeClient.telefono,
          apiToken: signToken(client)
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
        token.email = user.email;
        token.businessName = user.businessName;
        token.telefono = user.telefono;
      }

      return token;
    },
    async session({ session, token }) {
      const userId = String(token.sub ?? "");
      const email = String(token.email ?? "");
      const apiToken = userId && email ? signToken({ id: userId, email }) : "";

      session.user.id = userId;
      session.user.name = token.name;
      session.user.email = email;
      session.user.businessName = String(token.businessName ?? "");
      session.user.telefono = (token.telefono as string | null | undefined) ?? null;
      session.user.apiToken = apiToken;
      return session;
    }
  }
});
