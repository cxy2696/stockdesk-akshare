import { useEffect, useMemo, useState } from 'react'
import { Input, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Kpi } from '../components/ui'
import { api } from '../api'
import { fmt, trendClass } from '../utils'

const CITIES: Record<string, string[]> = {
  北京: ['北京'], 天津: ['天津'], 上海: ['上海'], 重庆: ['重庆'],
  河北: ['石家庄', '唐山', '保定', '廊坊'], 山西: ['太原', '大同', '长治'],
  辽宁: ['沈阳', '大连', '鞍山'], 吉林: ['长春', '吉林'], 黑龙江: ['哈尔滨', '大庆', '齐齐哈尔'],
  江苏: ['南京', '苏州', '无锡', '常州', '南通'], 浙江: ['杭州', '宁波', '温州', '绍兴', '嘉兴'],
  安徽: ['合肥', '芜湖', '滁州'], 福建: ['福州', '厦门', '泉州', '宁德'], 江西: ['南昌', '赣州', '上饶'],
  山东: ['济南', '青岛', '烟台', '潍坊'], 河南: ['郑州', '洛阳', '许昌'], 湖北: ['武汉', '宜昌', '襄阳'],
  湖南: ['长沙', '株洲', '湘潭'], 广东: ['广州', '深圳', '东莞', '佛山', '珠海'], 海南: ['海口', '三亚'],
  四川: ['成都', '绵阳', '宜宾'], 贵州: ['贵阳', '遵义'], 云南: ['昆明', '曲靖'], 陕西: ['西安', '宝鸡', '咸阳'],
  甘肃: ['兰州', '天水'], 青海: ['西宁'], 台湾: ['台北', '新竹', '台中'],
  内蒙古: ['呼和浩特', '包头', '鄂尔多斯'], 广西: ['南宁', '柳州', '桂林'], 西藏: ['拉萨'],
  宁夏: ['银川'], 新疆: ['乌鲁木齐', '昌吉'], 香港: ['香港'], 澳门: ['澳门'],
}

type ProvinceType = '直辖市' | '省' | '自治区' | '特别行政区'

interface ProvinceSeed {
  short: string
  name: string
  type: ProvinceType
}

interface ProvinceRow extends ProvinceSeed {
  idx: number
  count: number
  up: number | null
  down: number | null
  flat: number | null
  pct: number | null
  inflow: number | null
  industries: string[]
  leaders: any[]
  cities: string[]
  hasData: boolean
}

// 与 HubMap 保持同一份 34 个省级行政区兜底列表。
const PROVINCES: ProvinceSeed[] = [
  { short: '北京', name: '北京市', type: '直辖市' },
  { short: '天津', name: '天津市', type: '直辖市' },
  { short: '上海', name: '上海市', type: '直辖市' },
  { short: '重庆', name: '重庆市', type: '直辖市' },
  { short: '河北', name: '河北省', type: '省' },
  { short: '山西', name: '山西省', type: '省' },
  { short: '辽宁', name: '辽宁省', type: '省' },
  { short: '吉林', name: '吉林省', type: '省' },
  { short: '黑龙江', name: '黑龙江省', type: '省' },
  { short: '江苏', name: '江苏省', type: '省' },
  { short: '浙江', name: '浙江省', type: '省' },
  { short: '安徽', name: '安徽省', type: '省' },
  { short: '福建', name: '福建省', type: '省' },
  { short: '江西', name: '江西省', type: '省' },
  { short: '山东', name: '山东省', type: '省' },
  { short: '河南', name: '河南省', type: '省' },
  { short: '湖北', name: '湖北省', type: '省' },
  { short: '湖南', name: '湖南省', type: '省' },
  { short: '广东', name: '广东省', type: '省' },
  { short: '海南', name: '海南省', type: '省' },
  { short: '四川', name: '四川省', type: '省' },
  { short: '贵州', name: '贵州省', type: '省' },
  { short: '云南', name: '云南省', type: '省' },
  { short: '陕西', name: '陕西省', type: '省' },
  { short: '甘肃', name: '甘肃省', type: '省' },
  { short: '青海', name: '青海省', type: '省' },
  { short: '台湾', name: '台湾省', type: '省' },
  { short: '内蒙古', name: '内蒙古自治区', type: '自治区' },
  { short: '广西', name: '广西壮族自治区', type: '自治区' },
  { short: '西藏', name: '西藏自治区', type: '自治区' },
  { short: '宁夏', name: '宁夏回族自治区', type: '自治区' },
  { short: '新疆', name: '新疆维吾尔自治区', type: '自治区' },
  { short: '香港', name: '香港特别行政区', type: '特别行政区' },
  { short: '澳门', name: '澳门特别行政区', type: '特别行政区' },
]

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function buildProvinceRows(dist: any, leaders: any[]): ProvinceRow[] {
  const distBy = new Map<string, any>()
  ;(dist?.provinces ?? []).forEach((p: any) => {
    if (p?.short) distBy.set(String(p.short), p)
    if (p?.name) distBy.set(String(p.name), p)
  })
  const leaderBy = new Map<string, any>()
  ;(leaders ?? []).forEach((p: any) => {
    if (p?.short) leaderBy.set(String(p.short), p)
    if (p?.name) leaderBy.set(String(p.name), p)
  })

  return PROVINCES.map((seed, idx) => {
    const d = distBy.get(seed.short) ?? distBy.get(seed.name) ?? null
    const l = leaderBy.get(seed.short) ?? leaderBy.get(seed.name) ?? null
    return {
      ...seed,
      idx,
      count: numOrNull(d?.count ?? l?.count) ?? 0,
      up: numOrNull(d?.up ?? l?.up),
      down: numOrNull(d?.down ?? l?.down),
      flat: numOrNull(d?.flat ?? l?.flat),
      pct: numOrNull(d?.pct ?? l?.pct),
      inflow: numOrNull(d?.inflow ?? l?.inflow),
      industries: (l?.industries ?? d?.industries ?? []).filter(Boolean),
      leaders: l?.leaders ?? d?.leaders ?? [],
      cities: CITIES[seed.short] ?? [],
      hasData: Boolean(d || l),
    }
  })
}

