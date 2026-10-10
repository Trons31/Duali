import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "CLIENT" | "ADMIN";
      businessName: string;
      telefono?: string | null;
      apiToken: string;
      /** Spec 024: quien entro, si no es la dueña. */
      collaboratorId?: string | null;
      collaboratorRole?: "ADMIN" | "SOCIO" | null;
    };
  }

  interface User {
    id: string;
    role: "CLIENT" | "ADMIN";
    businessName: string;
    telefono?: string | null;
    apiToken: string;
    collaboratorId?: string | null;
    collaboratorRole?: "ADMIN" | "SOCIO" | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    businessName?: string;
    role?: "CLIENT" | "ADMIN";
    telefono?: string | null;
    apiToken?: string;
    collaboratorId?: string | null;
    collaboratorRole?: "ADMIN" | "SOCIO" | null;
  }
}
