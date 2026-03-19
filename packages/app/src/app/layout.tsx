import type { Metadata, Viewport } from 'next'
import { PropsWithChildren } from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '700'], variable: '--font-inter' })
import { SITE_DESCRIPTION, SITE_EMOJI, SITE_INFO, SITE_NAME, SITE_URL, SOCIAL_TWITTER } from '@/utils/site'
import { Layout } from '@/components/Layout'
import { headers } from 'next/headers'
import { Providers } from '@/context'
import '../assets/globals.css'

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME} · ${SITE_INFO}`,
    template: `${SITE_NAME} · %s`,
  },
  metadataBase: new URL(SITE_URL),
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: {
    title: SITE_NAME,
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    title: SITE_NAME,
    siteName: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: '/opengraph-image',
  },
  twitter: {
    card: 'summary_large_image',
    site: SOCIAL_TWITTER,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: '/opengraph-image',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  height: 'device-height',
  initialScale: 1.0,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export default async function RootLayout(props: PropsWithChildren) {
  const headersList = await headers()
  const cookies = headersList.get('cookie')

  return (
    <html lang='en'>
      <head>
        <link
          rel='icon'
          href={`data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${encodeURIComponent(SITE_EMOJI)}</text></svg>`}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function isAllowListError(msg) {
              if (!msg) return false;
              var s = typeof msg === 'string' ? msg : (msg.message || String(msg));
              return s.indexOf('is not in your allow list') !== -1 || s.indexOf('ngrok-free') !== -1;
            }
            var _ce = console.error.bind(console);
            console.error = function() { if (!isAllowListError(arguments[0])) _ce.apply(console, arguments); };
            window.addEventListener('unhandledrejection', function(e) {
              if (isAllowListError(e.reason)) { e.stopImmediatePropagation(); e.preventDefault(); }
            }, true);
            window.addEventListener('error', function(e) {
              if (isAllowListError(e.message)) { e.stopImmediatePropagation(); e.preventDefault(); }
            }, true);
          })();
        `}} />
      </head>

      <body className={inter.variable}>
        <Providers cookies={cookies}>
          <Layout>{props.children}</Layout>
        </Providers>
      </body>
    </html>
  )
}
