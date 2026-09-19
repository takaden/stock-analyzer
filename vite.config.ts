import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function watchlistDevPlugin(): Plugin {
  const watchlistFilePath = path.resolve(__dirname, 'src/data/watchlist.json')

  return {
    name: 'watchlist-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const pathname = req.url.split('?')[0]
        if (pathname !== '/api/watchlist' && pathname !== '/absproxy/5173/api/watchlist') {
          return next()
        }

        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(watchlistFilePath)) {
              const content = fs.readFileSync(watchlistFilePath, 'utf-8')
              const codes = JSON.parse(content || '[]')
              res.statusCode = 200
              res.end(JSON.stringify({ success: true, codes }))
            } else {
              res.statusCode = 200
              res.end(JSON.stringify({ success: true, codes: [] }))
            }
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e?.message }))
          }
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}')
              const codes = Array.isArray(parsed.codes)
                ? Array.from(new Set(parsed.codes.map((c: any) => String(c).trim()))).filter(Boolean)
                : []
              fs.writeFileSync(watchlistFilePath, JSON.stringify(codes, null, 2), 'utf-8')
              res.statusCode = 200
              res.end(JSON.stringify({ success: true, count: codes.length, codes }))
            } catch (e: any) {
              res.statusCode = 500
              res.end(JSON.stringify({ success: false, error: e?.message }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

function getD1Database(): any | null {
  try {
    const d1Dir = path.resolve(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
    if (!fs.existsSync(d1Dir)) return null
    const dbFiles = fs.readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite') && !f.startsWith('metadata'))
    if (dbFiles.length === 0) return null

    // @ts-ignore
    const { DatabaseSync } = require('node:sqlite')
    for (const file of dbFiles) {
      let db: any = null
      let isSelected = false
      try {
        db = new DatabaseSync(path.join(d1Dir, file))
        const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = 'v_screener_stocks'").get()
        if (hasTable) {
          isSelected = true
          return db
        }
      } catch {
        // 次の候補ファイルを試行
      } finally {
        if (!isSelected && db) {
          try {
            db.close()
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to resolve local D1 database:', e)
  }
  return null
}

function d1DevPlugin(): Plugin {
  return {
    name: 'd1-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const pathname = req.url.split('?')[0]

        // 1. /api/screener-stocks エンドポイント
        if (pathname === '/api/screener-stocks' || pathname === '/absproxy/5173/api/screener-stocks') {
          const db = getD1Database()
          if (db) {
            try {
              const rows = db.prepare('SELECT * FROM v_screener_stocks ORDER BY marketCap DESC').all()
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.statusCode = 200
              res.end(JSON.stringify({ data: rows, count: rows.length }))
              return
            } catch (e: any) {
              console.warn('Local D1 query error for screener-stocks:', e)
            } finally {
              db.close()
            }
          }
        }

        // 2. /api/watchlist-metrics エンドポイント
        if (pathname === '/api/watchlist-metrics' || pathname === '/absproxy/5173/api/watchlist-metrics') {
          try {
            const url = new URL(req.url, 'http://localhost')
            const codesParam = url.searchParams.get('codes')
            if (codesParam) {
              const codes = codesParam.split(',').map((c) => c.trim()).filter(Boolean)
              const db = getD1Database()
              if (db) {
                try {
                  const placeholders = codes.map(() => '?').join(',')
                  const rows = db.prepare(`SELECT * FROM calculated_metrics WHERE code IN (${placeholders})`).all(...codes)
                  const metricsMap: Record<string, any> = {}
                  for (const r of rows as any[]) {
                    const eqRatio = r.equity_ratio
                    const doeVal = r.doe
                    const opMarginVal = r.op_margin

                    metricsMap[r.code] = {
                      dpsAnnual: r.dps_annual,
                      dpsType: r.dps_type,
                      dividendYield: r.dividend_yield,
                      latestCfo: r.latest_cfo,
                      latestCfi: r.latest_cfi,
                      latestFcf: r.latest_fcf,
                      cfHistory: r.cf_history_json ? JSON.parse(r.cf_history_json) : [],
                      fcfPositiveCount: r.fcf_positive_count,
                      fcfTotalCount: r.fcf_total_count,
                      isFcfConsistentlyPositive: Boolean(r.is_fcf_consistently_positive),
                      nonReductionYears: r.non_reduction_years,
                      consecutiveDividendGrowthYears: r.non_reduction_years ?? 0,
                      isNoDividendCut5Years: Boolean(r.is_no_dividend_cut_5years),
                      equityRatio: eqRatio,
                      isEquityRatioSafe: eqRatio != null ? eqRatio >= 40 : false,
                      isEquityRatioSolid: eqRatio != null ? eqRatio >= 60 : false,
                      equityGrowthTrend: 'stable',
                      equity5YearChangePercent: null,
                      payoutRatio: r.payout_ratio,
                      payoutRatioStatus: r.payout_ratio_status,
                      doe: doeVal,
                      isDoeHigh: Boolean(r.is_doe_high),
                      isDoeTopTier: doeVal != null ? doeVal >= 3.5 : false,
                      buybackDetected: false,
                      opMargin: opMarginVal,
                      isOpMarginHigh: opMarginVal != null ? opMarginVal >= 8 : false,
                      isOpMarginTopTier: opMarginVal != null ? opMarginVal >= 10 : false,
                      roe: r.roe,
                      isRoeGood: Boolean(r.is_roe_good),
                      roa: r.roa,
                      isRoaGood: Boolean(r.is_roa_good),
                      eps5YearCagr: r.eps_5year_cagr,
                      epsTrend: r.eps_trend,
                      betaAnalysis: r.beta_1year != null ? {
                        beta1Year: r.beta_1year,
                        beta3Year: r.beta_3year,
                        beta5Year: r.beta_5year,
                        correlation: r.beta_correlation,
                        category: r.beta_category,
                        label: r.beta_label,
                        badgeEmoji: r.beta_badge_emoji,
                      } : null,
                      scorePassed: r.score_passed,
                      scoreTotal: r.score_total,
                    }
                  }
                  res.setHeader('Content-Type', 'application/json')
                  res.setHeader('Access-Control-Allow-Origin', '*')
                  res.statusCode = 200
                  res.end(JSON.stringify({ data: metricsMap }))
                  return
                } finally {
                  db.close()
                }
              }
            }
          } catch (e: any) {
            console.warn('Local D1 query error for watchlist-metrics:', e)
          }
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), watchlistDevPlugin(), d1DevPlugin()],
  // 開発時(dev)は code-server の absproxy パスに合わせ、本番ビルド(build)時は Cloudflare Pages向けに相対パスにする
  base: command === 'serve' ? '/absproxy/5173/' : './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
    },
    // J-Quants APIのブラウザCORS制限（OPTIONS未対応）を回避するためのプロキシ
    proxy: {
      '^.*\/api\/jq': {
        target: 'https://api.jquants.com/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^.*\/api\/jq/, ''),
      },
    },
  },
}))

