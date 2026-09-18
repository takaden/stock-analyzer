// Cloudflare Pages Functions: 全銘柄スクリーナー配信用API
// D1 の v_screener_stocks ビューから全銘柄の最新指標（配当利回り・株価・PER/PBR等）を取得

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: 'D1 database binding "DB" not found.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const url = new URL(request.url);
  const universe = url.searchParams.get('universe'); // 'jpx400' | 'topix100' | 'prime' | 'all'

  try {
    let query = 'SELECT * FROM v_screener_stocks';
    const params: any[] = [];

    if (universe === 'jpx400') {
      query += ' WHERE isJpx400 = 1';
    } else if (universe === 'topix100') {
      query += ' WHERE isTopix100 = 1';
    } else if (universe === 'prime') {
      query += ' WHERE isPrime = 1';
    }

    query += ' ORDER BY marketCap DESC';

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return new Response(JSON.stringify({ data: results, count: results.length }), {
      headers: {
        'Content-Type': 'application/json',
        // Cloudflare CDN エッジで5分間キャッシュ
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('Error querying screener stocks from D1:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to fetch screener stocks' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
