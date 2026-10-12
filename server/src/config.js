// All configuration comes from environment variables (see .env.example).
// Nothing secret is hard-coded in the source tree.
require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  isTest,
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '8443', 10),
  mongoUri: isTest ? process.env.MONGODB_URI || '' : required('MONGODB_URI'),
  jwtSecret: isTest ? process.env.JWT_SECRET || 'test-only-secret-not-for-production' : required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  // Comma separated list of extra allowed web origins (e.g. your hosted web client)
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // TLS: provide key+cert paths for direct HTTPS (local dev). On Render, TLS is
  // terminated by the platform and the app is reached via an HTTPS-only proxy.
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  tlsCertPath: process.env.TLS_CERT_PATH || '',
  behindTlsProxy: process.env.BEHIND_TLS_PROXY === 'true',
};
