/**
 * lib/db/index.ts
 *
 * Unified re-export pro celý db modul.
 * Importuj z '@/lib/db' pro přístup k db instanci i schema typům.
 */

// Drizzle client instances (db, edgeDb, edgeSql)
export { db, edgeDb, edgeSql } from './client';

// Schema tabulky, relations a TypeScript typy
export * from './schema';
