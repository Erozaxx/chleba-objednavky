/**
 * middleware.ts
 *
 * Vercel Edge Middleware – autorizace a routování.
 *
 * Vzory:
 *   /u/[token]         → DB lookup zákazníka (Neon HTTP driver), nastav X-User-Id header
 *   /admin/[adminToken] → Porovnej adminToken vůči ADMIN_TOKEN env, nastav X-Is-Admin header
 *   /api/admin/**      → Ověř x-admin-token request header vůči ADMIN_TOKEN, nebo 401
 *   /api/cron/**       → Ověř Authorization: Bearer <CRON_SECRET>, nebo 401
 *   Ostatní            → Propusť beze změny
 *
 * POZOR: Používá POUZE neon() (HTTP transport) – Edge Runtime nepodporuje WebSocket Pool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // --- /u/[token] → customer token lookup ---
  if (pathname.startsWith('/u/')) {
    return handleCustomerToken(request, pathname);
  }

  // --- /admin/[adminToken] → admin page access ---
  if (pathname.startsWith('/admin/') && !pathname.startsWith('/api/')) {
    return handleAdminPage(request, pathname);
  }

  // --- /api/admin/** → admin API auth ---
  if (pathname.startsWith('/api/admin/')) {
    return handleAdminApi(request);
  }

  // --- /api/cron/** → cron secret auth ---
  if (pathname.startsWith('/api/cron/')) {
    return handleCronAuth(request);
  }

  // --- /api/customer/** → verify X-User-Id presence ---
  if (pathname.startsWith('/api/customer/')) {
    return handleCustomerApi(request);
  }

  // Everything else: pass through
  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCustomerToken(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse> {
  // Extract token from path: /u/<token> or /u/<token>/...
  const segments = pathname.split('/');
  const token = segments[2]; // /u/TOKEN/...

  if (!token) {
    return NextResponse.redirect(new URL('/not-found', request.url));
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id, active FROM users WHERE token = ${token} LIMIT 1`;

    if (rows.length === 0 || !rows[0].active) {
      return NextResponse.redirect(new URL('/not-found', request.url));
    }

    const headers = new Headers(request.headers);
    headers.set('x-user-id', rows[0].id as string);

    return NextResponse.next({
      request: { headers },
    });
  } catch (error) {
    console.error('[middleware] Customer token lookup failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.redirect(new URL('/not-found', request.url));
  }
}

function handleAdminPage(
  request: NextRequest,
  pathname: string,
): NextResponse {
  // Extract adminToken from path: /admin/<adminToken> or /admin/<adminToken>/...
  const segments = pathname.split('/');
  const adminToken = segments[2]; // /admin/TOKEN/...

  if (!adminToken) {
    return NextResponse.redirect(new URL('/not-found', request.url));
  }

  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken || adminToken !== expectedToken) {
    return NextResponse.redirect(new URL('/not-found', request.url));
  }

  const headers = new Headers(request.headers);
  headers.set('x-is-admin', 'true');

  return NextResponse.next({
    request: { headers },
  });
}

function handleAdminApi(request: NextRequest): NextResponse {
  const adminToken = request.headers.get('x-admin-token');
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken || adminToken !== expectedToken) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers(request.headers);
  headers.set('x-is-admin', 'true');

  return NextResponse.next({
    request: { headers },
  });
}

function handleCronAuth(request: NextRequest): NextResponse {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return NextResponse.next();
}

async function handleCustomerApi(request: NextRequest): Promise<NextResponse> {
  const token = request.headers.get('x-customer-token');

  if (!token) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id FROM users WHERE token = ${token} AND active = true LIMIT 1`;

    if (rows.length === 0) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(request.headers);
    headers.set('x-user-id', rows[0].id as string);

    return NextResponse.next({ request: { headers } });
  } catch (error) {
    console.error('[middleware] Customer API auth failed:', error instanceof Error ? error.message : 'unknown error');
    return new NextResponse(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  matcher: [
    '/u/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/customer/:path*',
    '/api/cron/:path*',
  ],
};
