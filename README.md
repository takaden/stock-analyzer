# J-Quants 日本株分析ツール (MVP)

日本取引所グループ（JPX）の「J-Quants API (V2)」を利用して、日本株の個別銘柄情報の確認、株価・配当利回り・主要投資指標（PER/PBR等）の表示、および過去約2年間の株価チャート分析を行うWebアプリケーションです。

Cloudflare Pagesへの静的ホスティング（SPA）を前提に設計されています。

---

## 🌟 主な機能

1. **個別銘柄サマリー表示**:
   - 4桁の銘柄コード（例: `7203`）を入力してデータ取得。
   - 代表銘柄クイック選択（トヨタ、三菱UFJ、NTT、ソニーG、任天堂、三菱商事）。
   - 銘柄名、所属市場（プライム等）、33業種。
   - 最新株価（終値）、前日比・騰落率、時価総額、出来高。
   - **年間配当利回り（%）** および 1株当たり年間配当金（予想優先 / 実績）。
   - **主要投資指標**: PER（株価収益率）、PBR（純資産倍率）、ROE、EPS、BPS。
2. **TradingView Lightweight Charts による日足推移グラフ**:
   - Freeプラン上限の過去約2年分（約480営業日）の日足データを高速描画。
   - ローソク足チャート ＋ 出来高バー（出来高に応じた色分け）。
   - 単純移動平均線（25日SMA・75日SMA）の表示/非表示トグル。
   - 期間切り替えボタン（1M / 3M / 6M / 1Y / 全期間）。
   - ドラッグでの移動、ホイールによるズーム対応。
3. **ローカルキャッシュ & レートリミット（5回/分）保護**:
   - Freeプランの厳格な制限（5リクエスト/分）および12週遅延に対応。
   - 取得済みデータはブラウザの `localStorage` にTTL付きで保存。同一銘柄の再閲覧時に無駄なAPI呼び出しを行わず即時表示。
   - ヘッダーに現在のAPI残り枠と解除までの秒数をリアルタイム表示。
4. **APIキー設定モーダル**:
   - 画面右上「設定」から自分専用のAPIキーをいつでも変更可能。
   - キャッシュの一括クリア機能。

---

## 🛠 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **スタイリング**: Tailwind CSS + Lucide React
- **チャート**: TradingView Lightweight Charts v5
- **デプロイ先**: Cloudflare Pages (静的SPA)

---

## 🚀 開発・ビルド手順

### 依存関係のインストール
```bash
npm install
```

### 開発サーバー起動
```bash
npm run dev
# https://<お使いのcode-serverのドメイン>/proxy/5173/
# (末尾のスラッシュ / を必ず付けてください)
```

### テスト実行
```bash
npm test
```

### プロダクションビルド
```bash
npm run build
```
ビルド結果は `dist/` ディレクトリに出力されます。

---

## 🌐 Cloudflare Pages へのデプロイ手順

### 方法1: GitHub 連携 (推奨・自動CI/CD)
1. GitHubリポジトリ（`takaden/stock-analyzer`）に本プロジェクトをプッシュします。
   ```bash
   git push origin main
   ```
2. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) にアクセスし、左メニューから **Workers & Pages** > **作成 (Create)** をクリック。
3. **Pages** タブを選択し、**Git に接続 (Connect to Git)** をクリック。
4. 対象の GitHub リポジトリ（`takaden/stock-analyzer`）を選択して「セットアップを開始」。
5. ビルド設定を入力します：
   - **プロジェクト名**: `stock-analyzer`（任意）
   - **本番ブランチ**: `main`
   - **フレームワーク プリセット**: `Vite`
   - **ビルドコマンド**: `npm run build`
   - **ビルド出力ディレクトリ**: `dist`
6. **環境変数 (オプション)**:
   - 必要に応じて `NODE_VERSION` に `22` を設定（リポジトリ内の `.node-version` / `.nvmrc` でも自動認識されます）。
   - **重要**: セキュリティ保護のため、Cloudflare の環境変数に J-Quants APIキー（`VITE_JQUANTS_API_KEY` 等）は**絶対に設定しないでください**。APIキーは各利用者がブラウザ画面右上「設定」から `localStorage` にのみ安全に保存して利用します。
7. **[保存してデプロイ]** をクリック。
   - `dist/` ディレクトリの静的アセットに加え、`functions/api/jq/[[path]].ts`（J-Quants API CORS回避プロキシ）が自動的に Cloudflare Pages Functions としてビルド・デプロイされます。
   - 数分で全世界のエッジネットワークに配信され、`https://<プロジェクト名>.pages.dev` で利用可能になります。

---

### 方法2: Wrangler CLI で直接デプロイ
```bash
# ログイン (初回のみ)
npx wrangler login

# プロダクションビルド
npm run build

# dist ディレクトリと functions をデプロイ
npx wrangler pages deploy dist --project-name=stock-analyzer
```
