import "server-only";
import postgres from "postgres";

export function getDatabaseUrl(): string {
  let url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (password && url.includes("[YOUR-PASSWORD]")) {
    url = url.replace("[YOUR-PASSWORD]", encodeURIComponent(password));
  }
  return url;
}

export type PostgresOptions = NonNullable<Parameters<typeof postgres>[1]>;

export function getPostgresOptions(url: string): PostgresOptions {
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  const isTransactionPooler = url.includes(":6543");

  return {
    ssl: isLocal ? false : "require",
    prepare: !isTransactionPooler,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  };
}

const resolvedUrl = process.env.DATABASE_URL ? getDatabaseUrl() : "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const sql = postgres(resolvedUrl, getPostgresOptions(resolvedUrl));
