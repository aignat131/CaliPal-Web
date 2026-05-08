import type { NextConfig } from "next";

// Inject a unique build ID so the service worker is re-registered on each deploy
process.env.NEXT_PUBLIC_BUILD_ID = Date.now().toString(36)

// Security headers applied to every route
const GLOBAL_SECURITY_HEADERS = [
  // Prevent this site from being embedded in iframes (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Only send origin in referer header (no full path)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restrict browser feature access to only what the app needs
  {
    key: 'Permissions-Policy',
    value: [
      'camera=(self)',         // form-check and autocut pages
      'microphone=()',         // never needed
      'geolocation=(self)',    // map location sharing
      'payment=()',            // never needed
      'usb=()',                // never needed
    ].join(', '),
  },
  // Content Security Policy — allows Firebase, CDNs used by the app, blocks unknown origins
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js hydration requires unsafe-inline + unsafe-eval; nonce-based CSP
      // would need Next.js middleware — use strict-dynamic when adopting nonces later
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Firebase, Google auth
      [
        "connect-src 'self'",
        "https://*.googleapis.com",
        "https://*.firebaseio.com",
        "wss://*.firebaseio.com",
        "https://*.cloudfunctions.net",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        // Map tile search
        "https://nominatim.openstreetmap.org",
        // MediaPipe WASM
        "https://cdn.jsdelivr.net",
        // ffmpeg WASM (will be replaced once hosted locally)
        "https://unpkg.com",
      ].join(' '),
      // Images: Firebase Storage, Google user avatars, OSM/CartoCDN map tiles, blobs
      [
        "img-src 'self' data: blob:",
        "https://firebasestorage.googleapis.com",
        "https://lh3.googleusercontent.com",
        "https://*.tile.openstreetmap.org",
        "https://*.basemaps.cartocdn.com",
        "https://*.cartocdn.com",
      ].join(' '),
      // Videos and audio blobs (form-check + autocut)
      "media-src 'self' blob:",
      // Service worker + ffmpeg WASM worker
      "worker-src 'self' blob:",
      // iframe: Google sign-in popup only
      "frame-src https://accounts.google.com",
      // Prevents this site from being framed (belt-and-suspenders with X-Frame-Options)
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      // Global security headers on all routes
      {
        source: '/(.*)',
        headers: GLOBAL_SECURITY_HEADERS,
      },
      // Auth pages: no COOP so Google OAuth redirect can complete
      {
        source: '/(login|register|forgot-password)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        ],
      },
      // Map page: relax COEP so tile images from external CDNs can load
      {
        source: '/map',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        ],
      },
      // ML pages need SharedArrayBuffer → require strict COOP + COEP
      {
        source: '/workout/form-check',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        source: '/workout/autocut',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },
};

export default nextConfig;
