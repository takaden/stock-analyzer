import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  fetchLatestTradingDate,
  fetchDailyBarsByDate,
  fetchValuationsByDate,
  fetchFinsByDate,
  fetchTopixBars,
} from './lib/jquantsClient';
import { buildCalculatedMetricsRow } from './lib/metricsCalculator';
import type { FinSummary } from '../src/types/jquants';

const CACHE_DIR = path.resolve('batch/.cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function escapeSql(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
  console.log('🌙 Starting Daily Sync Batch for J-Quants & Cloudflare D1...');

  // 1. 最新営業日と前営業日を特定
  const { latestDate, prevDate } = await fetchLatestTradingDate();
  console.log(`📅 Target Latest Date: ${latestDate}, Prev Date: ${prevDate}`);

  // 2. 本日の株価四本値・前日日足・バリュエーション取得
  const [latestBars, prevBars, valuations, todayFins, topixBars] = await Promise.all([
    fetchDailyBarsByDate(latestDate),
    fetchDailyBarsByDate(prevDate),
    fetchValuationsByDate(latestDate),
    fetchFinsByDate(latestDate),
    fetchTopixBars(),
  ]);

  console.log(`✅ Fetched: ${latestBars.length} bars, ${valuations.length} valuations, ${todayFins.length} today disclosures.`);

  const prevCloseMap = new Map<string, number>();
  prevBars.forEach((b) => prevCloseMap.set(b.Code, b.C));

  const barMap = new Map<string, (typeof latestBars)[0]>();
  latestBars.forEach((b) => barMap.set(b.Code, b));

  const valMap = new Map<string, (typeof valuations)[0]>();
  valuations.forEach((v) => valMap.set(v.Code, v));

  // 3. 決算開示キャッシュの更新
  const finsCachePath = path.join(CACHE_DIR, 'all_fins_cache.json');
  let finsByCode: Record<string, FinSummary[]> = {};
  if (fs.existsSync(finsCachePath)) {
    try {
      finsByCode = JSON.parse(fs.readFileSync(finsCachePath, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse fins cache:', e);
    }
  }

  // 本日開示があった銘柄コード集合
  const updatedStockCodes = new Set<string>();

  todayFins.forEach((f) => {
    const code4 = f.Code.replace(/0$/, '');
    if (!finsByCode[code4]) finsByCode[code4] = [];
    const exists = finsByCode[code4].some(
      (existing) => existing.DiscDate === f.DiscDate && existing.CurPerType === f.CurPerType
    );
    if (!exists) {
      finsByCode[code4].push(f as FinSummary);
      updatedStockCodes.add(code4);
    }
  });

  fs.writeFileSync(finsCachePath, JSON.stringify(finsByCode), 'utf-8');
  console.log(`📝 Updated disclosures for ${updatedStockCodes.size} stocks.`);

  // 4. SQL 差分ステートメントの作成
  const sqlStatements: string[] = ['BEGIN TRANSACTION;'];
  const nowStr = new Date().toISOString();

  // (A) daily_quotes 更新 (全銘柄)
  for (const [rawCode, bar] of barMap.entries()) {
    const code4 = rawCode.replace(/0$/, '');
    const prevClose = prevCloseMap.get(rawCode) ?? null;
    const priceChange = prevClose != null && bar.C ? bar.C - prevClose : null;
    const priceChangePercent = prevClose != null && prevClose > 0 && priceChange != null ? (priceChange / prevClose) * 100 : null;

    sqlStatements.push(`INSERT OR REPLACE INTO daily_quotes (code, date, close, open, high, low, volume, prev_close, price_change, price_change_percent, market_cap, updated_at) VALUES (${escapeSql(code4)}, ${escapeSql(bar.Date)}, ${escapeSql(bar.C)}, ${escapeSql(bar.O)}, ${escapeSql(bar.H)}, ${escapeSql(bar.L)}, ${escapeSql(bar.Vo)}, ${escapeSql(prevClose)}, ${escapeSql(priceChange)}, ${escapeSql(priceChangePercent)}, ${escapeSql(bar.MktCap ?? null)}, ${escapeSql(nowStr)});`);
  }

  // (B) valuations 更新 (全銘柄)
  for (const [rawCode, val] of valMap.entries()) {
    const code4 = rawCode.replace(/0$/, '');
    sqlStatements.push(`INSERT OR REPLACE INTO valuations (code, date, per, fwd_per, pbr, roe, fwd_roe, updated_at) VALUES (${escapeSql(code4)}, ${escapeSql(val.Date)}, ${escapeSql(val.PER ?? null)}, ${escapeSql(val.FwdPER ?? null)}, ${escapeSql(val.PBR ?? null)}, ${escapeSql(val.ROE ? val.ROE * 100 : null)}, ${escapeSql(val.FwdROE ? val.FwdROE * 100 : null)}, ${escapeSql(nowStr)});`);
  }

  // (C) calculated_metrics:
  // 株価変動により配当利回り・PER等の再計算が必要な銘柄、または決算更新のあった銘柄
  // （4,000銘柄の計算は数秒で終わるため、全銘柄を最新株価で再計算して更新）
  for (const [rawCode, bar] of barMap.entries()) {
    const code4 = rawCode.replace(/0$/, '');
    const fins = (finsByCode[code4] || []).sort((a, b) => b.DiscDate.localeCompare(a.DiscDate));
    const currentPrice = bar.C || 0;

    const row = buildCalculatedMetricsRow(code4, fins, currentPrice, undefined, topixBars);

    sqlStatements.push(`INSERT OR REPLACE INTO calculated_metrics (
      code, dps_annual, dps_type, dividend_yield, latest_cfo, latest_cfi, latest_fcf,
      cf_history_json, fcf_positive_count, fcf_total_count, is_fcf_consistently_positive,
      non_reduction_years, is_no_dividend_cut_5years, equity_ratio, payout_ratio,
      payout_ratio_status, doe, is_doe_high, op_margin, roe, is_roe_good, roa,
      is_roa_good, eps_5year_cagr, eps_trend, beta_1year, beta_3year, beta_5year,
      beta_correlation, beta_category, beta_label, beta_badge_emoji, score_passed,
      score_total, updated_at
    ) VALUES (
      ${escapeSql(row.code)}, ${escapeSql(row.dps_annual)}, ${escapeSql(row.dps_type)}, ${escapeSql(row.dividend_yield)},
      ${escapeSql(row.latest_cfo)}, ${escapeSql(row.latest_cfi)}, ${escapeSql(row.latest_fcf)}, ${escapeSql(row.cf_history_json)},
      ${row.fcf_positive_count}, ${row.fcf_total_count}, ${row.is_fcf_consistently_positive},
      ${row.non_reduction_years}, ${row.is_no_dividend_cut_5years}, ${escapeSql(row.equity_ratio)},
      ${escapeSql(row.payout_ratio)}, ${escapeSql(row.payout_ratio_status)}, ${escapeSql(row.doe)},
      ${row.is_doe_high}, ${escapeSql(row.op_margin)}, ${escapeSql(row.roe)}, ${row.is_roe_good},
      ${escapeSql(row.roa)}, ${row.is_roe_good}, ${escapeSql(row.eps_5year_cagr)}, ${escapeSql(row.eps_trend)},
      ${escapeSql(row.beta_1year)}, ${escapeSql(row.beta_3year)}, ${escapeSql(row.beta_5year)},
      ${escapeSql(row.beta_correlation)}, ${escapeSql(row.beta_category)}, ${escapeSql(row.beta_label)},
      ${escapeSql(row.beta_badge_emoji)}, ${row.score_passed}, ${row.score_total}, ${escapeSql(row.updated_at)}
    );`);
  }

  sqlStatements.push('COMMIT;');

  const diffSqlPath = path.resolve('batch/.cache/daily_sync.sql');
  fs.writeFileSync(diffSqlPath, sqlStatements.join('\n'), 'utf-8');
  console.log(`📝 Generated daily sync SQL (${(fs.statSync(diffSqlPath).size / 1024).toFixed(1)} KB).`);

  // D1 実行モード判定 (CIや環境変数に応じて local / remote を実行)
  const isRemote = process.env.D1_ENV === 'remote' || process.argv.includes('--remote');
  const targetFlag = isRemote ? '--remote' : '--local';

  console.log(`🚀 Executing sync on D1 (${targetFlag})...`);
  try {
    execSync(`npx wrangler d1 execute jquants-db ${targetFlag} --file=${diffSqlPath}`, { stdio: 'inherit' });
    console.log(`🎉 Daily sync completed successfully on D1 (${targetFlag})!`);
  } catch (err) {
    console.error('Failed to execute SQL on D1:', err);
    process.exit(1);
  }
}

main().catch(console.error);
