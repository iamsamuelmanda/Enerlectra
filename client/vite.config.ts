import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  
  // Define the root of the frontend project relative to this file
  root: './', 

  resolve: {
    alias: {
      // Use path.resolve to create absolute paths from the current directory
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@features': path.resolve(__dirname, './src/features'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types'),
      '@clusters': path.resolve(__dirname, './src/features/clusters'),
      '@simulation': path.resolve(__dirname, './src/features/simulation'),
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        // Points to your local Render-style backend during development
        target: 'http://localhost:4000', 
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    // This outputs the build to /client/dist
    // Vercel should be configured to look at 'client/dist' for the output
    outDir: './dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          ui: ['framer-motion', 'lucide-react']
        }
      }
    }
  },
});