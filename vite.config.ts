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
        if (!req.url || !req.url.includes('/api/watchlist')) {
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

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), watchlistDevPlugin()],
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

