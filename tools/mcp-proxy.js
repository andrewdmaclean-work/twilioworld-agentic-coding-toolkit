#!/usr/bin/env node
// tools/mcp-proxy.js — HTTP→HTTPS bridge for llamafile's /cors-proxy.
//
// llamafile 0.10.3 is compiled without CPPHTTPLIB_OPENSSL_SUPPORT, so its
// built-in CORS proxy (/cors-proxy?url=...) cannot reach https:// endpoints.
// This script listens on plain HTTP at 127.0.0.1:PORT and forwards all
// requests to TARGET_URL over HTTPS using Node's built-in https module.
//
// The web UI is configured to point at http://127.0.0.1:PORT instead of
// https://mcp.twilio.com/docs. The CORS proxy then reaches this bridge
// over plain HTTP, and the bridge handles the TLS hop.
//
// Only the local chat page may use the bridge from a browser: requests that
// carry an Origin header must come from the llamafile web UI. Requests with
// no Origin (llamafile's server-side proxy) are allowed. Without this, any
// website open in the same browser could drive the bridge.
//
// Usage (managed by the TUI — not normally run directly):
//   node tools/mcp-proxy.js [target_url] [port] [model_port]
//     target_url  default: https://mcp.twilio.com/docs
//     port        default: 18080
//     model_port  default: 8080 (the llamafile web UI allowed as Origin)

"use strict";
const http  = require("http");
const https = require("https");

const target     = new URL(process.argv[2] || "https://mcp.twilio.com/docs");
const PORT       = parseInt(process.argv[3] || "18080", 10);
const MODEL_PORT = parseInt(process.argv[4] || "8080", 10);

function allowedOrigins(modelPort) {
  return new Set([`http://127.0.0.1:${modelPort}`, `http://localhost:${modelPort}`]);
}

/** null → no browser origin (server-side caller); otherwise the origin to echo. */
function corsOrigin(origin, allowed) {
  if (!origin) return null;
  return allowed.has(origin) ? origin : false;
}

const ALLOWED = allowedOrigins(MODEL_PORT);

function handle(req, res) {
  const origin = corsOrigin(req.headers.origin, ALLOWED);
  if (origin === false) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: 403, message: "origin not allowed" } }));
    return;
  }
  const corsHeaders = origin ? { "access-control-allow-origin": origin, vary: "origin" } : {};

  // CORS preflight — llamafile's proxy might send these.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...corsHeaders,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-max-age":       "86400",
    });
    res.end();
    return;
  }

  // Forward headers verbatim except host/origin/referer which would
  // confuse the upstream server.
  const outHeaders = Object.assign({}, req.headers);
  outHeaders["host"] = target.hostname;
  delete outHeaders["origin"];
  delete outHeaders["referer"];

  const options = {
    hostname: target.hostname,
    port:     target.port || 443,
    path:     target.pathname + (target.search || ""),
    method:   req.method,
    headers:  outHeaders,
  };

  const upstream = https.request(options, (upRes) => {
    const replyHeaders = Object.assign({}, upRes.headers, corsHeaders);
    res.writeHead(upRes.statusCode, replyHeaders);
    // Pipe without buffering — required for SSE / streamable-http.
    upRes.pipe(res, { end: true });
  });

  upstream.on("error", (e) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ error: { code: 502, message: e.message } }));
  });

  req.pipe(upstream, { end: true });
}

if (require.main === module) {
  const server = http.createServer(handle);
  server.on("error", (e) => {
    const reason = e.code === "EADDRINUSE"
      ? `port ${PORT} is already in use — stop the other process or restart local AI from the toolkit`
      : e.message;
    process.stderr.write(`mcp-proxy: ${reason}\n`);
    process.exit(1);
  });
  server.listen(PORT, "127.0.0.1", () => {
    process.stdout.write(
      `mcp-proxy: http://127.0.0.1:${PORT} → ${target.href}\n`
    );
  });
}

module.exports = { allowedOrigins, corsOrigin };
