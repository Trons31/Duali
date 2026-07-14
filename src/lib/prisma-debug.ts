const debug = process.env.DEBUG;

if (debug) {
  const debugNamespaces = debug
    .split(",")
    .map((namespace) => namespace.trim())
    .filter((namespace) => namespace && !namespace.startsWith("prisma"))
    .filter((namespace) => !namespace.startsWith("-prisma"));

  process.env.DEBUG = debugNamespaces.join(",");
}
