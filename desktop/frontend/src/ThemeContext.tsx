import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ThemeMode } from './theme'
import { chartPalette } from './theme'

interface Ctx {
  mode: ThemeMode
  colors: ReturnType<typeof chartPalette>
  toggle: () => void
  setMode: (m: ThemeMode) => void
  scale: number
  setScale: (s: number) => void
}

const ThemeCtx = createContext<Ctx>({
  mode: 'light',
  colors: chartPalette('light'),
  toggle: () => {},
  setMode: () => {},
  scale: 1,
  setScale: () => {},
})

const KEY = 'stockdesk-theme'
const SCALE_KEY = 'stockdesk-ui-scale'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const migrated = localStorage.getItem('stockdesk-hud-v1')
    if (!migrated) {
      localStorage.setItem('stockdesk-hud-v1', '1')
      return 'hud'
    }
    const saved = localStorage.getItem(KEY)
    return saved === 'dark' || saved === 'light' || saved === 'hud' ? saved : 'hud'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem(KEY, mode)
  }, [mode])

  const [scale, setScaleState] = useState<number>(() => {
    const saved = Number(localStorage.getItem(SCALE_KEY))
    return [1, 1.2, 1.5].includes(saved) ? saved : 1
  })

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(scale))
    localStorage.setItem(SCALE_KEY, String(scale))
  }, [scale])

  const setMode = useCallback((m: ThemeMode) => setModeState(m), [])
  const setScale = useCallback((s: number) => setScaleState(s), [])
  const toggle = useCallback(
    () => setModeState((m) => (m === 'hud' ? 'light' : m === 'light' ? 'dark' : 'hud')),
    [],
  )

  const value = useMemo(
    () => ({ mode, colors: chartPalette(mode), toggle, setMode, scale, setScale }),
    [mode, toggle, setMode, scale, setScale],
  )
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  return useContext(ThemeCtx)
}
