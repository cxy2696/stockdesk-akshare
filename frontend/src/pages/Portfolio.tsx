import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Skeleton, Table, Tag, Tooltip, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api'
import { Card, EmptyState, Kpi } from '../components/ui'
import AccountAssetsModal from '../components/AccountAssetsModal'
import { fmt, trendClass, UP, DOWN } from '../utils'

export default function Portfolio() {
  const nav = useNavigate()
  const [summary, setSummary] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [side, setSide] = useState('all')
  const [keyword, setKeyword] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([api.get<any>('/api/portfolio/summary'), api.get<any[]>('/api/portfolio/trades')])
      setSummary(s)
      setTrades(t)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 45000)
    return () => clearInterval(t)
  }, [])

  const del = async (id: number) => {
    try {
      await api.del(`/api/portfolio/trades/${id}`)
      message.success('已删除，账户资产与现金已重算')
      load()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toUpperCase()
    return [...trades]
      .reverse()
      .filter((t) => side === 'all' || t.side === side)
      .filter((t) => !kw || t.code.includes(kw) || (t.name || '').toUpperCase().includes(kw))
  }, [trades, side, keyword])

  const columns = [
    { title: '日期', dataIndex: 'trade_date', width: 96, sorter: (a: any, b: any) => a.trade_date.localeCompare(b.trade_date) },
    {
      title: '股票',
      dataIndex: 'name',
      render: (_: any, r: any) => (
        <div className="table-stock" style={{ cursor: 'pointer' }} onClick={() => nav(`/stock/${r.code}`)}>
          <div className="stock-avatar">{(r.name || r.code).slice(0, 1)}</div>
          <div>
            <div className="stock-name">{r.name || r.code}</div>
            <div className="stock-code mono">{r.code}</div>
          </div>
        </div>
      ),
    },
    {
      title: '方向',
      dataIndex: 'side',
      width: 64,
      render: (v: string) => <Tag color={v === 'buy' ? 'red' : 'green'} style={{ margin: 0 }}>{v === 'buy' ? '买入' : '卖出'}</Tag>,
    },
    { title: '成交价', dataIndex: 'price', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    { title: '数量', dataIndex: 'qty', align: 'right' as const, render: (v: number) => <span className="num">{v}</span> },
    {
      title: '成交金额',
      align: 'right' as const,
      render: (_: any, r: any) => <span className="num">{fmt.money(r.price * r.qty)}</span>,
    },
    { title: '费用', dataIndex: 'fee', align: 'right' as const, width: 70, render: (v: number) => <span className="num muted">{fmt.price(v)}</span> },
    {
      title: '已实现盈亏',
      dataIndex: 'realized',
      align: 'right' as const,
      render: (v: number | null, r: any) => {
        if (v === null || v === undefined) return <span className="muted">--</span>
        const pct = r.price > 0 ? (v / (r.price * r.qty)) * 100 : 0
        return (
          <Tooltip
            title={
              (r.matched || []).length ? (
                <div style={{ fontSize: 11 }}>
                  {(r.matched || []).map((m: any, i: number) => (
                    <div key={i}>
                      {m.open_date} 买入 {m.qty} 股 @ {fmt.price(m.buy_price)} → 盈亏 {fmt.signed(m.pnl)}
                    </div>
                  ))}
                </div>
              ) : 'FIFO 配对'
            }
          >
            <div>
              <div className={`num ${trendClass(v)}`}>{fmt.signed(v)}</div>
              <div className={`num small ${trendClass(v)}`}>{fmt.pct(pct)}</div>
            </div>
          </Tooltip>
        )
      },
    },
    { title: '备注', dataIndex: 'note', ellipsis: true, render: (v: string) => <span className="muted small">{v || '--'}</span> },
    {
      title: '',
      width: 70,
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', gap: 2 }}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setEditing(r); setOpen(true) }} />
          <Popconfirm title="删除这笔交易？" description="删除后账户资产与可用现金会重新计算" onConfirm={() => del(r.id)} okText="删除" cancelText="取消">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ]

  const posColumns = [
    {
      title: '股票',
      dataIndex: 'name',
      render: (_: any, r: any) => (
        <div className="table-stock" style={{ cursor: 'pointer' }} onClick={() => nav(`/stock/${r.code}`)}>
          <div className="stock-avatar">{r.name.slice(0, 1)}</div>
          <div>
            <div className="stock-name">{r.name}</div>
            <div className="stock-code mono">{r.code}</div>
          </div>
        </div>
      ),
    },
    { title: '持仓', dataIndex: 'qty', align: 'right' as const, render: (v: number) => <span className="num">{v}</span> },
    { title: '成本价', dataIndex: 'avg_cost', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    { title: '现价', dataIndex: 'price', align: 'right' as const, render: (v: number) => <span className="num">{fmt.price(v)}</span> },
    {
      title: '今日盈亏',
      dataIndex: 'today_pnl',
      align: 'right' as const,
      render: (v: number | null, r: any) => (
        <div>
          <div className={`num ${trendClass(v)}`}>{v === null ? '--' : fmt.signed(v)}</div>
          <div className={`num small ${trendClass(r.pct)}`}>{fmt.pct(r.pct)}</div>
        </div>
      ),
    },
    { title: '市值', dataIndex: 'market_value', align: 'right' as const, render: (v: number) => <span className="num">{fmt.money(v)}</span> },
    {
      title: '浮动盈亏',
      dataIndex: 'float_pnl',
      align: 'right' as const,
      render: (v: number, r: any) => (
        <div style={{ textAlign: 'right' }}>
          <div className={`num ${trendClass(v)}`}>{fmt.signed(v)}</div>
          <div className={`num small ${trendClass(r.float_pct)}`}>{fmt.pct(r.float_pct)}</div>
        </div>
      ),
    },
    {
      title: '累计盈亏',
      dataIndex: 'total_pnl',
      align: 'right' as const,
      render: (v: number, r: any) => (
        <Tooltip title={`浮动 ${fmt.signed(r.float_pnl)} + 已实现 ${fmt.signed(r.realized)}`}>
          <div style={{ textAlign: 'right' }}>
            <div className={`num ${trendClass(v)}`}>{fmt.signed(v)}</div>
            <div className={`num small ${trendClass(r.total_pct)}`}>{fmt.pct(r.total_pct)}</div>
          </div>
        </Tooltip>
      ),
    },
    { title: '仓位', dataIndex: 'weight', align: 'right' as const, render: (v: number) => <span className="num">{v?.toFixed(1)}%</span> },
    {
      title: '支撑 / 压力',
      align: 'center' as const,
      render: (_: any, r: any) =>
        r.support || r.resistance ? (
          <Tooltip title="基于筹码密集区与黄金分割位计算的最近支撑/压力">
            <div className="support-resistance">
              <span className="sr sr-support">
                撑 {fmt.price(r.support)} <em>{r.support_dist === null || r.support_dist === undefined ? '' : fmt.pct(r.support_dist)}</em>
              </span>
              <span className="sr sr-resistance">
                压 {fmt.price(r.resistance)} <em>{r.resistance_dist === null || r.resistance_dist === undefined ? '' : fmt.pct(r.resistance_dist)}</em>
              </span>
            </div>
          </Tooltip>
        ) : (
          <span className="muted">--</span>
        ),
    },
    { title: '持有', dataIndex: 'hold_days', align: 'right' as const, render: (v: number) => <span className="num muted">{v === null || v === undefined ? '--' : `${v} 天`}</span> },
  ]

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="muted small">总资产 = 可用现金 + 持仓市值，随行情实时变化 · 初始资产仅作为收益基准</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<SettingOutlined />} onClick={() => setAccountOpen(true)}>初始资产</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setOpen(true) }}>记录交易</Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="card card-pad"><Skeleton active paragraph={{ rows: 6 }} /></div>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi
              label="总资产"
              value={`¥${fmt.money(summary?.total)}`}
              sub={<span className="muted">初始资产 ¥{fmt.money(summary?.assets)} · 累计 {fmt.pct(summary?.total_pct)}</span>}
            />
            <Kpi
              label="持仓市值"
              value={`¥${fmt.money(summary?.market_value)}`}
              sub={<span className="muted">仓位 {summary?.position_pct ?? 0}% · {summary?.positions?.length ?? 0} 只</span>}
            />
            <Kpi
              label="可用现金"
              value={`¥${fmt.money(summary?.cash)}`}
              color={summary?.cash < 0 ? UP : undefined}
              sub={<span className="muted">现金占比 {summary?.cash_pct ?? 0}%</span>}
            />
            <Kpi
              label="累计盈亏"
              value={fmt.signed(summary?.total_pnl)}
              color={summary?.total_pnl >= 0 ? UP : DOWN}
              sub={<span className="muted">浮盈 {fmt.signed(summary?.float_pnl)} · 已实现 {fmt.signed(summary?.realized)}</span>}
            />
          </div>

          <div className="grid-3" style={{ marginTop: 12 }}>
            <Card title="资金流水" desc="自动汇总">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div className="stat-line"><span className="k">累计买入</span><span className="num">¥{fmt.money(summary?.buy_total)}</span></div>
                <div className="stat-line"><span className="k">累计卖出</span><span className="num">¥{fmt.money(summary?.sell_total)}</span></div>
                <div className="stat-line"><span className="k">净投入</span><span className="num">¥{fmt.money(summary?.net_invested)}</span></div>
                <div className="stat-line"><span className="k">交易费用</span><span className="num">¥{fmt.money(summary?.fees)}</span></div>
              </div>
            </Card>
            <Card title="盈亏结构" desc="浮动 + 已实现">
              <div className="stat-line"><span className="k">浮动盈亏</span><span className={`num ${trendClass(summary?.float_pnl)}`}>{fmt.signed(summary?.float_pnl)}</span></div>
              <div className="stat-line"><span className="k">已实现盈亏</span><span className={`num ${trendClass(summary?.realized)}`}>{fmt.signed(summary?.realized)}</span></div>
              <div className="stat-line"><span className="k">持仓成本</span><span className="num">¥{fmt.money(summary?.cost)}</span></div>
              <div className="stat-line"><span className="k">成本收益率</span><span className={`num ${trendClass(summary?.float_pct)}`}>{fmt.pct(summary?.float_pct)}</span></div>
            </Card>
            <Card title="仓位结构" desc="按市值权重">
              {(summary?.positions ?? []).slice(0, 4).map((p: any, i: number) => (
                <div key={p.code} style={{ marginBottom: 8 }}>
                  <div className="row-between" style={{ fontSize: 12 }}>
                    <span>{p.name} <span className="muted mono small">{p.code}</span></span>
                    <span className="num">{p.weight?.toFixed(1)}%</span>
                  </div>
                  <div className="progress-track" style={{ marginTop: 4 }}>
                    <div className="progress-fill" style={{ width: `${Math.min(100, p.weight ?? 0)}%`, background: ['#2563EB', '#7C3AED', '#0891B2', '#D97706'][i % 4] }} />
                  </div>
                </div>
              ))}
              <div className="stat-line"><span className="k">现金</span><span className="num">{summary?.cash_pct ?? 0}%</span></div>
            </Card>
          </div>

          <div style={{ marginTop: 14 }}>
            <Card title="当前持仓" desc={`${summary?.positions?.length ?? 0} 只 · 市值 ¥${fmt.money(summary?.market_value)}`} pad={false}>
              {summary?.positions?.length ? (
                <Table dataSource={summary.positions} columns={posColumns as any} rowKey="code" size="small" pagination={false} />
              ) : (
                <EmptyState text="暂无持仓，点击右上角记录一笔买入" icon="◎" />
              )}
            </Card>
          </div>

          <div style={{ marginTop: 14 }}>
            <Card
              title="交易流水"
              desc={`${trades.length} 笔`}
              extra={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Segmented
                    size="small"
                    value={side}
                    onChange={(v) => setSide(v as string)}
                    options={[{ label: '全部', value: 'all' }, { label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]}
                  />
                  <Input
                    size="small"
                    allowClear
                    prefix={<SearchOutlined style={{ color: 'var(--text-dim)' }} />}
                    placeholder="代码 / 名称"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    style={{ width: 150 }}
                  />
                </div>
              }
              pad={false}
            >
              {filtered.length ? (
                <Table
                  dataSource={filtered}
                  columns={columns as any}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 12, size: 'small', showSizeChanger: false }}
                  summary={(rows) => {
                    const buy = rows.reduce((a, r) => a + (r.side === 'buy' ? r.price * r.qty : 0), 0)
                    const sell = rows.reduce((a, r) => a + (r.side === 'sell' ? r.price * r.qty : 0), 0)
                    const fee = rows.reduce((a, r) => a + (r.fee || 0), 0)
                    const realized = rows.reduce((a, r) => a + (r.realized || 0), 0)
                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={5}><span className="muted small">本页合计</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right"><span className="num small">买 {fmt.money(buy)} / 卖 {fmt.money(sell)}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right"><span className="num small muted">{fmt.price(fee)}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right"><span className={`num small ${trendClass(realized)}`}>{fmt.signed(realized)}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={8} colSpan={2} />
                      </Table.Summary.Row>
                    )
                  }}
                />
              ) : (
                <EmptyState text="没有符合条件的交易" icon="▤" />
              )}
            </Card>
          </div>
        </>
      )}

      <TradeEditor open={open} editing={editing} onClose={() => setOpen(false)} onDone={load} />
      <AccountAssetsModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onDone={load}
        assets={summary?.assets ?? 0}
        total={summary?.total ?? 0}
        cash={summary?.cash ?? 0}
        marketValue={summary?.market_value ?? 0}
      />
    </div>
  )
}

