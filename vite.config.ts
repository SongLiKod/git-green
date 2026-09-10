import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  // 三端同源：Web静态 / Electron file加载 / Android WebView 均需相对路径资源
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5176,
    proxy: {
      '/api.github.com': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api.github.com/, '')
      },
      // Release资产下载：代理端跟随302跳转（release-assets无CORS头），浏览器侧同源无跨域
      '/gh-download': {
        target: 'https://api.github.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: p => p.replace(/^\/gh-download/, '')
      }
    }
  }
})
