import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('morpheus_theme') || 'dark' }
    catch { return 'dark' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.style.setProperty('--bg',       '#f8fafc')
      root.style.setProperty('--text',     '#0f172a')
      root.style.setProperty('--card',     '#ffffff')
      root.style.setProperty('--border',   '#e2e8f0')
      root.style.setProperty('--accent',   '#00a0a0')
      root.style.setProperty('--muted',    '#94a3b8')
      root.style.setProperty('--surface',  '#f1f5f9')
    } else {
      root.style.setProperty('--bg',       '#050a0f')
      root.style.setProperty('--text',     '#e2e8f0')
      root.style.setProperty('--card',     '#0a1520')
      root.style.setProperty('--border',   '#0d2030')
      root.style.setProperty('--accent',   '#00FFFF')
      root.style.setProperty('--muted',    'rgba(0,255,255,0.4)')
      root.style.setProperty('--surface',  '#0d1525')
    }
    localStorage.setItem('morpheus_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
