/**
 * Cloudflare Pages Functions - サーバー共通ウォッチリスト API
 * 複数端末間で共有される単一のウォッチリストを Cloudflare KV に永続化します。
 */

interface Env {
  WATCHLIST_KV?: KVNamespace;
}

const STORAGE_KEY = 'shared_watchlist';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // CORS プリフライト対応
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const kv = env.WATCHLIST_KV;
  if (!kv) {
    // KVが未バインドの場合の安全なフォールバック
    return new Response(
      JSON.stringify({
        success: false,
        warning: 'KV_NOT_BOUND',
        message: 'Cloudflare KV (WATCHLIST_KV) is not bound. Falling back to client-only mode.',
        codes: null,
      }),
      { status: 200, headers }
    );
  }

  try {
    if (request.method === 'GET') {
      const data = await kv.get(STORAGE_KEY);
      const codes: string[] = data ? JSON.parse(data) : [];
      return new Response(JSON.stringify({ success: true, codes }), {
        status: 200,
        headers,
      });
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as { codes?: string[] };
      if (!body || !Array.isArray(body.codes)) {
        return new Response(
          JSON.stringify({ success: false, error: 'INVALID_PAYLOAD', message: 'codes must be an array' }),
          { status: 400, headers }
        );
      }

      // 重複排除とクリーニング
      const uniqueCodes = Array.from(new Set(body.codes.map((c) => String(c).trim()))).filter(Boolean);
      await kv.put(STORAGE_KEY, JSON.stringify(uniqueCodes));

      return new Response(
        JSON.stringify({ success: true, count: uniqueCodes.length, codes: uniqueCodes }),
        { status: 200, headers }
      );
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers,
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }),
      { status: 500, headers }
    );
  }
};
