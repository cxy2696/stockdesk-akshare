import { useEffect, useMemo, useState } from 'react'
import { Input, Skeleton, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { api } from '../api'
import { fmt } from '../utils'

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
  宁夏: ['银川'], 新疆: ['乌鲁木齐', '昌吉'],
}

export default function Regions() {
  const [dist, setDist] = useState<any>(null)
  const [prefs, setPrefs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<any>('/api/market/company-map').catch(() => null),
      api.get<any>('/api/market/province-leaders').catch(() => null),
    ]).then(([d, p]) => { setDist(d); setPrefs(p?.provinces ?? []) }).finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const list = prefs.length ? prefs : (dist?.provinces ?? [])
    return list.filter((p: any) => !q || p.short.includes(q) || (CITIES[p.short] ?? []).some((c: string) => c.includes(q)))
  }, [prefs, dist, q])

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div>
          <div className="hud-map-title" style={{ fontSize: 20 }}>地域 · 行业偏好</div>
          <div className="muted small">全部省份与主要城市 · 代表性行业与领涨公司 · 数据来自东方财富地域板块</div>
        </div>
        <Input.Search allowClear placeholder="搜索省份 / 城市" style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && !rows.length ? <Skeleton active /> : (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {rows.map((p: any) => (
            <Card key={p.code || p.name} title={`${p.short} · ${p.count} 家上市公司`} extra={<Link to="/hub-map" className="small">地图 →</Link>}>
              <div className="muted small" style={{ marginBottom: 6 }}>主要城市：{(CITIES[p.short] ?? []).join(' · ') || '—'}</div>
              <div style={{ marginBottom: 8 }}>
                {(p.industries ?? []).map((x: string) => <Tag key={x} color="gold">{x}</Tag>)}
              </div>
              <div className="muted small" style={{ marginBottom: 4 }}>领涨公司</div>
              {(p.leaders ?? []).map((s: any) => (
                <div key={s.code} className="row-between" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span><b className="small">{s.name}</b> <span className="muted small mono">{s.code}</span> <span className="muted small">{s.industry}</span></span>
                  <b className={(s.pct ?? 0) >= 0 ? 'up' : 'down'}>{fmt.pct(s.pct)}</b>
                </div>
              ))}
              {!(p.leaders ?? []).length && <div className="muted small">加载中…</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
