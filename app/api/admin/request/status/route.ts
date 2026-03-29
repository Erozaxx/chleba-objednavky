/**
 * app/api/admin/request/status/route.ts
 *
 * GET: Polling endpoint pro stav AI změny.
 *   ?since=<ISO>  → stav workflow runu od daného času
 *   ?history=1    → posledních 5 ui-agent commitů
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// In-memory cache (5s TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5_000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ---------------------------------------------------------------------------
// GitHub API helper
// ---------------------------------------------------------------------------

async function ghFetch(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_PAT}`,
      Accept: 'application/vnd.github+json',
    },
  });
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth
  const adminToken = request.headers.get('x-admin-token');
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;

  // ---- History mode ----
  if (searchParams.get('history') === '1') {
    return handleHistory();
  }

  // ---- Status polling mode ----
  const since = searchParams.get('since');
  if (!since) {
    return NextResponse.json({ error: 'Chybí parametr since.' }, { status: 400 });
  }

  return handleStatus(since);
}

// ---------------------------------------------------------------------------
// Status polling
// ---------------------------------------------------------------------------

async function handleStatus(since: string): Promise<NextResponse> {
  const cacheKey = `status:${since}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  if (!process.env.GH_PAT) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });
  }

  try {
    const res = await ghFetch(
      `/repos/Erozaxx/chleba-objednavky/actions/workflows/ui-agent.yml/runs?created=>${since}&per_page=1`,
    );

    if (!res.ok) {
      console.error('[api/admin/request/status] GitHub API error:', res.status);
      return NextResponse.json({ status: 'queued' });
    }

    const json = await res.json();
    const runs = json.workflow_runs ?? [];

    if (runs.length === 0) {
      const data = { status: 'queued' };
      setCache(cacheKey, data);
      return NextResponse.json(data);
    }

    const run = runs[0];
    let status: string;

    if (run.status === 'completed') {
      status = run.conclusion === 'success' ? 'completed' : 'failure';
    } else if (run.status === 'in_progress') {
      status = 'in_progress';
    } else {
      status = 'queued';
    }

    const data: Record<string, string> = { status };
    if (run.conclusion) data.conclusion = run.conclusion;
    if (run.head_sha) data.commitSha = run.head_sha;

    // Only cache terminal states for longer
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[api/admin/request/status] Error:', error);
    return NextResponse.json({ status: 'queued' });
  }
}

// ---------------------------------------------------------------------------
// History – last 5 ui-agent commits
// ---------------------------------------------------------------------------

async function handleHistory(): Promise<NextResponse> {
  const cacheKey = 'history';
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  if (!process.env.GH_PAT) {
    return NextResponse.json({ history: [] });
  }

  try {
    const res = await ghFetch(
      '/repos/Erozaxx/chleba-objednavky/commits?per_page=20',
    );

    if (!res.ok) {
      return NextResponse.json({ history: [] });
    }

    const commits = await res.json();

    // Filter ui-agent commits
    const uiAgentCommits = (commits as Array<{
      sha: string;
      commit: { message: string; author: { date: string } };
    }>)
      .filter((c) => c.commit.message.includes('[ui-agent:'))
      .slice(0, 5)
      .map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.author.date,
      }));

    const data = { history: uiAgentCommits };
    setCache(cacheKey, data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[api/admin/request/status] History error:', error);
    return NextResponse.json({ history: [] });
  }
}
