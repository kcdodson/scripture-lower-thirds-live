import { put, list } from '@vercel/blob';

const DEFAULT = {
  ref: '',
  text: '',
  size: 56,
  bg: 'veil',
  show: false,
  library: [],
  updatedAt: 0,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Map prefixed OIDC vars (created when a custom env-var prefix was set
  // on the Blob store connection) to the plain names the SDK reads.
  // These are a fallback only — the plain BLOB_STORE_ID /
  // BLOB_WEBHOOK_PUBLIC_KEY set by a normal connection are used first.
  if (!process.env.BLOB_STORE_ID && process.env.BLOB_READ_WRITE_TOKEN_STORE_ID) {
    process.env.BLOB_STORE_ID = process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;
  }
  if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY && process.env.BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY) {
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = process.env.BLOB_READ_WRITE_TOKEN_WEBHOOK_PUBLIC_KEY;
  }

  // Auth: either a long-lived read-write token, OR Vercel Blob OIDC
  // (BLOB_STORE_ID + VERCEL_OIDC_TOKEN, which Vercel injects at runtime
  // and the @vercel/blob SDK reads automatically). Do not pass a token
  // explicitly when none is present — let the SDK use OIDC.
  const token = process.env.BLOB_READ_WRITE_TOKEN || undefined;
  const hasToken = !!token;
  const hasOidcStore = !!process.env.BLOB_STORE_ID;
  if (!hasToken && !hasOidcStore) {
    return res.status(500).json({ error: 'Blob store not configured on this project — connect a Vercel Blob store to the project and redeploy' });
  }
  const blobOpts = hasToken ? { token } : {};
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'state.json', ...blobOpts });
      const b = blobs.find((x) => x.pathname === 'state.json');
      if (!b) return res.status(200).json(DEFAULT);
      const r = await fetch(b.url, { cache: 'no-store' });
      if (!r.ok) return res.status(200).json(DEFAULT);
      const data = await r.json();
      return res.status(200).json({
        ...DEFAULT,
        ...data,
        library: Array.isArray(data.library) ? data.library : [],
      });
    }

    if (req.method === 'POST') {
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
      await put('state.json', JSON.stringify(state), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        ...blobOpts,
      });
      return res.status(200).json(state);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
