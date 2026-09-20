// Cloudflare Pages Functions: ウォッチリスト詳細財務指標API
// D1 の calculated_metrics テーブルから指定された銘柄コード群の事前計算済み指標を一括取得
import { mapCalculatedMetricsRowToItem } from '../../src/utils/metricsMapper';

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
  const codesParam = url.searchParams.get('codes'); // カンマ区切り: '7203,1928,8306'

  if (!codesParam) {
    return new Response(JSON.stringify({ data: {} }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const codes = codesParam
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (codes.length === 0) {
    return new Response(JSON.stringify({ data: {} }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // SQLite バインド変数上限対策: 最大100件ずつチャンク分割してクエリ
    const CHUNK_SIZE = 100;
    const allResults: any[] = [];

    for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
      const chunk = codes.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const query = `SELECT * FROM calculated_metrics WHERE code IN (${placeholders})`;
      const { results } = await env.DB.prepare(query).bind(...chunk).all();
      if (results && results.length > 0) {
        allResults.push(...results);
      }
    }

    // Map 形式 (code -> WatchlistFinancials) に整形
    const metricsMap: Record<string, any> = {};
    for (const r of allResults) {
      metricsMap[r.code] = mapCalculatedMetricsRowToItem(r);
    }

    return new Response(JSON.stringify({ data: metricsMap }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('Error querying watchlist metrics from D1:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to fetch watchlist metrics' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
