import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider, Result } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { configError } from './lib/supabase.ts'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Ошибки прав и бизнес-правил повторять бессмысленно — повторяем только сетевые сбои.
      retry: (failureCount, error) =>
        failureCount < 2 && error instanceof Error && error.message === 'Failed to fetch',
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={ruRU}>
      <AntApp>
        {configError ? (
          <Result status="warning" title="Приложение не настроено" subTitle={configError} />
        ) : (
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AuthProvider>
                <App />
              </AuthProvider>
            </BrowserRouter>
          </QueryClientProvider>
        )}
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
