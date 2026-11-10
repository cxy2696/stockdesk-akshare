import { useEffect, useState } from 'react'

export type Admin = { name: string; uid: string }
const KEY = 'stockdesk-admin'
const DEFAULT: Admin = { name: 'StockDesk', uid: 'LOCAL-0001' }

export function getAdmin(): Admin {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT
}

export function saveAdmin(a: Admin) {
  localStorage.setItem(KEY, JSON.stringify(a))
  window.dispatchEvent(new Event(KEY))
}

export function useAdmin() {
  const [admin, setAdmin] = useState<Admin>(getAdmin)
  useEffect(() => {
    const sync = () => setAdmin(getAdmin())
    window.addEventListener(KEY, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(KEY, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return admin
}
