#!/usr/bin/env python3
"""
Serve the Cesium app over HTTPS on port 8443.
Generates a self-signed certificate on first run (browser will warn - accept for localhost).
Usage: python serve_https.py
"""
import http.server
import ssl
import os

PORT = 8443
CERT_FILE = "localhost.pem"
KEY_FILE = "localhost-key.pem"

def ensure_certs():
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return
    try:
        import subprocess
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", KEY_FILE, "-out", CERT_FILE, "-days", "365",
            "-nodes", "-subj", "/CN=localhost"
        ], check=True, capture_output=True)
        print("Created self-signed certificate for localhost.")
    except Exception as e:
        print("Could not create certificate. Install OpenSSL or use: python -m http.server 8000")
        raise SystemExit(1)

def main():
    ensure_certs()
    server = http.server.HTTPServer(("0.0.0.0", PORT), http.server.SimpleHTTPRequestHandler)
    server.socket = ssl.wrap_socket(server.socket, server_side=True, keyfile=KEY_FILE, certfile=CERT_FILE)
    print(f"Serving at https://localhost:{PORT}/")
    print("Accept the browser security warning for self-signed cert.")
    server.serve_forever()

if __name__ == "__main__":
    main()
