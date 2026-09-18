import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  fetchTradingDatesSince,
  fetchDailyBarsByDate,
  fetchValuationsByDate,
  fetchFinsByDate,
  fetchTopixBars,
  RawFinSummary,
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

  // D1 実行モード判定 (CIや環境変数に応じて local / remote を決定)
  const isRemote = process.env.D1_ENV === 'remote' || process.argv.includes('--remote');
  const targetFlag = isRemote ? '--remote' : '--local';

  // 1. D1 から前回同期済み最新日付を取得
  let lastSyncDate: string | null = null;
  try {
    const stdout = execSync(
      `npx wrangler d1 execute jquants-db ${targetFlag} --command="SELECT MAX(date) AS max_date FROM daily_quotes;" --json`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const parsed = JSON.parse(stdout);
    lastSyncDate = parsed[0]?.results[0]?.max_date ?? null;
    console.log(`📅 Last sync date in D1: ${lastSyncDate || 'None (Initial)'}`);
  } catch (e) {
    console.warn('Could not query last sync date from D1, defaulting to latest day:', e);
  }

  // 2. 営業日と未同期期間の特定
  const { latestDate, prevDate, unprocessedDates } = await fetchTradingDatesSince(lastSyncDate);
  console.log(`📅 Target Latest Date: ${latestDate}, Prev Date: ${prevDate}`);
  console.log(`🔄 Catch-up disclosure dates (${unprocessedDates.length} days): [${unprocessedDates.join(', ')}]`);

  // 3. 本日の株価四本値・前日日足・バリュエーション取得
  const [latestBars, prevBars, valuations, topixBars] = await Promise.all([
    fetchDailyBarsByDate(latestDate),
    fetchDailyBarsByDate(prevDate),
    fetchValuationsByDate(latestDate),
    fetchTopixBars(),
  ]);

  // 未同期営業日（1日〜最大30営業日）の決算開示を全件キャッチアップ取得
  const allDisclosures: RawFinSummary[] = [];
  for (const targetDate of unprocessedDates) {
    console.log(`📡 Fetching disclosures for date ${targetDate}...`);
    const fins = await fetchFinsByDate(targetDate);
    console.log(`  - Date ${targetDate}: ${fins.length} disclosures found.`);
    allDisclosures.push(...fins);
  }

  console.log(`✅ Fetched: ${latestBars.length} bars, ${valuations.length} valuations, ${allDisclosures.length} total catch-up disclosures.`);

  const prevCloseMap = new Map<string, number>();
  prevBars.forEach((b) => prevCloseMap.set(b.Code, b.C));

  const barMap = new Map<string, (typeof latestBars)[0]>();
  latestBars.forEach((b) => barMap.set(b.Code, b));

  const valMap = new Map<string, (typeof valuations)[0]>();
  valuations.forEach((v) => valMap.set(v.Code, v));

  // 4. 決算開示キャッシュの更新
  const finsCachePath = path.join(CACHE_DIR, 'all_fins_cache.json');
  let finsByCode: Record<string, FinSummary[]> = {};
  if (fs.existsSync(finsCachePath)) {
    try {
      finsByCode = JSON.parse(fs.readFileSync(finsCachePath, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse fins cache:', e);
    }
  }

  // キャッチアップ期間中に開示があった銘柄コード集合
  const updatedStockCodes = new Set<string>();

  allDisclosures.forEach((f) => {
    const code4 = f.Code.replace(/0$/, '');
    if (!finsByCode[code4]) finsByCode[code4] = [];
    const exists = finsByCode[code4].some(
      (existing) => existing.DiscDate === f.DiscDate && existing.CurPerType === f.CurPerType
    );
    if (!exists) {
      finsByCode[code4].push(f as FinSummary);
    }
    updatedStockCodes.add(code4);
  });

  fs.writeFileSync(finsCachePath, JSON.stringify(finsByCode), 'utf-8');
  console.log(`📝 Updated disclosures for ${updatedStockCodes.size} stocks.`);

  // 5. SQL 差分ステートメントの作成
  const sqlStatements: string[] = [];
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

  // (C) キャッチアップ期間中に発表された決算開示の financial_disclosures 保存
  for (const f of allDisclosures) {
    const code4 = f.Code.replace(/0$/, '');
    sqlStatements.push(`INSERT OR REPLACE INTO financial_disclosures (
      code, disc_date, cur_per_type, cur_per_en, sales, op, rp, np, eps, f_eps,
      cfo, cfi, sh_eq, ta, eq_ar, div_ann, f_div_ann, raw_json, created_at
    ) VALUES (
      ${escapeSql(code4)}, ${escapeSql(f.DiscDate)}, ${escapeSql(f.CurPerType)}, ${escapeSql(f.CurPerEn)},
      ${escapeSql(f.Sales)}, ${escapeSql(f.OP)}, ${escapeSql(f.RP)}, ${escapeSql(f.NP)}, ${escapeSql(f.EPS)}, ${escapeSql(f.FEPS)},
      ${escapeSql(f.CFO)}, ${escapeSql(f.CFI)}, ${escapeSql((f as any).ShEq ?? (f as any).Eq)}, ${escapeSql(f.TA)}, ${escapeSql((f as any).EqAR)},
      ${escapeSql(f.DivAnn)}, ${escapeSql(f.FDivAnn)}, ${escapeSql(JSON.stringify(f))}, ${escapeSql(nowStr)}
    );`);
  }

  // (D) calculated_metrics 更新:
  // 1. 本日決算・配当開示があった銘柄 -> 最新財務サマリーに基づき完全再計算＆UPSERT (既存ベータ値は保持)
  for (const code4 of updatedStockCodes) {
    const bar = barMap.get(`${code4}0`) || barMap.get(code4);
    const currentPrice = bar?.C || 0;
    const fins = (finsByCode[code4] || []).sort((a, b) => b.DiscDate.localeCompare(a.DiscDate));
    const row = buildCalculatedMetricsRow(code4, fins, currentPrice, undefined, topixBars);

    sqlStatements.push(`INSERT INTO calculated_metrics (
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
      ${escapeSql(row.roa)}, ${row.is_roa_good}, ${escapeSql(row.eps_5year_cagr)}, ${escapeSql(row.eps_trend)},
      ${escapeSql(row.beta_1year)}, ${escapeSql(row.beta_3year)}, ${escapeSql(row.beta_5year)},
      ${escapeSql(row.beta_correlation)}, ${escapeSql(row.beta_category)}, ${escapeSql(row.beta_label)},
      ${escapeSql(row.beta_badge_emoji)}, ${row.score_passed}, ${row.score_total}, ${escapeSql(row.updated_at)}
    )
    ON CONFLICT(code) DO UPDATE SET
      dps_annual = excluded.dps_annual,
      dps_type = excluded.dps_type,
      dividend_yield = COALESCE(excluded.dividend_yield, calculated_metrics.dividend_yield),
      latest_cfo = excluded.latest_cfo,
      latest_cfi = excluded.latest_cfi,
      latest_fcf = excluded.latest_fcf,
      cf_history_json = excluded.cf_history_json,
      fcf_positive_count = excluded.fcf_positive_count,
      fcf_total_count = excluded.fcf_total_count,
      is_fcf_consistently_positive = excluded.is_fcf_consistently_positive,
      non_reduction_years = excluded.non_reduction_years,
      is_no_dividend_cut_5years = excluded.is_no_dividend_cut_5years,
      equity_ratio = excluded.equity_ratio,
      payout_ratio = excluded.payout_ratio,
      payout_ratio_status = excluded.payout_ratio_status,
      doe = excluded.doe,
      is_doe_high = excluded.is_doe_high,
      op_margin = excluded.op_margin,
      roe = excluded.roe,
      is_roe_good = excluded.is_roe_good,
      roa = excluded.roa,
      is_roa_good = excluded.is_roa_good,
      eps_5year_cagr = excluded.eps_5year_cagr,
      eps_trend = excluded.eps_trend,
      beta_1year = COALESCE(excluded.beta_1year, calculated_metrics.beta_1year),
      beta_3year = COALESCE(excluded.beta_3year, calculated_metrics.beta_3year),
      beta_5year = COALESCE(excluded.beta_5year, calculated_metrics.beta_5year),
      beta_correlation = COALESCE(excluded.beta_correlation, calculated_metrics.beta_correlation),
      beta_category = COALESCE(excluded.beta_category, calculated_metrics.beta_category),
      beta_label = COALESCE(excluded.beta_label, calculated_metrics.beta_label),
      beta_badge_emoji = COALESCE(excluded.beta_badge_emoji, calculated_metrics.beta_badge_emoji),
      score_passed = excluded.score_passed,
      score_total = excluded.score_total,
      updated_at = excluded.updated_at;`);
  }

  // 2. 本日決算開示がなかった銘柄 -> 既存の財務指標・ベータ値を一切破壊せず、株価変動に伴う配当利回りのみを安全に更新
  for (const [rawCode, bar] of barMap.entries()) {
    const code4 = rawCode.replace(/0$/, '');
    if (updatedStockCodes.has(code4)) continue;
    const currentPrice = bar.C || 0;
    if (currentPrice > 0) {
      sqlStatements.push(`UPDATE calculated_metrics SET
        dividend_yield = CASE WHEN dps_annual IS NOT NULL AND dps_annual > 0 THEN ROUND(CAST(dps_annual AS REAL) / ${currentPrice} * 100, 2) ELSE dividend_yield END,
        updated_at = ${escapeSql(nowStr)}
      WHERE code = ${escapeSql(code4)};`);
    }
  }

  const diffSqlPath = path.resolve('batch/.cache/daily_sync.sql');
  fs.writeFileSync(diffSqlPath, sqlStatements.join('\n'), 'utf-8');
  console.log(`📝 Generated daily sync SQL (${(fs.statSync(diffSqlPath).size / 1024).toFixed(1)} KB).`);

  console.log(`🚀 Executing sync on D1 (${targetFlag})...`);
  try {
    execSync(`npx wrangler d1 execute jquants-db ${targetFlag} --file=${diffSqlPath}`, { stdio: 'inherit' });
    console.log(`🎉 Daily sync completed successfully on D1 (${targetFlag})!`);
  } catch (err) {
    console.error('Failed to execute SQL on D1:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Daily sync failed:', err);
  process.exitCode = 1;
});
