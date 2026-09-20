import type { Prisma } from "@prisma/client";
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
export type DbClient = Prisma.TransactionClient | ExtendedTransactionClient | typeof prisma;

/** Igual que `DbClient`, pero solo con los modelos que el helper necesita. */
export type DbClientFor<K extends keyof Prisma.TransactionClient> =
  | Pick<Prisma.TransactionClient, K>
  | Pick<ExtendedTransactionClient, K & keyof ExtendedTransactionClient>
  | typeof prisma;
