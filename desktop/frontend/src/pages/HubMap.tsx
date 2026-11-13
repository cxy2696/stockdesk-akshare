import { useEffect, useMemo, useState } from 'react'
import * as echarts from 'echarts'
import { Button, Input, Select, Tag, Tooltip } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { Card, Kpi } from '../components/ui'
import EChart from '../components/EChart'
import { api } from '../api'
import { fmt, trendClass } from '../utils'
import { useTheme } from '../ThemeContext'
import chinaJson from '../assets/china.json'

let registered = false
function ensureMap() {
  if (registered) return
  // @ts-ignore DataV GeoJSON
  echarts.registerMap('china', chinaJson as any)
  registered = true
}

ensureMap()

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
  hasData: boolean
}

// 34 个省级行政区静态兜底：接口空的时候也能逐个切换。
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

function escapeHtml(input: unknown) {
  return String(input ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ))
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
    const industries = (l?.industries ?? d?.industries ?? []).filter(Boolean)
    return {
      ...seed,
      idx,
      count: numOrNull(d?.count ?? l?.count) ?? 0,
      up: numOrNull(d?.up ?? l?.up),
      down: numOrNull(d?.down ?? l?.down),
      flat: numOrNull(d?.flat ?? l?.flat),
      pct: numOrNull(d?.pct ?? l?.pct),
      inflow: numOrNull(d?.inflow ?? l?.inflow),
      industries,
      leaders: l?.leaders ?? d?.leaders ?? [],
      hasData: Boolean(d || l),
    }
  })
}

function orderProvinceRows(rows: ProvinceRow[]) {
  if (!rows.some((r) => r.hasData)) return rows
  return [...rows].sort((a, b) => (b.count || 0) - (a.count || 0) || a.idx - b.idx)
}

