import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.CHECKIT_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react()],
    // PaddleOCR Worker가 모듈(import)을 쓰므로 ES 모듈 형식으로 빌드합니다.
    worker: { format: 'es' },
    // 파일을 올릴 때 처음 불러오는 라이브러리(PDF·OCR·HEIC)는 미리 묶어 둡니다.
    // 안 그러면 개발 서버가 도중에 다시 묶으면서 페이지를 새로고침해 고른 파일이 사라집니다.
    optimizeDeps: { include: ['pdfjs-dist', 'onnxruntime-web/webgpu', 'heic-to'] },
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
