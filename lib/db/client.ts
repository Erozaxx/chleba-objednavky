/**
 * lib/db/client.ts
 *
 * Dvě instance Neon/Drizzle:
 *   - edgeSql  → HTTP transport (neon()) – pro Vercel Edge Runtime (middleware)
 *   - db       → Node.js pooler (Pool + drizzle) – pro Server Components a Route Handlers
 *
 * Viz architecture_iter-003.md sekce 4.2 (Middleware – Neon driver typ, R-005).
 */

import { neon, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const DATABASE_URL = process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Edge instance – HTTP transport, funguje v Edge Runtime (middleware)
// Použití: přímé SQL dotazy přes tagovaný template literal
// ---------------------------------------------------------------------------
export const edgeSql = neon(DATABASE_URL);

// Edge-compatible Drizzle instance (pokud bude potřeba ORM v Edge kontextu)
export const edgeDb = drizzleHttp(edgeSql);

// ---------------------------------------------------------------------------
// Node.js instance – WebSocket pooler, pro Server Components a Route Handlers
// Neon Pool používá WebSocket – NESMÍ se importovat v middleware.ts
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: DATABASE_URL });

export const db = drizzlePool(pool);
