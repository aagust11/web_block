import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // CHANGE 'your-repo-name' TO THE ACTUAL NAME OF YOUR GITHUB REPOSITORY
  base: '/web_block/' 
})