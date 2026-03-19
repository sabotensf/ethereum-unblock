/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['nfc-pcsc', 'pcsclite'],
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding', 'nfc-pcsc', 'pcsclite')
    config.resolve.alias['@react-native-async-storage/async-storage'] = false
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'ngrok-skip-browser-warning', value: 'true' },
          {
            key: 'Content-Security-Policy',
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval'; default-src 'self'; connect-src *; img-src * data:; style-src 'self' 'unsafe-inline'; font-src *; frame-src *;",
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [{ hostname: '*' }],
  },
}

module.exports = nextConfig
