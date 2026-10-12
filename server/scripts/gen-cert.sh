#!/bin/sh
# Generates a self-signed certificate for LOCAL DEVELOPMENT ONLY.
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2" \
  -keyout certs/key.pem -out certs/cert.pem
echo "Wrote certs/key.pem and certs/cert.pem"
