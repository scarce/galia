// Database access shim.
//
// Production (Vercel) uses `@vercel/postgres`, whose driver speaks Neon's
// HTTP/WS protocol. That driver can't talk to a plain local Postgres over TCP,
// so for local development we transparently swap in the standard `pg` driver
// behind the same `sql` tagged-template API.
//
// Toggle with `DB_DRIVER=pg` in `.env.local` (local only). When unset, behaviour
// is byte-for-byte the production path.
//
// Both backends return a `{ rows, rowCount }`-shaped result, which is all the
// callers use, so they're interchangeable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { sql as vercelSql } from "@vercel/postgres";

// Mirror @vercel/postgres's loose typing: rows are `any` so existing callers
// that read `.rows[0].field` as number/string keep type-checking.
interface QueryResultLike {
  rows: any[];
  rowCount: number | null;
}
type SqlTag = (
  strings: TemplateStringsArray,
  ...values: any[]
) => Promise<QueryResultLike>;

function makePgSql(): SqlTag {
  // Lazy-require so `pg` is never pulled into the production bundle.
  const { Pool } = require("pg") as typeof import("pg");
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  return (strings, ...values) => {
    // Rebuild the query with $1,$2,… placeholders from the template holes.
    const text = strings.reduce(
      (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
      "",
    );
    return pool.query(text, values);
  };
}

let pgSql: SqlTag | null = null;

export const sql: SqlTag = (strings, ...values) => {
  if (process.env.DB_DRIVER === "pg") {
    if (!pgSql) pgSql = makePgSql();
    return pgSql(strings, ...values);
  }
  return vercelSql(strings, ...values) as unknown as Promise<QueryResultLike>;
};
