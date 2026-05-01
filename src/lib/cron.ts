import { ApiError } from "./http";

export function requireCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new ApiError(500, "CRON_SECRET no configurado");

  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  if (provided !== expected) throw new ApiError(401, "Cron no autorizado");
}