function orderProvinceRows(rows: ProvinceRow[]) {
  if (!rows.some((r) => r.hasData)) return rows
  return [...rows].sort((a, b) => (b.count || 0) - (a.count || 0) || a.idx - b.idx)
}

export default function Regions() {
  const [dist, setDist] = useState<any>(null)
  const [prefs, setPrefs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [selectedShort, setSelectedShort] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<any>('/api/market/company-map').catch(() => null),
      api.get<any>('/api/market/province-leaders').catch(() => null),
    ])
      .then(([d, p]) => {
        setDist(d)
        setPrefs(p?.provinces ?? [])
      })
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [])

  const rows = useMemo(() => buildProvinceRows(dist, prefs), [dist, prefs])
  const ordered = useMemo(() => orderProvinceRows(rows), [rows])

  useEffect(() => {
    if (!loaded) return
    setSelectedShort((prev) => {
      if (prev && ordered.some((r) => r.short === prev)) return prev
      return (ordered.find((r) => r.hasData) ?? ordered[0])?.short ?? prev
    })
  }, [loaded, ordered])

  const filtered = useMemo(() => {
    const key = q.trim()
    if (!key) return ordered
    return ordered.filter((p) =>
      p.short.includes(key) || p.name.includes(key) || p.type.includes(key) || p.cities.some((c) => c.includes(key)))
  }, [ordered, q])

  const selected = ordered.find((r) => r.short === selectedShort) ?? ordered[0]
  const withDataCount = rows.filter((r) => r.hasData).length

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="hud-map-title" style={{ fontSize: 20 }}>地域 · 行业偏好</div>
          <div className="muted small">
            全部 34 个省级行政区 · 主要城市、代表行业与领涨公司 · 数据来自东方财富地域板块
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {loading ? (
            <Tag>数据加载中</Tag>
          ) : withDataCount ? (
            <Tag color="gold">已返回 {withDataCount} 个地区</Tag>
          ) : (
            <Tag>数据源暂未返回，先按静态省份浏览</Tag>
          )}
          <Input.Search
            allowClear
            placeholder="搜索省份 / 城市"
            style={{ width: 260 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <Card title="省份列表" desc={`${filtered.length} / ${rows.length} 个省级行政区`} pad={false}>
              <Table
                size="small"
                rowKey="short"
                dataSource={filtered}
                pagination={false}
                scroll={{ y: 560 }}
                locale={{ emptyText: '没有匹配的省份' }}
                onRow={(r) => ({
                  onClick: () => setSelectedShort(r.short),
                  style: {
                    cursor: 'pointer',
                    background: r.short === selected?.short ? 'var(--tag-bg)' : undefined,
                  },
                })}
                columns={[
                  {
                    title: '省份',
                    dataIndex: 'short',
                    render: (v: string, r: ProvinceRow) => (
                      <span><b>{v}</b> <span className="muted small">{r.type}</span></span>
                    ),
                  },
                  {
                    title: '家数',
                    dataIndex: 'count',
                    align: 'right',
                    render: (v: number, r: ProvinceRow) => (
                      <span className="num">{r.hasData ? v : '--'}</span>
                    ),
                  },
                  {
                    title: '涨跌',
                    dataIndex: 'pct',
                    align: 'right',
                    render: (v: number | null) => (
                      <span className={`num ${v === null ? 'muted' : trendClass(v)}`}>{v === null ? '--' : fmt.pct(v)}</span>
                    ),
                  },
                ]}
              />
            </Card>
          </div>

          <div style={{ flex: '2 1 560px', minWidth: 320 }}>
            {selected ? (
              <Card
                title={`${selected.short} · 地域概览`}
                desc={selected.hasData ? `${selected.name} · ${selected.count} 家上市公司` : `${selected.name} · 数据源暂未返回`}
              >
                {!selected.hasData && (
                  <div
                    className="muted small"
                    style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--tag-bg)', lineHeight: 1.6 }}
                  >
                    该省数据源暂未返回，上市公司数、涨跌、主力净流入和领涨公司暂时为空；接口恢复后补全。
                  </div>
                )}

                <div className="kpi-grid" style={{ gap: 10 }}>
                  <Kpi
                    label="上市公司"
                    value={selected.hasData ? selected.count.toLocaleString('zh-CN') : '--'}
                    sub={<span className="muted">{selected.type}</span>}
                  />
                  <Kpi
                    label="涨 / 跌 / 平"
                    value={selected.hasData
                      ? `${selected.up ?? '--'} / ${selected.down ?? '--'} / ${selected.flat ?? '--'}`
                      : '--'}
                    small
                  />
                  <Kpi
                    label="地域涨跌"
                    value={selected.pct === null ? '--' : fmt.pct(selected.pct)}
                    color={selected.pct === null ? undefined : selected.pct >= 0 ? 'var(--up)' : 'var(--down)'}
                    sub={<span className="muted">{selected.hasData ? '东方财富地域板块' : '待数据源返回'}</span>}
                  />
                  <Kpi
                    label="主力净流入"
                    value={fmt.big(selected.inflow)}
                    color={selected.inflow === null ? undefined : selected.inflow >= 0 ? 'var(--up)' : 'var(--down)'}
                    sub={<span className="muted">{selected.hasData ? '板块资金口径' : '待数据源返回'}</span>}
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="muted small" style={{ marginBottom: 6 }}>主要城市</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.cities.length
                      ? selected.cities.map((c) => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)
                      : <span className="muted small">暂无城市信息</span>}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="muted small" style={{ marginBottom: 6 }}>代表行业</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selected.industries.length
                      ? selected.industries.map((x) => <Tag key={x} color="gold" style={{ margin: 0 }}>{x}</Tag>)
                      : (
                        <span className="muted small">
                          {selected.hasData ? '该省代表行业数据源暂未返回' : '该省数据源暂未返回'}
                        </span>
                      )}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="muted small" style={{ marginBottom: 4 }}>领涨公司</div>
                  {selected.leaders.length ? (
                    selected.leaders.slice(0, 10).map((s: any) => (
                      <div
                        key={s.code || s.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          borderBottom: '1px solid var(--border-soft)',
                        }}
                      >
                        {s.code ? (
                          <Link className="link" to={`/stock/${s.code}`} style={{ fontWeight: 600 }}>{s.name}</Link>
                        ) : (
                          <b>{s.name}</b>
                        )}
                        <span className="mono muted small">{s.code}</span>
                        <span className="muted small">{s.industry || '--'}</span>
                        <b className={`num ${trendClass(s.pct)}`} style={{ marginLeft: 'auto' }}>{fmt.pct(s.pct)}</b>
                      </div>
                    ))
                  ) : (
                    <div className="muted small" style={{ padding: '8px 0' }}>
                      {selected.hasData ? '该省领涨公司数据源暂未返回' : '该省数据源暂未返回'}
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card>
                <EmptyState text="还没有可展示的省份数据" icon="◇" />
              </Card>
            )}
          </div>
      </div>
    </div>
  )
}
