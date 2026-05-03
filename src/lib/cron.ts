import { ApiError } from "./http";

export function requireCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return;

  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  const normalizedProvided = provided?.replace(/ /g, "+");

  if (provided !== expected && normalizedProvided !== expected) {
    throw new ApiError(401, "Cron no autorizado");
  }
}
