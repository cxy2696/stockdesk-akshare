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
  lang: 'zh' | 'en'
  setLang: (l: 'zh' | 'en') => void
  toggleLang: () => void
}

const ThemeCtx = createContext<Ctx>({
  mode: 'light',
  colors: chartPalette('light'),
  toggle: () => {},
  setMode: () => {},
  scale: 1,
  setScale: () => {},
  lang: 'zh',
  setLang: () => {},
  toggleLang: () => {},
})

const KEY = 'stockdesk-theme'
const SCALE_KEY = 'stockdesk-ui-scale'
const LANG_KEY = 'stockdesk-lang'

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

  const [lang, setLangState] = useState<'zh' | 'en'>(() => (localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'))

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    localStorage.setItem(LANG_KEY, lang)
  }, [lang])

  const setLang = useCallback((l: 'zh' | 'en') => setLangState(l), [])
  const toggleLang = useCallback(() => setLangState((l) => (l === 'zh' ? 'en' : 'zh')), [])
  const setMode = useCallback((m: ThemeMode) => setModeState(m), [])
  const setScale = useCallback((s: number) => setScaleState(s), [])
  const toggle = useCallback(
    () => setModeState((m) => (m === 'hud' ? 'light' : m === 'light' ? 'dark' : 'hud')),
    [],
  )

  const value = useMemo(
    () => ({ mode, colors: chartPalette(mode), toggle, setMode, scale, setScale, lang, setLang, toggleLang }),
    [mode, toggle, setMode, scale, setScale, lang, setLang, toggleLang],
  )
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  return useContext(ThemeCtx)
}
