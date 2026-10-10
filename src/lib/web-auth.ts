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

        if (!client) return authorizeCollaborator(email, password);

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
          apiToken: signToken(client),
          collaboratorId: null,
          collaboratorRole: null
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
        token.collaboratorId = user.collaboratorId ?? null;
        token.collaboratorRole = user.collaboratorRole ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      const userId = String(token.sub ?? "");
      const email = String(token.email ?? "");
      const role = token.role === "ADMIN" || userId === "duali-admin" ? "ADMIN" : "CLIENT";
      const collaboratorId = typeof token.collaboratorId === "string" ? token.collaboratorId : null;
      const apiToken = role === "CLIENT" && userId && email ? signToken({ id: userId, email }, collaboratorId) : "";

      session.user.id = userId;
      session.user.role = role;
      session.user.name = token.name;
      session.user.email = email;
      session.user.businessName = String(token.businessName ?? (role === "ADMIN" ? "Duali" : ""));
      session.user.telefono = (token.telefono as string | null | undefined) ?? null;
      session.user.apiToken = apiToken;
      session.user.collaboratorId = collaboratorId;
      session.user.collaboratorRole = collaboratorId ? (token.collaboratorRole ?? "ADMIN") : null;
      return session;
    }
  }
});

/**
 * Spec 024 R4: un colaborador entra por el mismo login y trabaja sobre el negocio
 * de la dueña (`id` es el negocio; el token lleva ademas quien es).
 */
async function authorizeCollaborator(email: string, password: string) {
  const collaborator = await prisma.collaborator.findFirst({
    where: { email, activo: true, client: { deletedAt: null } },
    include: { client: { select: { id: true, businessName: true } } }
  });
  if (!collaborator || !(await comparePassword(password, collaborator.passwordHash))) return null;
  await prisma.collaborator.update({ where: { id: collaborator.id }, data: { ultimoAcceso: new Date() } });

  return {
    id: collaborator.client.id,
    role: "CLIENT" as const,
    name: collaborator.nombre,
    email: collaborator.email,
    businessName: collaborator.client.businessName,
    telefono: collaborator.celular,
    apiToken: signToken({ id: collaborator.client.id, email: collaborator.email }, collaborator.id),
    collaboratorId: collaborator.id,
    collaboratorRole: collaborator.rol
  };
}
