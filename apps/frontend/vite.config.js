import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    uni(),
  ],
  build: { commonjsOptions: { include: [/node_modules/, /packages[\\/]stock-search/] } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.js'],
    exclude: ['node_modules', 'dist']
  }
})
