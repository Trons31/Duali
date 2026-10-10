import assert from "node:assert/strict";
import { after, test } from "node:test";
import { disconnect, prisma } from "./helpers";

after(disconnect);

test("la base temporal tiene todas las migraciones aplicadas", async () => {
  const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  const names = rows.map((row) => row.migration_name);
  assert.ok(names.includes("20261009150000_add_bookings"), names.join(", "));
  const [{ port }] = await prisma.$queryRaw<Array<{ port: string }>>`SELECT current_setting('port') AS port`;
  assert.equal(port, process.env.DUALI_TEST_DB_PORT);
});
