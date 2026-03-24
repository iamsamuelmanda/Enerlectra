import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@features': path.resolve(__dirname, './src/features'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),

      // Feature Specific Aliases
      '@clusters': path.resolve(__dirname, './src/features/clusters'),
      '@clusters-components': path.resolve(__dirname, './src/features/clusters/components'),
      '@simulation': path.resolve(__dirname, './src/features/simulation'), // New Alias
      
      '@contributions': path.resolve(__dirname, './src/features/contributions'),
      '@contributions-services': path.resolve(__dirname, './src/features/contributions/services'),
      '@contributions-components': path.resolve(__dirname, './src/features/contributions/components'),
    },
  },

  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        // Change this to 'http://localhost:4000' during local dev 
        // to match your server/index.ts port
        target: 'http://localhost:4000', 
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      timeout: 120000,
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});