import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

// Shared EC2 URL only: every viewer polls get* functions every 30s, so identical calls share one
// Datadog backend run per TTL instead of multiplying API calls by the number of attendees.
const ROUTE = '/__dd/executeAction';
const BYPASS = 'x-pulse-cache-bypass';
const TTL_MS = 20_000;
const ADMIN_TTL_MS = 3_000;

type Entry = { at: number; body: Promise<{ status: number; text: string }> };

const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });

export function sharedCache(): Plugin {
    const cache = new Map<string, Entry>();
    return {
        name: 'pulse-shared-cache',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.method !== 'POST' || req.url !== ROUTE || req.headers[BYPASS]) return next();
                const raw = await readBody(req);
                let fn = '';
                try {
                    fn = String((JSON.parse(raw) as { functionName?: string }).functionName ?? '').split('.').pop() ?? '';
                } catch {
                    /* forwarded as-is; the Datadog handler reports the error */
                }
                const port = server.config.server.port ?? 5173;
                const forward = async () => {
                    const r = await fetch(`http://127.0.0.1:${port}${ROUTE}`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', [BYPASS]: '1' },
                        body: raw,
                    });
                    return { status: r.status, text: await r.text() };
                };
                const send = ({ status, text }: { status: number; text: string }) => {
                    res.statusCode = status;
                    res.setHeader('content-type', 'application/json');
                    res.end(text);
                };
                try {
                    if (!fn.startsWith('get')) {
                        // Mutations (setFault, setCampaign) must be visible on the next admin poll.
                        for (const k of cache.keys()) if (k.includes('getAdminState')) cache.delete(k);
                        return send(await forward());
                    }
                    const ttl = fn === 'getAdminState' ? ADMIN_TTL_MS : TTL_MS;
                    const hit = cache.get(raw);
                    if (hit && Date.now() - hit.at < ttl) return send(await hit.body);
                    const entry: Entry = { at: Date.now(), body: forward() };
                    cache.set(raw, entry);
                    const out = await entry.body.catch((e: unknown) => {
                        if (cache.get(raw) === entry) cache.delete(raw);
                        throw e;
                    });
                    if ((out.status !== 200 || !out.text.startsWith('{"success":true')) && cache.get(raw) === entry) {
                        cache.delete(raw);
                    }
                    send(out);
                } catch (e) {
                    res.statusCode = 502;
                    res.end(String(e));
                }
            });
        },
    };
}
