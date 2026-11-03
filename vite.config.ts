import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.CHECKIT_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // 브라우저는 상대 경로 /api 를 호출하고, 개발 서버가 백엔드로 전달합니다.
      // 백엔드가 Origin 으로 CSRF 를 검사하므로 changeOrigin 은 켜지 않고,
      // /api 경로도 제거(rewrite)하지 않습니다.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
  }
})
