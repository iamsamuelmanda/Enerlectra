import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Point Vite to the actual frontend folder
  root: 'client', 
  
  resolve: {
    alias: {
      // All paths now correctly point into the client directory
      '@': path.resolve(__dirname, './client/src'),
      '@assets': path.resolve(__dirname, './client/src/assets'),
      '@components': path.resolve(__dirname, './client/src/components'),
      '@hooks': path.resolve(__dirname, './client/src/hooks'),
      '@pages': path.resolve(__dirname, './client/src/pages'),
      '@services': path.resolve(__dirname, './client/src/services'),
      '@features': path.resolve(__dirname, './client/src/features'),
      '@lib': path.resolve(__dirname, './client/src/lib'),
      '@types': path.resolve(__dirname, './client/src/types'),
      '@clusters': path.resolve(__dirname, './client/src/features/clusters'),
      '@simulation': path.resolve(__dirname, './client/src/features/simulation'),
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000', 
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    // Output to the root dist so Vercel finds it easily
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});