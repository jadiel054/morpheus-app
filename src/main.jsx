import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="bottom-right" toastOptions={{
          style: { background: '#0a1520', color: '#00FFFF', border: '1px solid #0d2030', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }
        }} />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
