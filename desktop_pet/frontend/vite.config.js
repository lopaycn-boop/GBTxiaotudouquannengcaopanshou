import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// ── Electron custom-protocol (app://) fixes ──────────────────────────
//
// Problem:  Vite builds ES modules with `const`/`let` declarations.
//           Under Electron's app:// custom protocol, even a plain
//           <script> tag (not type="module") can trigger TDZ errors
//           like "Cannot access 'Kn' before initialization" when
//           const/let variables are referenced before their line executes.
//
// Solution: Three post-build transforms applied via Vite plugins:
//   1. IIFE output format (single function scope, no ES module semantics)
//   2. Replace all `const`/`let` → `var` in JS bundles (var is hoisted,
//      no TDZ).  Rollup's `constBindings:false` only covers its own
//      output, but esbuild/React internals still emit `const`/`let`.
//   3. Rewrite index.html: remove `type="module"`, move <script> tags
//      to <body> after <div id="root"> so React can find mount point.
// ─────────────────────────────────────────────────────────────────────

function electronProtocolFixPlugin() {
  return {
    name: 'electron-protocol-fix',
    // After the bundle is written, replace const/let with var in all JS files
    writeBundle(options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith('.js') && chunk.type === 'chunk') {
          let code = chunk.code
          let changed = false
          // Replace const/let with var at word boundaries
          const newCode = code
            .replace(/\bconst\b/g, 'var')
            .replace(/\blet\b/g, 'var')
          if (newCode !== code) {
            chunk.code = newCode
            changed = true
          }
          if (changed) {
            // Also update the file on disk
            const outPath = path.join(options.dir || 'dist', fileName)
            fs.writeFileSync(outPath, newCode, 'utf-8')
          }
        }
      }
    },
    // Rewrite index.html: remove type="module", move scripts to body end
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // 1. Remove type="module" crossorigin from script tags
        html = html.replace(/ type="module"\s*crossorigin/g, '')
        // 2. Move <script> tags from <head> to end of <body>
        const headScripts = []
        html = html.replace(/<head>([\s\S]*?)<\/head>/, (match, headContent) => {
          const cleaned = headContent.replace(/<script[^>]*><\/script>/g, (script) => {
            headScripts.push(script)
            return ''
          })
          return `<head>${cleaned}</head>`
        })
        if (headScripts.length > 0) {
          html = html.replace('</body>', headScripts.join('\n    ') + '\n  </body>')
        }
        return html
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), electronProtocolFixPlugin()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/version': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/verify': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // IIFE format + var declarations = zero TDZ under app:// protocol
        format: 'iife',
        generatedCode: { constBindings: false },
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
    chunkSizeWarningLimit: 2500,
  },
})
