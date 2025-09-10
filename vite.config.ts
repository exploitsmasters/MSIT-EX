import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { Buffer } from 'buffer';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['buffer'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          console.log('Proxy rewriting path:', path);
          return path.replace(/^\/api/, '/api'); // Preserve /api prefix
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Proxying request:', req.url, 'to', proxyReq.getHeader('host') + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('Received response for:', req.url, 'status:', proxyRes.statusCode);
          });
          proxy.on('error', (err, req) => {
            console.error('Proxy error for:', req.url, 'error:', err.message);
          });
        },
        timeout: 30000, // 30 seconds timeout for initial connection
        proxyTimeout: 30000, // 30 seconds for proxy response
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      buffer: 'buffer',
    },
  },
  define: {
    'global.Buffer': 'Buffer',
    __DEFINES__: '{}',
  },
  assetsInclude: ['**/*.svg'],
});