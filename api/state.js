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
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured on this project' });
  }
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'state.json' });
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
