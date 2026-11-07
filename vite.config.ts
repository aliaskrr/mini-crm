import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// В клиентский бандл попадают только переменные с префиксом VITE_ (публичный URL и publishable-ключ).
// Секретный ключ хранится в SUPABASE_SECRET_KEY без префикса и в браузер не попадает.
export default defineConfig({
  plugins: [react()],
})
