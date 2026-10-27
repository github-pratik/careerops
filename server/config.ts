import "dotenv/config";
import path from "node:path";
export interface Config {
  databaseUrl: string;
  dataDir: string;
  adminPassword: string;
  sessionSecret: string;
  origin: string;
  port: number;
  secureCookies: boolean;
}
export function config(): Config {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const sessionSecret = process.env.SESSION_SECRET || "";
  if (adminPassword.length < 16 || sessionSecret.length < 32)
    throw new Error(
      "Run npm run setup, or provide ADMIN_PASSWORD (16+ characters) and SESSION_SECRET (32+ characters).",
    );
  const origin = process.env.APP_ORIGIN || "http://localhost:3100";
  const url = new URL(origin);
  if (url.origin !== origin)
    throw new Error(
      "APP_ORIGIN must be an origin without a trailing slash or path.",
    );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  return {
    databaseUrl: process.env.DATABASE_URL,
    dataDir: path.resolve(process.env.DATA_DIR || ".data/files"),
    adminPassword,
    sessionSecret,
    origin,
    port: Number(process.env.PORT || 3100),
    secureCookies: url.protocol === "https:",
  };
}
