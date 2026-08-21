import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore('gebeya-items');
  const headers = { 'Content-Type': 'application/json' };

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const singleId = url.searchParams.get('id');

      // fetching one item by id returns its full-quality photos (used when
      // someone taps to enlarge a picture)
      if (singleId) {
        const item = await store.get(singleId, { type: 'json' });
        if (!item) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });
        return new Response(JSON.stringify({ _id: singleId, ...item }), { headers });
      }

      // the full list only needs to be fast to load, so send small thumbnails
      // instead of full-size photos when an item has them; older items that
      // were posted before thumbnails existed still send their full photos
      const { blobs } = await store.list();
      const results = await Promise.all(blobs.map(async (blob) => {
        try {
          const data = await store.get(blob.key, { type: 'json' });
          if (!data) return null;
          const { photos, thumbs, ...rest } = data;
          const light = { ...rest, _id: blob.key };
          if (thumbs && thumbs.length) light.thumbs = thumbs;
          else if (photos && photos.length) light.photos = photos;
          return light;
        } catch {
          return null; // skip a corrupted/unreadable item instead of failing the whole request
        }
      }));
      const items = results.filter(Boolean);
      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return new Response(JSON.stringify(items), { headers });
    }

    if (req.method === 'POST') {
      const item = await req.json();
      const id = 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      item.ts = item.ts || Date.now();
      item.likes = 0;
      item.comments = [];
      await store.setJSON(id, item);
      return new Response(JSON.stringify({ _id: id, ...item }), { headers });
    }

    if (req.method === 'PATCH') {
      const body = await req.json();
      const { id, action, text } = body;
      if (!id || !action) return new Response(JSON.stringify({ error: 'missing id/action' }), { status: 400, headers });
      const item = await store.get(id, { type: 'json' });
      if (!item) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });

      if (action === 'like') {
        item.likes = (item.likes || 0) + 1;
      } else if (action === 'unlike') {
        item.likes = Math.max(0, (item.likes || 0) - 1);
      } else if (action === 'comment') {
        const trimmed = (text || '').toString().trim().slice(0, 500);
        if (!trimmed) return new Response(JSON.stringify({ error: 'empty comment' }), { status: 400, headers });
        item.comments = item.comments || [];
        item.comments.push(trimmed);
      } else {
        return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers });
      }

      await store.setJSON(id, item);
      return new Response(JSON.stringify({ _id: id, ...item }), { headers });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers });
      await store.delete(id);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
  }
};

export const config = {
  path: '/api/items'
};
