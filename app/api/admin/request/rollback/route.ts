/**
 * app/api/admin/request/rollback/route.ts
 *
 * POST: Vrátí poslední AI změnu (rollback).
 * Ověří, že commitSha odpovídá poslednímu ui-agent commitu,
 * a spustí workflow_dispatch s action=rollback.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth
  const adminToken = request.headers.get('x-admin-token');
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse body
  let body: { commitSha?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neplatný požadavek.' }, { status: 400 });
  }

  const commitSha = typeof body.commitSha === 'string' ? body.commitSha.trim() : '';
  if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha)) {
    return NextResponse.json({ error: 'Neplatný identifikátor změny.' }, { status: 400 });
  }

  const ghPat = process.env.GH_PAT;
  if (!ghPat) {
    console.error('[api/admin/request/rollback] GH_PAT not configured');
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }

  // Verify commitSha is the latest ui-agent commit
  try {
    const commitsRes = await fetch(
      'https://api.github.com/repos/Erozaxx/chleba-objednavky/commits?per_page=20',
      {
        headers: {
          Authorization: `Bearer ${ghPat}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!commitsRes.ok) {
      console.error('[api/admin/request/rollback] Failed to fetch commits:', commitsRes.status);
      return NextResponse.json({ error: 'Nepodařilo se ověřit změnu.' }, { status: 502 });
    }

    const commits = (await commitsRes.json()) as Array<{
      sha: string;
      commit: { message: string };
    }>;

    const latestUiAgent = commits.find((c) => c.commit.message.includes('[ui-agent:'));

    if (!latestUiAgent || latestUiAgent.sha !== commitSha) {
      return NextResponse.json(
        { error: 'Tuto změnu nelze vrátit. Lze vrátit pouze poslední AI změnu.' },
        { status: 409 },
      );
    }

    // Dispatch rollback workflow
    const dispatchRes = await fetch(
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
          inputs: {
            action: 'rollback',
            commit_sha: commitSha,
            prompt: '',
          },
        }),
      },
    );

    if (!dispatchRes.ok) {
      const text = await dispatchRes.text();
      console.error('[api/admin/request/rollback] Dispatch failed:', dispatchRes.status, text);
      return NextResponse.json({ error: 'Nepodařilo se spustit vrácení změny.' }, { status: 502 });
    }

    return NextResponse.json({ status: 'rollback_queued' });
  } catch (error) {
    console.error('[api/admin/request/rollback] Error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
