import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : InfinityFree 하위 폴더에 올려도 상대경로로 동작
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 800 },
});
