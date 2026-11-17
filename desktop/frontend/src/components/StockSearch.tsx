import { useEffect, useRef, useState } from 'react'
import { AutoComplete, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

export default function StockSearch({ width = 300, placeholder = '搜索股票代码 / 名称', onSelect }: { width?: number; placeholder?: string; onSelect?: (code: string, name: string) => void }) {
  const [q, setQ] = useState('')
  const inputRef = useRef<any>(null)
  const [options, setOptions] = useState<any[]>([])
  const nav = useNavigate()
  const t = useRef<any>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setOptions([])
      return
    }
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      try {
        const rows = await api.get<any[]>(`/api/market/search?q=${encodeURIComponent(q)}&limit=12`)
        setOptions(
          rows.map((r) => ({
            value: r.code,
            label: (
              <div className="row-between" style={{ padding: '2px 0' }}>
                <div>
                  <span style={{ fontSize: 12.5 }}>{r.name}</span>
                  <span className="muted mono small" style={{ marginLeft: 8 }}>
                    {r.code}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 12 }}>
                    {fmt.price(r.price)}
                  </div>
                  <div className={`num small ${trendClass(r.pct)}`}>{fmt.pct(r.pct)}</div>
                </div>
              </div>
            ),
          })),
        )
      } catch {
        setOptions([])
      }
    }, 180)
    return () => clearTimeout(t.current)
  }, [q])

  return (
    <AutoComplete
      value={q}
      options={options}
      style={{ width }}
      onChange={setQ}
      onSelect={(code) => {
        setQ('')
        const label = String(options.find((o) => o.value === code)?.label ?? '')
        if (onSelect) onSelect(code, label)
        else nav(`/stock/${code}`)
      }}
      notFoundContent={q ? <div style={{ padding: 12, fontSize: 12 }} className="muted">没有匹配的股票</div> : null}
    >
      <Input
        ref={inputRef}
        prefix={<SearchOutlined style={{ color: '#6B7280' }} />}
        placeholder={placeholder}
        allowClear
        style={{ borderRadius: 9 }}
      />
    </AutoComplete>
  )
}
