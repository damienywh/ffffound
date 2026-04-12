export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/api/arena/channel') {
      const slug = (url.searchParams.get('slug') || 'ffffound-archive').trim();
      const page = clampInt(url.searchParams.get('page'), 1, 9999, 1);
      const per = clampInt(url.searchParams.get('per'), 12, 100, 36);

      const upstream = new URL(`https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents`);
      upstream.searchParams.set('page', String(page));
      upstream.searchParams.set('per', String(per));

      const cache = caches.default;
      const cacheKey = new Request(upstream.toString(), request);
      let response = await cache.match(cacheKey);
      if (!response) {
        response = await fetch(upstream.toString(), {
          headers: {
            Accept: 'application/json',
            ...(env.ARENA_TOKEN ? { Authorization: `Bearer ${env.ARENA_TOKEN}` } : {})
          },
          cf: { cacheTtl: 300, cacheEverything: true }
        });

        response = new Response(response.body, response);
        response.headers.set('Cache-Control', 'public, max-age=300');
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.headers.set('Vary', 'Origin');
        await cache.put(cacheKey, response.clone());
      } else {
        response = new Response(response.body, response);
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.headers.set('Vary', 'Origin');
      }

      return response;
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value || '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
