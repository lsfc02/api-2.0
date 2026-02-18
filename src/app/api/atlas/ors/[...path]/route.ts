/**
 * Proxy transparente para o OpenRouteService (ORS).
 *
 * Rota: /api/atlas/ors/[...path]
 *
 * Uso no nginx – substitua o bloco /api-ors/ por:
 *
 *   location /api-ors/ {
 *       proxy_pass         http://localhost:9031/api/atlas/ors/;
 *       proxy_read_timeout 70s;
 *       proxy_connect_timeout 10s;
 *       proxy_set_header   Host $host;
 *   }
 *
 * Assim o frontend continua chamando /api-ors/... sem mudança,
 * mas o timeout é controlado pelo backend (não pelo nginx→ORS direto).
 */
import { NextRequest, NextResponse } from 'next/server';

const ORS_BASE = (process.env.ORS_BASE_URL ?? 'http://192.168.50.6:8082/ors').replace(/\/+$/, '');
const DIRECTIONS_TIMEOUT_MS = Number(process.env.ORS_DIRECTIONS_TIMEOUT_MS) || 30000;
const MATRIX_TIMEOUT_MS = Number(process.env.ORS_MATRIX_TIMEOUT_MS) || 45000;

const BLOCKED_REQ_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);
const BLOCKED_RES_HEADERS = new Set(['connection', 'transfer-encoding', 'keep-alive']);

function pickTimeout(path: string[]): number {
  const joined = path.join('/');
  if (joined.includes('matrix')) return MATRIX_TIMEOUT_MS;
  return DIRECTIONS_TIMEOUT_MS;
}

async function proxyRequest(req: NextRequest, path: string[]): Promise<NextResponse> {
  const orsPath = path.join('/');
  const search = req.nextUrl.search ?? '';
  const targetUrl = `${ORS_BASE}/${orsPath}${search}`;
  const timeoutMs = pickTimeout(path);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const forwardHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    req.headers.forEach((value, key) => {
      if (!BLOCKED_REQ_HEADERS.has(key.toLowerCase())) {
        forwardHeaders[key] = value;
      }
    });

    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.text()
      : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
      signal: controller.signal,
    });

    const resHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!BLOCKED_RES_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value);
    });
    resHeaders.set('X-Proxy-By', 'api-atlas');

    const resBody = await upstream.arrayBuffer();
    return new NextResponse(resBody, { status: upstream.status, headers: resHeaders });
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    console.error(`❌ ORS proxy error [${req.method} /${orsPath}]:`, isTimeout ? 'Timeout' : err?.message);
    return NextResponse.json(
      { error: isTimeout ? 'ORS timeout' : 'ORS proxy error', detail: err?.message },
      { status: isTimeout ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxyRequest(req, params.path);
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
