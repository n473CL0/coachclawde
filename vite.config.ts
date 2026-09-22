import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // Vite only inlines VITE_-prefixed env vars into the client bundle. The
  // Supabase Vercel Marketplace integration injects its credentials under
  // non-prefixed names (e.g. SUPABASE_URL) — and Next-flavoured ones too — so the
  // browser would never see them. Load *all* env (the empty prefix pulls in both
  // .env files and process.env) and expose the value under the VITE_ name the app
  // reads, whichever source it came from. This means the app works once the
  // integration is installed, without hand-adding VITE_ aliases.
  const env = loadEnv(mode, process.cwd(), '')
  const pick = (...names: string[]) => {
    for (const n of names) {
      if (env[n]) return env[n]
    }
    return ''
  }
  const SUPABASE_URL = pick('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
  const SUPABASE_ANON_KEY = pick(
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )

  // Magic-link sign-in is hidden unless this is explicitly 'true'. Magic links
  // need working SMTP, and Supabase's built-in mailer allows only a couple of
  // messages an hour — so while the beta runs on hand-delivered passwords,
  // offering the button would mostly hand testers a link that never arrives.
  const ENABLE_MAGIC_LINK = pick('VITE_ENABLE_MAGIC_LINK', 'ENABLE_MAGIC_LINK')

  // Surfaced in the Vercel build log so it's easy to confirm whether credentials
  // were present at build time (never prints the values themselves).
  console.log(
    `[coach-claude] Supabase credentials ${
      SUPABASE_URL && SUPABASE_ANON_KEY ? 'detected — auth enabled' : 'MISSING — app will run in local mode'
    }`,
  )

  return {
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
    'import.meta.env.VITE_ENABLE_MAGIC_LINK': JSON.stringify(ENABLE_MAGIC_LINK),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Coach Claude',
        short_name: 'Coach',
        description: 'AI-powered personal workout tracker',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\./,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  }
})
