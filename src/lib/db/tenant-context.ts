import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Execute a function within a tenant context.
 * Sets `app.user_id` as a session variable so RLS policies filter to this user.
 *
 * Uses the pooled connection (not HTTP) because SET LOCAL requires a real
 * connection with transaction support, and it must be on the same connection.
 */
export async function withTenant<T>(
  userId: string,
  fn: (client: InstanceType<typeof Pool> extends { connect(): Promise<infer C> } ? C : never) => Promise<T>
): Promise<T> {
  // Validate UUID format to prevent SQL injection in SET LOCAL
  if (!UUID_REGEX.test(userId)) {
    throw new Error("Invalid user ID format");
  }

  const pooledUrl = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;

  if (!pooledUrl) {
    throw new Error("DATABASE_URL_POOLED is not set");
  }

  const pool = new Pool({ connectionString: pooledUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // SET LOCAL scopes the setting to this transaction only
    await client.query(`SET LOCAL app.user_id = '${userId}'`);

    const result = await fn(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
