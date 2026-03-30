/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Clickjacking protection
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // Prevent MIME-type sniffing
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // Referrer policy
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Permissions policy – disable unused browser features
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Cross-Origin policies
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  // Content Security Policy
  // 'unsafe-inline' required by Next.js App Router (inline hydration scripts + Tailwind styles)
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const appOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://chleba-objednavky.vercel.app';

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // API routes: explicitně blokovat cross-origin volání z jiných domén.
      // Naše API používá token auth (ne cookies), ale lépe být explicitní.
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: appOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, x-customer-token, x-admin-token' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
