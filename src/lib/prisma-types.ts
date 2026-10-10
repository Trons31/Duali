import type { prisma } from "./prisma";

/**
 * El `tx` que entrega el cliente extendido no es el mismo tipo que
 * `Prisma.TransactionClient`: la extension cambia la firma de cada modelo.
 * Lo derivamos del propio cliente para no duplicar el tipo a mano.
 */
export type ExtendedTransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Los helpers que sirven tanto dentro de una transaccion como con el cliente
 * global reciben este tipo.
 */
// Un solo tipo, no una union: con la union de tres clientes TypeScript debia
// comparar las firmas de cada modelo y, con el esquema mas grande, se rendia
// ("This expression is not callable" / "Excessive stack depth") y rompia el build.
// La extension de prisma.ts solo intercepta consultas, asi que el cliente global
// (que tiene todo lo de ExtendedTransactionClient) tambien encaja aqui.
export type DbClient = ExtendedTransactionClient;

/** Igual que `DbClient`, pero solo con los modelos que el helper necesita. */
export type DbClientFor<K extends keyof ExtendedTransactionClient> = Pick<ExtendedTransactionClient, K>;
