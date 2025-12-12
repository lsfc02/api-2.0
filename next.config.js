/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Disable telemetry
  telemetry: {
    disabled: true,
  },

  // Optimize for production
  poweredByHeader: false,
  compress: true,

  // Environment variables that should be available at runtime
  env: {
    ORS_BASE_URL: process.env.ORS_BASE_URL,
    VROOM_BASE_URL: process.env.VROOM_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  },
}

module.exports = nextConfig
