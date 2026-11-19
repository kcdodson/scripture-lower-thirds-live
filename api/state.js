import { put, list, head, BlobNotFoundError } from '@vercel/blob';
import { timingSafeEqual, createHash } from 'crypto';

const DEFAULT = {
  ref: '',
  text: '',
  size: 56,
  bg: 'veil',
  show: false,
  library: [],
  updatedAt: 0,
};

const PREFIX = 'state/';
const STABLE = 'state.json';

function normalize(data) {
  return {
    ...DEFAULT,
    ...data,
    library: Array.isArray(data?.library) ? data.library : [],
  };
}

function blobAuth(req) {
  if (!process.env.BLOB_STORE_ID && process.env.BLOB_READ_WRITE_TOKEN_STORE_ID) {
    process.env.BLOB_STORE_ID = process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;
  }
  if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY && process.env.BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY) {
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = process.env.BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN || undefined;
  const hasToken = !!token;
  const hasOidcStore = !!process.env.BLOB_STORE_ID;
  if (!hasToken && !hasOidcStore) return { error: 'Blob store not configured on this project — connect a Vercel Blob store to the project and redeploy' };
  return { blobOpts: hasToken ? { token } : {} };
}

async function fetchJson(url) {
  const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error('blob fetch failed: ' + r.status);
  return r.json();
}

async function readState(blobOpts) {
  let sawExisting = false;

  try {
    const { blobs } = await list({ prefix: PREFIX, limit: 1000, ...blobOpts });
    const files = (blobs || []).filter((b) => /\.json$/i.test(b.pathname || ''));
    files.sort((a, b) => {
      const tb = new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      return tb !== 0 ? tb : String(b.pathname).localeCompare(String(a.pathname));
    });
    if (files.length) sawExisting = true;
    for (const b of files.slice(0, 5)) {
      try {
        return normalize(await fetchJson(b.url));
      } catch (e) {
        console.warn('unique blob fetch failed', b.pathname, e);
      }
    }
  } catch (e) {
    console.warn('list failed', e);
  }

  try {
    const meta = await head(STABLE, blobOpts);
    sawExisting = true;
    return normalize(await fetchJson(meta.url));
  } catch (e) {
    if (e instanceof BlobNotFoundError || /not found/i.test(String(e?.message || e))) {
      if (!sawExisting) return DEFAULT;
    }
    console.warn('stable blob read failed', e);
  }

  // State almost certainly exists but a transient list/fetch miss
  // would otherwise look like "hide the slide" to the overlay.
  if (sawExisting) {
    const err = new Error('Temporary Blob read failure');
    err.statusCode = 503;
    throw err;
  }
  return DEFAULT;
}


function controlKeyMatches(provided) {
  const expected = process.env.CONTROL_KEY;
  if (!expected) return { ok: false, reason: 'Control password is not configured on this project' };
  const a = createHash('sha256').update(String(provided ?? ''), 'utf8').digest();
  const b = createHash('sha256').update(String(expected), 'utf8').digest();
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'Wrong or missing control password' };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const auth = blobAuth(req);
  if (auth.error) return res.status(500).json({ error: auth.error });
  const { blobOpts } = auth;

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await readState(blobOpts));
    }


    if (req.method === 'POST') {
      const gate = controlKeyMatches(req.headers['x-control-key']);
      if (!gate.ok) return res.status(401).json({ error: gate.reason });
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid json' }); }
      }
      const state = {
        ref: String(body?.ref || '').slice(0, 120),
        text: String(body?.text || '').slice(0, 2000),
        size: Math.min(96, Math.max(28, Number(body?.size) || 56)),
        bg: ['veil', 'solid', 'transparent'].includes(body?.bg) ? body.bg : 'veil',
        show: !!body?.show,
        library: Array.isArray(body?.library)
          ? body.library.slice(0, 50).map((x) => ({
              id: String(x.id || ''),
              ref: String(x.ref || '').slice(0, 120),
              text: String(x.text || '').slice(0, 2000),
            }))
          : [],
        updatedAt: Date.now(),
      };
      const uniquePath = `${PREFIX}${state.updatedAt}.json`;
      // Unique object: never overwrites, and its public URL is not a cached
      // copy of a previous slide. Stable state.json is a fallback if list()
      // misses the new file on a later poll.
      await put(uniquePath, JSON.stringify(state), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        ...blobOpts,
      });
      try {
        await put(STABLE, JSON.stringify(state), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          ...blobOpts,
        });
      } catch (e) {
        console.warn('stable state.json write failed', e);
      }
      return res.status(200).json(state);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    const status = e?.statusCode && Number(e.statusCode) >= 400 ? Number(e.statusCode) : 500;
    return res.status(status).json({ error: String(e?.message || e) });
  }
}
