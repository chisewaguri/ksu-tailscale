import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { outDir: '../module/webroot', emptyOutDir: true, license: { fileName: 'licenses.md' } },
})