function TradeEditor({ open, editing, onClose, onDone }: { open: boolean; editing: any; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState('')
  const code = Form.useWatch('code', form)
  const side = Form.useWatch('side', form)
  const price = Form.useWatch('price', form)
  const qty = Form.useWatch('qty', form)

  useEffect(() => {
    if (!open) return
    if (editing) {
      form.setFieldsValue({ ...editing, trade_date: dayjs(editing.trade_date) })
    } else {
      form.resetFields()
      form.setFieldsValue({ side: 'buy', qty: 100, fee: 5, trade_date: dayjs() })
    }
  }, [open, editing])

  useEffect(() => {
    if (side && price && qty) {
      setPreview(`${side === 'buy' ? '买入' : '卖出'} ${qty} 股 × ${price} = ¥${fmt.money(price * qty)}`)
    } else setPreview('')
  }, [side, price, qty])

  const submit = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const payload = { ...v, code: v.code || code, trade_date: v.trade_date.format('YYYY-MM-DD') }
      if (editing) await api.put(`/api/portfolio/trades/${editing.id}`, payload)
      else await api.post('/api/portfolio/trades', payload)
      message.success(editing ? '已更新' : '已记录，现金与资产已重算')
      onClose()
      onDone()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? '编辑交易' : '记录交易'} open={open} onCancel={onClose} onOk={submit} okText="保存" cancelText="取消" confirmLoading={saving}>
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="code" label="股票代码" rules={[{ required: true, pattern: /^\d{6}$/, message: '6 位数字' }]}>
            <Input maxLength={6} placeholder="600519" />
          </Form.Item>
          <Form.Item name="side" label="方向" rules={[{ required: true }]}>
            <Select options={[{ label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]} />
          </Form.Item>
          <Form.Item name="price" label="成交价" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} step={0.01} precision={3} />
          </Form.Item>
          <Form.Item name="qty" label="数量（股）" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={100} step={100} />
          </Form.Item>
          <Form.Item name="trade_date" label="交易日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fee" label="手续费合计">
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
        </div>
        <Form.Item name="name" label="股票名称（可选）">
          <Input placeholder="自动获取" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input placeholder="交易理由 / 复盘备注" />
        </Form.Item>
        {preview && <div className="muted small" style={{ marginTop: -6 }}>{preview}</div>}
      </Form>
    </Modal>
  )
}
