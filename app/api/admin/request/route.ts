/**
 * app/api/admin/request/route.ts
 *
 * POST: Odešle požadavek na AI změnu vzhledu webu.
 * Spouští GitHub Actions workflow ui-agent.yml přes workflow_dispatch.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// In-memory rate limit (per-process; resets on cold start – acceptable for MVP)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 min in ms
const rateLimitMap = new Map<string, number>(); // token → last request timestamp

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth – middleware already verified x-admin-token, but double-check for safety
  const adminToken = request.headers.get('x-admin-token');
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const lastRequest = rateLimitMap.get(adminToken) ?? 0;
  const elapsed = Date.now() - lastRequest;
  if (elapsed < RATE_LIMIT_WINDOW) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - elapsed) / 1000);
    return NextResponse.json(
      { error: 'Příliš mnoho požadavků', retryAfter },
      { status: 429 },
    );
  }

  // Parse & validate body
  let body: { prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neplatný požadavek.' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'Zadejte popis změny.' }, { status: 400 });
  }
  if (prompt.length > 2000) {
    return NextResponse.json({ error: 'Popis změny je příliš dlouhý (max 2000 znaků).' }, { status: 400 });
  }

  // Dispatch GitHub Actions workflow
  const ghPat = process.env.GH_PAT;
  if (!ghPat) {
    console.error('[api/admin/request] GH_PAT not configured');
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }

  try {
    const ghRes = await fetch(
      'https://api.github.com/repos/Erozaxx/chleba-objednavky/actions/workflows/ui-agent.yml/dispatches',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghPat}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { prompt, action: 'change' },
        }),
      },
    );

    if (!ghRes.ok) {
      const text = await ghRes.text();
      console.error('[api/admin/request] GitHub dispatch failed:', ghRes.status, text);
      return NextResponse.json({ error: 'Nepodařilo se odeslat požadavek.' }, { status: 502 });
    }

    // Record rate limit timestamp
    rateLimitMap.set(adminToken, Date.now());

    const since = new Date().toISOString();
    return NextResponse.json({ status: 'queued', since });
  } catch (error) {
    console.error('[api/admin/request] Error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
