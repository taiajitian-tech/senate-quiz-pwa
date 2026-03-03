import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/senate-quiz-pwa/',
  plugins: [react()],
})
