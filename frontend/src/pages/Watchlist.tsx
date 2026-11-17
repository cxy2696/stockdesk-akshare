import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Modal, Select, Skeleton, Table, message } from 'antd'
import StockSearch from '../components/StockSearch'
import { PlusOutlined, ReloadOutlined, StarFilled } from '@ant-design/icons'
import { api } from '../api'
import { Card, EmptyState } from '../components/ui'
import Sparkline from '../components/Sparkline'
import { fmt, trendClass } from '../utils'

export default function Watchlist() {
  const nav = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [code, setCode] = useState('')
  const [sparks, setSparks] = useState<Record<string, number[]>>({})
  const [speeders, setSpeeders] = useState<any[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<any[]>('/api/watchlist')
      setRows(r)
      const pairs = await Promise.all(
        r.slice(0, 12).map(async (x) => {
          try {
            const k = await api.get<any>(`/api/market/kline/${x.code}?limit=60`)
            return [x.code, k.rows.map((i: any) => i.close)] as [string, number[]]
          } catch {
            return [x.code, []] as [string, number[]]
          }
        }),
      )
      setSparks(Object.fromEntries(pairs))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!addOpen || speeders.length) return
    api.get<any>('/api/market/hot').then((h) => setSpeeders(h?.speeders ?? [])).catch(() => {})
  }, [addOpen])

  useEffect(() => {
    load()
    const t = setInterval(load, 45000)
    return () => clearInterval(t)
  }, [])

  const add = async () => {
    if (!/^\d{6}$/.test(code)) {
      message.warning('请输入 6 位股票代码')
      return
    }
    try {
      await api.post('/api/watchlist', { code })
      message.success('已加入自选')
      setAddOpen(false)
      setCode('')
      load()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const remove = async (c: string) => {
    await api.del(`/api/watchlist/${c}`)
    load()
  }

  const columns = [
    {
      title: '股票',
      dataIndex: 'name',
      render: (_: any, r: any) => (
        <div className="table-stock">
          <div className="stock-avatar">{(r.name || r.code).slice(0, 1)}</div>
          <div>
            <div className="stock-name">{r.name || r.code}</div>
            <div className="stock-code mono">{r.code}</div>
          </div>
        </div>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'price',
      align: 'right' as const,
      sorter: (a: any, b: any) => (a.price ?? 0) - (b.price ?? 0),
      render: (v: number, r: any) => (
        <div>
          <div className="num" style={{ fontWeight: 600 }}>{fmt.price(v)}</div>
          <div className={`num small ${trendClass(r.pct)}`}>{fmt.pct(r.pct)}</div>
        </div>
      ),
    },
    {
      title: '近 20 日',
      width: 120,
      render: (_: any, r: any) => {
        const d = (sparks[r.code] || []).slice(-20)
        const up = d.length > 1 && d[d.length - 1] >= d[0]
        return <Sparkline data={d} color={up ? '#E5484D' : '#18A058'} height={30} />
      },
    },
    {
      title: '近 60 日',
      width: 120,
      render: (_: any, r: any) => {
        const d = sparks[r.code] || []
        const up = d.length > 1 && d[d.length - 1] >= d[0]
        return <Sparkline data={d} color={up ? '#E5484D' : '#18A058'} height={30} />
      },
    },
    { title: '最高', dataIndex: 'high', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    { title: '最低', dataIndex: 'low', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    { title: '成交额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="num">{fmt.big(v)}</span> },
    { title: 'PE', dataIndex: 'pe', align: 'right' as const, render: (v: number) => <span className="num">{v ? v.toFixed(1) : '--'}</span> },
    { title: 'PB', dataIndex: 'pb', align: 'right' as const, render: (v: number) => <span className="num">{v ? v.toFixed(2) : '--'}</span> },
    {
      title: '',
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" type="text" icon={<StarFilled style={{ color: '#F59E0B' }} />} onClick={() => remove(r.code)} title="移出自选" />
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="muted small">行情缓存 45 秒自动刷新 · 点击行进入个股详情</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加自选</Button>
        </div>
      </div>

      <Card pad={false}>
        {loading && !rows.length ? (
          <div className="card-pad"><Skeleton active /></div>
        ) : rows.length ? (
          <Table
            dataSource={rows}
            columns={columns as any}
            rowKey="code"
            size="small"
            pagination={false}
            onRow={(r) => ({ onClick: () => nav(`/stock/${r.code}`), style: { cursor: 'pointer' } })}
          />
        ) : (
          <EmptyState text="自选列表为空，点击右上角添加" icon="★" />
        )}
      </Card>

      <Modal title="添加自选股" open={addOpen} onOk={add} onCancel={() => setAddOpen(false)} okText="添加" cancelText="取消">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StockSearch width={460} placeholder="输入名称或代码搜索" onSelect={(c) => setCode(c)} />
          <Input
            placeholder="或直接输入 6 位代码，如 600519"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onPressEnter={add}
          />
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          支持股票名称、代码与拼音首字母搜索，行情来自东方财富公开接口。
        </div>
        {speeders.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>热门 · 涨速最高 10 只</div>
            <div className="hud-speed-list">
              {speeders.map((x) => (
                <button key={x.code} onClick={() => setCode(x.code)}>
                  <b>{x.name}</b>
                  <span className="mono">{x.code}</span>
                  <span>{x.industry || '--'}</span>
                  <em className={(x.speed ?? 0) >= 0 ? 'up' : 'down'}>{fmt.pct(x.speed)}</em>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
