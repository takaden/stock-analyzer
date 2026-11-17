# J-Quants 日本株分析・可視化 Webアプリケーション

日本取引所グループ（JPX）が提供する「J-Quants API (V2)」（Lightプラン）を利用し、日本株の個別銘柄分析・チャート可視化・全上場銘柄スクリーニング・ウォッチリスト多角財務比較を行う Web アプリケーションです。

フロントエンドは **Cloudflare Pages**、バックエンドAPIおよび事前集計データベースは **Cloudflare Pages Functions + Cloudflare D1 (SQLite) + Cloudflare KV**、日次データ同期は **GitHub Actions 夜間バッチ** で構成されています。

---

## 🌟 主な機能

1. **個別銘柄サマリー & チャート分析**
   - 4桁の銘柄コード入力、またはウォッチリスト登録銘柄のクイック選択に対応。
   - **主要指標表示**: 最新終値、前日比・騰落率、時価総額、出来高、予想年間配当利回り（%）、1株年間配当金（予想優先）、PER、PBR、ROE、EPS、BPS。
   - **配当権利確定月 & 内訳表示**: 中間・期末の確定月と配当内訳（実績 / 予想）をチップ表示。期中株式分割（1:2、1:15等）にも対応したスプリット調整済み配当・利回り算出に対応。
   - **市場感応度（ベータ値: β）分析**: 対 TOPIX（1年 / 3年 / 5年）のβ値・相関係数を算出し、「🛡️ ディフェンシブ」「⚖️ 市場連動」「🚀 景気敏感」の自動判定とグラデーションメーターを表示。
   - **TradingView Lightweight Charts (v5) による日足チャート**:
     - Lightプラン（過去5年間・約1,220営業日・遅延なし）の日足ローソク足＋出来高バーを描画。
     - 単純移動平均線（25日SMA・75日SMA）トグル、期間切替（1M / 3M / 6M / 1Y / 全期間）。
     - **イベントピン留め**: 決算発表日（`E`）と実績年間配当（`D`）を営業日にスナップしてチャート上に表示。
   - **年間配当推移 & 連続増配分析**: 過去5年分の年間配当金推移バーグラフ、連続増配年数バッジ、配当性向・EPS推移テーブルを表示。

2. **銘柄スクリーニング（Cloudflare D1 高速配信）**
   - **ユニバース切替**: `JPX日経400`（デフォルト）、`TOPIX 100`、`プライム市場`、`全銘柄`（約4,000銘柄）。
   - 配当利回り・PER・PBR・時価総額・売買代金・33業種・社名/コード検索による複合フィルタリング。
   - スクリーニング結果からの一括ウォッチリスト登録・個別チャート遷移に対応。

3. **ウォッチリスト多角財務比較 & サーバー同期**
   - **Cloudflare KV**（開発時は `src/data/watchlist.json`）による端末間のウォッチリスト自動共有。
   - **5つの比較タブ**:
     - `基本・株価`: 株価、出来高、時価総額、配当利回り、年間配当金、PER、PBR、ROE
     - `1. 持続力`: 営業CF / 投資CF / フリーCF、過去5期CF推移アコーディオン、FCF恒常性、非減配/連続増配年数、自己資本比率、ベータ値（β）
     - `2. 還元方針`: 配当利回り、1株配当金、配当性向、DOE（自己資本配当率）、自社株買い検知
     - `3. 事業基盤`: 営業利益率、ROE、ROA、EPS中長期成長率（5年CAGR）
     - `4. 総合ビュー`: 業界横断・時系列規律ベースの **10点満点総合適合スコア** と4観点ミニバッジ `[配当][財務][収益][成長]`
   - D1 事前計算済み指標による 0ms 即時描画と、5期CF推移のバックグラウンド自動補完。

4. **二層キャッシュ & レートリミット（60回/分）保護**
   - インメモリ（`Map`）＋ `localStorage` の二層キャッシュにより、再閲覧やタブ切替時の不要な API 通信を削減。
   - ヘッダーに API 残り枠とリセットまでの秒数をリアルタイム表示。
   - 「設定」モーダルからブラウザの `localStorage`（`jq_api_key`）へ API キーを安全に保存・削除可能（ビルド成果物へのキー埋め込みなし）。

