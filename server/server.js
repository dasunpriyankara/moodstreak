const fs = require('fs');
const http = require('http');
const https = require('https');
const config = require('./src/config');
const store = require('./src/store/mongoStore');
const createApp = require('./src/app');

(async () => {
  await store.connect(config.mongoUri);
  console.log('Connected to MongoDB');
  const app = createApp(store);

  let server;
  if (config.tlsKeyPath && config.tlsCertPath) {
    // Direct HTTPS (local development / own VPS)
    server = https.createServer({ key: fs.readFileSync(config.tlsKeyPath), cert: fs.readFileSync(config.tlsCertPath) }, app);
    server.listen(config.port, () => console.log(`HTTPS server listening on https://localhost:${config.port}`));
  } else if (config.behindTlsProxy) {
    // Render / Heroku style: the platform terminates TLS and forwards over a private network.
    // The requireHttps middleware rejects any request whose X-Forwarded-Proto is not https.
    server = http.createServer(app);
    server.listen(config.port, () => console.log(`Listening on :${config.port} behind a TLS-terminating proxy`));
  } else {
    console.error('Refusing to start without HTTPS: set TLS_KEY_PATH + TLS_CERT_PATH, or BEHIND_TLS_PROXY=true');
    process.exit(1);
  }

  const shutdown = () => server.close(() => store.disconnect().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
})().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