export default function HubMap() {
  const { mode, colors } = useTheme()
  const [dist, setDist] = useState<any>(null)
  const [leaders, setLeaders] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedShort, setSelectedShort] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<any>('/api/market/company-map').catch(() => null),
      api.get<any>('/api/market/province-leaders').catch(() => null),
    ])
      .then(([m, pl]) => {
        setDist(m)
        setLeaders(pl?.provinces ?? [])
      })
      .finally(() => setLoaded(true))
  }, [])

  const rows = useMemo(() => buildProvinceRows(dist, leaders), [dist, leaders])
  const ordered = useMemo(() => orderProvinceRows(rows), [rows])

  useEffect(() => {
    if (!loaded) return
    setSelectedShort((prev) => {
      if (prev && ordered.some((r) => r.short === prev)) return prev
      return (ordered.find((r) => r.hasData) ?? ordered[0])?.short ?? prev
    })
  }, [loaded, ordered])

  const selected = ordered.find((r) => r.short === selectedShort) ?? ordered[0]
  const filtered = useMemo(() => {
    const key = q.trim()
    if (!key) return ordered
    return ordered.filter((r) => r.short.includes(key) || r.name.includes(key) || r.type.includes(key))
  }, [ordered, q])

  const withDataCount = rows.filter((r) => r.hasData).length
  const totalCount = numOrNull(dist?.total) ?? rows.reduce((sum, r) => sum + r.count, 0)

  const move = (direction: number) => {
    if (!ordered.length) return
    const index = ordered.findIndex((r) => r.short === selected?.short)
    const next = ordered[(index + direction + ordered.length) % ordered.length]
    if (next) setSelectedShort(next.short)
  }

  const mapOption = useMemo<any>(() => {
    const maxCount = Math.max(600, ...rows.map((r) => r.count || 0))
    const blankArea = mode === 'light' ? '#F1F5FB' : '#111A22'
    const blankBorder = mode === 'light' ? '#D8E1EE' : mode === 'hud' ? '#3C463D' : '#273345'
    const mapRamp = mode === 'light'
      ? ['#EEF3FB', '#C7DCFB', '#8CB6F6', colors.accent]
      : mode === 'hud'
        ? ['#18231D', '#4D5528', '#B8A63C', colors.accent]
        : ['#12202E', '#1E3A5F', '#3B6EA5', colors.accent]
    const emphasisLabel = mode === 'hud' ? '#111111' : '#FFFFFF'

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        textStyle: { color: colors.tooltipText, fontSize: 11 },
        formatter: (p: any) => {
          const row = rows.find((r) => r.name === p.name || r.short === p.name)
          if (!row) return escapeHtml(p?.name)
          if (!row.hasData) {
            return `<b>${escapeHtml(row.short)}</b><br/><span style="color:${colors.axis}">该省数据源暂未返回</span>`
          }
          return `<b>${escapeHtml(row.short)}</b> <span style="color:${colors.axis}">${escapeHtml(row.type)}</span><br/>
            上市公司 ${row.count} 家<br/>
            涨 ${row.up ?? '--'} / 跌 ${row.down ?? '--'} / 平 ${row.flat ?? '--'}<br/>
            地域涨跌 ${fmt.pct(row.pct)}<br/>
            主力净流入 ${fmt.big(row.inflow)}`
        },
      },
      visualMap: {
        min: 0,
        max: maxCount,
        left: 12,
        bottom: 12,
        itemWidth: 10,
        itemHeight: 96,
        calculable: false,
        text: ['多', '少'],
        textStyle: { color: colors.axis, fontSize: 9 },
        inRange: { color: mapRamp },
      },
      series: [{
        type: 'map',
        map: 'china',
        roam: true,
        zoom: 1.06,
        scaleLimit: { min: 0.8, max: 5 },
        top: 8,
        bottom: 4,
        selectedMode: 'single',
        selectedMap: selected ? { [selected.name]: true } : undefined,
        itemStyle: { areaColor: blankArea, borderColor: blankBorder, borderWidth: 0.8 },
        emphasis: {
          itemStyle: { areaColor: colors.accent, borderColor: colors.text, borderWidth: 1.2 },
          label: { show: true, color: emphasisLabel, fontSize: 10 },
        },
        select: {
          itemStyle: { areaColor: colors.accent, borderColor: colors.text, borderWidth: 1.2 },
          label: { show: true, color: emphasisLabel, fontSize: 10 },
        },
        label: { show: false },
        data: rows.map((r) => ({ name: r.name, value: r.count, selected: r.short === selected?.short })),
      }],
    }
  }, [rows, selected, mode, colors])

  const mapEvents = useMemo(
    () => ({
      click: (p: any) => {
        const row = rows.find((r) => r.name === p?.name || r.short === p?.name)
        if (row) setSelectedShort(row.short)
      },
    }),
    [rows],
  )

  return (
    <div>
      <div className="hud-map-head">
        <div>
          <div className="hud-map-title">中国上市公司分布</div>
          <div className="muted small">按东方财富地域板块统计 · 沪深京 A 股 · 覆盖 34 个省级行政区</div>
        </div>
        <div className="hud-map-total">
          <span>上市公司总数</span>
          <b>{totalCount > 0 ? totalCount.toLocaleString('zh-CN') : '--'}</b>
          <em>
            {withDataCount
              ? `${withDataCount} 个地区已返回 · 共 34 个省级行政区`
              : '数据源暂未返回 · 34 个省级行政区均可切换'}
          </em>
        </div>
      </div>

      <div
        className="card"
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', marginBottom: 12 }}
      >
        <span className="muted small">省级行政区</span>
        <Select
          showSearch
          value={selected?.short}
          onChange={(v) => setSelectedShort(v)}
          style={{ width: 210 }}
          placeholder="搜索并选择省份"
          filterOption={(input, option: any) =>
            `${option?.label ?? ''}${option?.name ?? ''}`.includes(input.trim())}
          options={ordered.map((r) => ({
            value: r.short,
            label: `${r.short}${r.hasData ? ` · ${r.count} 家` : ''}`,
            name: r.name,
          }))}
        />
        <Tooltip title="上一省">
          <Button size="small" icon={<LeftOutlined />} onClick={() => move(-1)} aria-label="上一省" />
        </Tooltip>
        <Tooltip title="下一省">
          <Button size="small" icon={<RightOutlined />} onClick={() => move(1)} aria-label="下一省" />
        </Tooltip>
        <span className="muted small">共 34 个省级行政区{loaded ? '' : ' · 加载中…'}</span>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          {withDataCount ? `已有 ${withDataCount} 个地区数据` : '数据源暂未返回，可先按静态省份浏览'}
        </span>
      </div>

      <Card title="地域分布地图" desc="颜色越亮 = 上市公司越多 · 滚轮缩放 / 拖拽平移 · 点击省份联动上方选择器">
        <EChart option={mapOption} height={500} notMerge onEvents={mapEvents} />
      </Card>

      {selected && (
        <div style={{ marginTop: 14 }}>
          <ProvinceOverview row={selected} />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Card title="全部省份" desc="点击省份行切换 · 展开查看领涨公司">
          <div className="row-between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Input.Search
              allowClear
              placeholder="搜索省份 / 全称"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 280 }}
            />
            <span className="muted small">{filtered.length} / {rows.length} 个省级行政区</span>
          </div>
          <div className="hud-leaders-scroll" style={{ maxHeight: 460 }}>
            {filtered.map((p) => (
              <details
                key={p.short}
                className="hud-province-details"
                style={p.short === selected?.short ? { background: 'var(--tag-bg)', borderRadius: 6 } : undefined}
              >
                <summary onClick={() => setSelectedShort(p.short)}>
                  <b>{p.short}</b>
                  <span className="muted small">
                    {p.hasData
                      ? `${p.count} 家 · ${p.industries.slice(0, 2).join(' / ') || '行业待返回'}`
                      : '该省数据源暂未返回'}
                  </span>
                  <em>
                    {p.leaders[0]?.name ?? '--'}
                    {p.leaders[0] ? ` ${fmt.pct(p.leaders[0].pct)}` : ''}
                  </em>
                </summary>
                <div className="hud-leader-list">
                  {p.leaders.length ? (
                    p.leaders.slice(0, 5).map((s: any) => (
                      <div key={s.code || s.name} className="hud-leader-row">
                        {s.code ? (
                          <Link className="link" to={`/stock/${s.code}`} style={{ fontWeight: 600 }}>{s.name}</Link>
                        ) : (
                          <b>{s.name}</b>
                        )}
                        <span className="mono muted">{s.code}</span>
                        <span className="muted small">{s.industry || '--'}</span>
                        <em className={trendClass(s.pct)}>{fmt.pct(s.pct)}</em>
                      </div>
                    ))
                  ) : (
                    <div className="muted small" style={{ padding: '4px 0' }}>
                      {p.hasData ? '该省领涨公司数据源暂未返回' : '该省数据源暂未返回'}
                    </div>
                  )}
                  <div style={{ marginTop: 4, paddingLeft: 0 }}>
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setSelectedShort(p.short)}>
                      在地图中查看
                    </Button>
                  </div>
                </div>
              </details>
            ))}
            {!filtered.length && (
              <div className="muted small" style={{ textAlign: 'center', padding: 24 }}>
                没有匹配的省份，换个关键词试。
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function ProvinceOverview({ row }: { row: ProvinceRow }) {
  const hasLeaders = row.leaders.length > 0
  return (
    <Card
      title={`${row.short} · 地域概览`}
      desc={row.hasData ? `${row.count} 家上市公司` : '该省数据源暂未返回'}
    >
      {!row.hasData && (
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
          value={row.hasData ? row.count.toLocaleString('zh-CN') : '--'}
          sub={<span className="muted">{row.type}</span>}
        />
        <Kpi
          label="涨 / 跌 / 平"
          value={row.hasData ? `${row.up ?? '--'} / ${row.down ?? '--'} / ${row.flat ?? '--'}` : '--'}
          small
        />
        <Kpi
          label="地域涨跌"
          value={row.pct === null ? '--' : fmt.pct(row.pct)}
          color={row.pct === null ? undefined : row.pct >= 0 ? 'var(--up)' : 'var(--down)'}
          sub={<span className="muted">{row.hasData ? '东方财富地域板块' : '待数据源返回'}</span>}
        />
        <Kpi
          label="主力净流入"
          value={fmt.big(row.inflow)}
          color={row.inflow === null ? undefined : row.inflow >= 0 ? 'var(--up)' : 'var(--down)'}
          sub={<span className="muted">{row.hasData ? '板块资金口径' : '待数据源返回'}</span>}
        />
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>代表行业</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {row.industries.length ? (
              row.industries.map((name) => <Tag key={name} color="gold" style={{ margin: 0 }}>{name}</Tag>)
            ) : (
              <span className="muted small">
                {row.hasData ? '该省代表行业数据源暂未返回' : '该省数据源暂未返回'}
              </span>
            )}
          </div>
        </div>

        <div style={{ flex: '2 1 420px', minWidth: 260 }}>
          <div className="muted small" style={{ marginBottom: 4 }}>领涨公司</div>
          {hasLeaders ? (
            row.leaders.slice(0, 6).map((s: any) => (
              <div
                key={s.code || s.name}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}
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
              {row.hasData ? '该省领涨公司数据源暂未返回' : '该省数据源暂未返回'}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
