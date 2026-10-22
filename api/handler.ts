import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApiContext } from '../src/server/apiContext';
import { handleApiRequest } from '../src/server/apiRouter';

export const config = { api: { bodyParser: false } };
const MAX_BODY_BYTES = 16 * 1024;

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(part);
  }
  return size > 0 ? Buffer.concat(chunks) : undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.end(JSON.stringify(body));
}

export default async function handler(
  incoming: IncomingMessage,
  outgoing: ServerResponse
): Promise<void> {
  try {
    const body = await readBody(incoming);
    const protocol = incoming.headers['x-forwarded-proto']?.toString().split(',')[0] || 'https';
    const host = incoming.headers.host || 'localhost';
    const requestUrl = new URL(incoming.url || '/', protocol + '://' + host);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = incoming.method || 'GET';
    const apiRequest = new Request(requestUrl, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' || !body ? undefined : new Uint8Array(body),
    });
    const context = await getApiContext();
    const route = requestUrl.searchParams.get('__route') || undefined;
    const response = await handleApiRequest(context, apiRequest, route);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(await response.text());
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
      sendJson(outgoing, 413, {
        ok: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Data permintaan terlalu besar.' },
      });
      return;
    }
    // Avoid logging raw database errors, configuration values, or request data.
    console.error('API handler unavailable:', error instanceof Error ? error.name : 'UnknownError');
    sendJson(outgoing, 503, {
      ok: false,
      error: {
        code: 'API_UNAVAILABLE',
        message: 'Layanan pemain sedang tidak tersedia. Silakan coba kembali nanti.',
      },
    });
  }
}
