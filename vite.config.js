import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    server: { port: Number(env.VITE_PORT) || 5173, open: false },
    build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
    test: { environment: 'node', include: ['tests/**/*.test.js'] },
  };
});
