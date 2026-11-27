// SPDX-License-Identifier: GPL-3.0-only
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // KernelSU loads webroot through a custom scheme / WebViewAssetLoader.
  // Absolute asset paths turn into 404s, so relative base is mandatory.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.monkeycode-ai.online'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.monkeycode-ai.online'],
  },
  build: {
    outDir: '../module/webroot',
    emptyOutDir: true,
    target: 'chrome111',
    assetsInlineLimit: 4096,
  },
})
