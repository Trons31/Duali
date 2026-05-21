import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { authClientSelect, comparePassword, sanitizeClient, signToken } from "@/lib/auth";

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

        const email = String(credentials.email).toLowerCase();
        const password = String(credentials.password);
        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (adminEmail && email === adminEmail) {
          const isAdminValid = adminPasswordHash
            ? await comparePassword(password, adminPasswordHash)
            : Boolean(adminPassword && password === adminPassword);

          if (!isAdminValid) return null;

          return {
            id: "duali-admin",
            role: "ADMIN",
            name: "Administrador Duali",
            email,
            businessName: "Duali",
            telefono: null,
            apiToken: ""
          };
        }

        const client = await prisma.client.findFirst({
          where: {
            email,
            deletedAt: null
          },
          select: authClientSelect
        });

        if (!client) return null;

        const isValid = await comparePassword(String(credentials.password), client.passwordHash);
        if (!isValid) return null;

        const safeClient = sanitizeClient(client);

        return {
          id: safeClient.id,
          role: "CLIENT",
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
        token.role = user.role;
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
      const role = token.role === "ADMIN" || userId === "duali-admin" ? "ADMIN" : "CLIENT";
      const client =
        role === "CLIENT" && userId
          ? await prisma.client.findFirst({
              where: { id: userId, deletedAt: null },
              select: { id: true, nombre: true, email: true, businessName: true, telefono: true }
            })
          : null;
      const apiToken = client ? signToken(client) : "";

      session.user.id = userId;
      session.user.role = role;
      session.user.name = role === "CLIENT" ? client?.nombre : token.name;
      session.user.email = role === "CLIENT" ? client?.email ?? email : email;
      session.user.businessName = role === "CLIENT" ? client?.businessName ?? "" : String(token.businessName ?? "Duali");
      session.user.telefono = role === "CLIENT" ? client?.telefono ?? null : (token.telefono as string | null | undefined) ?? null;
      session.user.apiToken = apiToken;
      return session;
    }
  }
});