---

## 🛠 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite + Tailwind CSS + Lucide React
- **チャート**: TradingView Lightweight Charts v5
- **エッジ API / プロキシ**: Cloudflare Pages Functions (`functions/api/`)
- **データベース / ストレージ**: Cloudflare D1 (SQLite) + Cloudflare KV
- **夜間バッチ / CI**: GitHub Actions (`daily_sync.yml`, `reset_d1.yml`) + TypeScript (`tsx`)
- **品質管理**: Node.js ネイティブテストランナー (`node --test`) + `oxlint`

---

## 🚀 開発・ビルド手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. ローカル D1 の初期化・シード投入（初回のみ）
```bash
# ローカル D1 へスキーマ適用
npx wrangler d1 execute jquants-db --local --file=schema/schema.sql

# 初期シードデータ投入
npx wrangler d1 execute jquants-db --local --file=schema/initial_seed.sql

# マイグレーション適用（必要に応じて）
npm run d1:migrate:local
```

### 3. 開発サーバー起動
```bash
npm run dev
# code-server 環境: https://<お使いのcode-serverドメイン>/absproxy/5173/
```
> ※ Vite の開発ミドルウェア（`vite.config.ts`）が `/api/jq/*` の J-Quants プロキシ、`/api/watchlist`（`src/data/watchlist.json`）、およびローカル D1 エミュレーション（`/api/screener-stocks`, `/api/watchlist-metrics`）を自動で処理します。

### 4. テスト・リント・ビルド
```bash
# 単体テスト実行
npm test

# Linter 実行 (oxlint)
npm run lint

# プロダクションビルド (TypeScript 型チェック + Vite バンドル -> dist/)
npm run build
```

---

## 🌐 Cloudflare Pages デプロイ & 運用

### 方法1: GitHub 連携 (推奨)
1. GitHub リポジトリ（`takaden/stock-analyzer`）へプッシュします。
2. Cloudflare ダッシュボードから **Workers & Pages** > **作成** > **Pages** > **Git に接続** を選択します。
3. ビルド設定を入力します：
   - **フレームワーク プリセット**: `Vite`
   - **ビルドコマンド**: `npm run build`
   - **ビルド出力ディレクトリ**: `dist`
4. Cloudflare Pages の **Settings > Bindings** で以下をバインドします：
   - **D1 database**: 変数名 `DB` → 作成した `jquants-db`
   - **KV namespace**: 変数名 `WATCHLIST_KV` → ウォッチリスト用 KV
5. **重要（セキュリティ）**: Cloudflare Pages の環境変数に J-Quants API キー（`VITE_JQUANTS_API_KEY` 等）は**設定しないでください**。API キーは利用者が画面右上「設定」から各自のブラウザ（`localStorage`）にのみ保存します。

### 方法2: Wrangler CLI で直接デプロイ
```bash
npx wrangler login
npm run build
npx wrangler pages deploy dist --project-name=stock-analyzer
```

### GitHub Actions による D1 自動更新・リセット
- **平日夜間同期** ([`.github/workflows/daily_sync.yml`](.github/workflows/daily_sync.yml)): 平日 18:30 JST に `batch/sync_daily.ts` を実行し、全銘柄の最新株価・開示・計算指標をリモート D1 へ差分更新します。
- **フルリセット** ([`.github/workflows/reset_d1.yml`](.github/workflows/reset_d1.yml)): GitHub Actions 画面からの手動実行（`workflow_dispatch`）により、テーブル再作成および J-Quants API からの過去250営業日データのクリーン再構築を行います。
- 必要な GitHub Secrets: `VITE_JQUANTS_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`。

---

## 📖 開発ガイドライン
アーキテクチャ上の制約や開発ルールの詳細は [AGENTS.md](AGENTS.md) を参照してください。
