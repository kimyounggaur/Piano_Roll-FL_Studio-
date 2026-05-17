import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/Piano_Roll-FL_Studio-/',
  plugins: [react()],
})
