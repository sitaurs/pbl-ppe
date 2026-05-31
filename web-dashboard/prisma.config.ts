// prisma.config.ts
// Prisma 7.x requires datasource URL to live here instead of schema.prisma.
// In Prisma 7.x the URL is resolved relative to this config file (project root),
// so "file:./data/safeguard.db" resolves to `<project root>/data/safeguard.db`,
// satisfying Req 1.1.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: "file:./data/safeguard.db",
  },
});
