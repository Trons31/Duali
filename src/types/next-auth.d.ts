import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "CLIENT" | "ADMIN";
      businessName: string;
      telefono?: string | null;
      apiToken: string;
    };
  }

  interface User {
    id: string;
    role: "CLIENT" | "ADMIN";
    businessName: string;
    telefono?: string | null;
    apiToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    businessName?: string;
    role?: "CLIENT" | "ADMIN";
    telefono?: string | null;
    apiToken?: string;
  }
}
