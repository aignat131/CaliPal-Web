/**
 * Copies ffmpeg-core WASM files from node_modules to public/ffmpeg/
 * so they are served locally instead of fetched from unpkg.com.
 *
 * Usage:
 *   npm install @ffmpeg/core@0.12.6 --save-dev
 *   node scripts/copy-ffmpeg.mjs
 */
import { copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const dest = join(root, 'public', 'ffmpeg')

mkdirSync(dest, { recursive: true })

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']
for (const file of files) {
  try {
    copyFileSync(join(src, file), join(dest, file))
    console.log(`✓ Copied ${file}`)
  } catch {
    console.warn(`⚠ ${file} not found — skipping`)
  }
}
console.log('Done. Files are now served from /ffmpeg/')
