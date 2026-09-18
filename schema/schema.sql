-- Cloudflare D1 (SQLite) スキーマ定義
-- J-Quants 日本株分析・全銘柄スクリーナー＆ウォッチリスト基盤

-- 1. 銘柄マスターテーブル
CREATE TABLE IF NOT EXISTS stocks (
  code TEXT PRIMARY KEY,               -- 4桁コード (例: '7203')
  raw_code TEXT NOT NULL,              -- 5桁コード (例: '72030')
  name TEXT NOT NULL,                 -- 会社名 (例: 'トヨタ自動車')
  market TEXT NOT NULL,               -- 市場区分 (プライム, スタンダード, グロース)
  sector TEXT NOT NULL,               -- 33業種 (例: '輸送用機器')
  scale_cat TEXT NOT NULL,            -- 規模区分 (TOPIX Core30, Large70, Mid400, Small等)
  is_jpx400 INTEGER NOT NULL DEFAULT 0,
  is_topix100 INTEGER NOT NULL DEFAULT 0,
  is_prime INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stocks_market ON stocks (market);
CREATE INDEX IF NOT EXISTS idx_stocks_sector ON stocks (sector);

-- 2. 最新日足株価テーブル
CREATE TABLE IF NOT EXISTS daily_quotes (
  code TEXT PRIMARY KEY,
  date TEXT NOT NULL,                 -- 営業日付 (YYYY-MM-DD)
  close REAL,                         -- 終値 (出来高0銘柄等のためNULL許容)
  open REAL,
  high REAL,
  low REAL,
  volume REAL,                        -- 出来高 (株)
  prev_close REAL,                    -- 前日終値 (円)
  price_change REAL,                  -- 前日比 (円)
  price_change_percent REAL,          -- 騰落率 (%)
  market_cap REAL,                    -- 時価総額 (百万円)
  updated_at TEXT NOT NULL
);

-- 3. 最新バリュエーション指標テーブル
CREATE TABLE IF NOT EXISTS valuations (
  code TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  per REAL,                           -- 実績PER (倍)
  fwd_per REAL,                       -- 予想PER (倍)
  pbr REAL,                           -- PBR (倍)
  roe REAL,                           -- 実績ROE (%)
  fwd_roe REAL,                       -- 予想ROE (%)
  updated_at TEXT NOT NULL
);

-- 4. 決算開示サマリー履歴テーブル
CREATE TABLE IF NOT EXISTS financial_disclosures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  disc_date TEXT NOT NULL,            -- 開示日 (YYYY-MM-DD)
  cur_per_type TEXT NOT NULL,         -- 1Q, 2Q, 3Q, FY
  cur_fy_en TEXT,                     -- 会計年度終了日
  cur_per_en TEXT,                    -- 会計期間終了日
  sales REAL,
  op REAL,
  np REAL,
  eps REAL,
  f_eps REAL,
  cfo REAL,
  cfi REAL,
  sh_eq REAL,
  ta REAL,
  eq_ar REAL,
  div_ann REAL,
  f_div_ann REAL,
  raw_json TEXT NOT NULL,             -- FinSummary の生JSON
  created_at TEXT NOT NULL,
  UNIQUE(code, disc_date, cur_per_type)
);

CREATE INDEX IF NOT EXISTS idx_findisc_code ON financial_disclosures (code);
CREATE INDEX IF NOT EXISTS idx_findisc_date ON financial_disclosures (disc_date);

-- 5. 事前計算済み財務指標テーブル (スクリーナー & ウォッチリスト爆速化用)
CREATE TABLE IF NOT EXISTS calculated_metrics (
  code TEXT PRIMARY KEY,
  dps_annual REAL,                    -- 最新年間配当金 (予想優先, 円)
  dps_type TEXT,                      -- 'forecast' または 'actual'
  dividend_yield REAL,                -- 最新配当利回り (%)
  latest_cfo REAL,                    -- 直近期営業CF (百万円)
  latest_cfi REAL,                    -- 直近期投資CF (百万円)
  latest_fcf REAL,                    -- 直近期フリーCF (百万円)
  cf_history_json TEXT,               -- 過去5期CF推移のJSON配列
  fcf_positive_count INTEGER,         -- 過去5期FCF黒字年数
  fcf_total_count INTEGER,
  is_fcf_consistently_positive INTEGER,
  non_reduction_years INTEGER,        -- 非減配年数
  is_no_dividend_cut_5years INTEGER,
  equity_ratio REAL,                  -- 自己資本比率 (%)
  payout_ratio REAL,                  -- 配当性向 (%)
  payout_ratio_status TEXT,           -- 'healthy', 'moderate', 'warning', 'danger'
  doe REAL,                           -- 自己資本配当率 (%)
  is_doe_high INTEGER,
  op_margin REAL,                     -- 営業利益率 (%)
  roe REAL,                           -- ROE (%)
  is_roe_good INTEGER,
  roa REAL,                           -- ROA (%)
  is_roa_good INTEGER,
  eps_5year_cagr REAL,                -- EPS 5年成長率 (%)
  eps_trend TEXT,
  beta_1year REAL,                    -- 1年ベータ値 (β)
  beta_3year REAL,
  beta_5year REAL,
  beta_correlation REAL,
  beta_category TEXT,                 -- 'defensive', 'neutral', 'cyclical'
  beta_label TEXT,                    -- 'ディフェンシブ', '市場連動', '景気敏感'
  beta_badge_emoji TEXT,              -- '🛡️', '⚖️', '🚀'
  score_passed INTEGER,
  score_total INTEGER,
  updated_at TEXT NOT NULL
);

-- 6. スクリーナー配信用統合ビュー
CREATE VIEW IF NOT EXISTS v_screener_stocks AS
SELECT
  s.code,
  s.raw_code AS rawCode,
  s.name,
  s.market,
  s.sector,
  s.scale_cat AS scaleCat,
  s.is_jpx400 AS isJpx400,
  s.is_topix100 AS isTopix100,
  s.is_prime AS isPrime,
  q.date AS latestDate,
  COALESCE(q.close, 0) AS currentPrice,
  q.prev_close AS previousClose,
  q.price_change AS priceChange,
  q.price_change_percent AS priceChangePercent,
  COALESCE(q.volume, 0) AS volume,
  COALESCE(q.market_cap, 0) AS marketCap,
  m.dps_annual AS dpsAnnual,
  m.dividend_yield AS dividendYield,
  v.per,
  v.fwd_per AS fwdPer,
  v.pbr,
  COALESCE(m.roe, v.fwd_roe, v.roe) AS roe,
  m.latest_fcf AS latestFcf,
  m.equity_ratio AS equityRatio,
  m.doe,
  m.beta_1year AS beta1Year,
  m.beta_category AS betaCategory,
  m.beta_label AS betaLabel,
  m.beta_badge_emoji AS betaBadgeEmoji
FROM stocks s
LEFT JOIN daily_quotes q ON s.code = q.code
LEFT JOIN valuations v ON s.code = v.code
LEFT JOIN calculated_metrics m ON s.code = m.code;
