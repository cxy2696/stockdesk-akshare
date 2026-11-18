import { useEffect, useState } from 'react'
import { Button, Tooltip, message } from 'antd'
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons'
import { api } from '../api'

function ago(seconds?: number | null) {
  if (seconds == null) return '无缓存'
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} 秒前`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时前`
  return `${(seconds / 86400).toFixed(1)} 天前`
}

function timeOnly(value?: string | null) {
  if (!value) return '--'
  const m = String(value).match(/(\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : value
}

export default function DataStatus() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const result = await api.get<any>('/api/data/status')
      setData(result)
      setError('')
    } catch (e: any) {
      setError(e?.message || '数据状态暂不可用')
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await api.post('/api/data/refresh', { target: 'all' })
      message.success('已请求后台刷新；各页面会在数据到达后更新')
      setTimeout(load, 2500)
    } catch (e: any) {
      message.error(e?.message || '刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  if (error && !data) {
    return <div className="data-status-bar error"><span className="data-dot" />数据状态：{error}</div>
  }
  if (!data) {
    return <div className="data-status-bar"><span className="data-dot pending" /><SyncOutlined spin /> 正在读取数据快照…</div>
  }

  const coverage = data.coverage || {}
  const scheduler = data.scheduler || {}
  const sources = (data.sources || []).filter((s: any) => s.used_in_snapshot).map((s: any) => s.label)
  const expected = coverage.expected ?? '--'
  const present = coverage.present ?? '--'
  const missing = coverage.missing ?? '--'
  const unpriced = coverage.unpriced ?? '--'
  const freshness = data.freshness
  const freshLabel = freshness === 'fresh' ? '及时' : freshness === 'delayed' ? '稍旧' : freshness === 'stale' ? '过期' : '待生成'
  const jobName: Record<string, string> = { spot: '全市场快照', state: '行情状态', daily: '每日策略', index: '指数分析', models: '量化模型', evaluation: '历史测评' }
  const pending = (scheduler.force_pending || []).map((x: string) => jobName[x] || x)
  const jobLabel = scheduler.running
    ? (scheduler.last_job
      ? `后台更新${jobName[scheduler.last_job] || scheduler.last_job} · ${ago(scheduler.last_tick ? Date.now() / 1000 - scheduler.last_tick : null)}`
      : scheduler.last_tick
        ? `后台巡检正常 · ${ago(Date.now() / 1000 - scheduler.last_tick)}`
        : '后台已启动，等待首轮')
    : '后台调度未启动'
  const pendingLabel = pending.length ? ` · 排队 ${pending.length}` : ''

  return (
    <div className={`data-status-bar ${freshness || ''}`}>
      <span className={`data-dot ${freshness || 'pending'}`} />
      <b>数据快照</b>
      <span className="data-main">{data.snapshot_date || '--'} · {timeOnly(data.updated_at)}</span>
      <span className="data-muted">（{ago(data.age_seconds)} · {freshLabel}）</span>
      <span className="data-sep" />
      <span className="data-muted">覆盖 <b className={coverage.data_complete ? 'ok' : 'warn'}>{present}/{expected}</b> · 缺 {missing} · 未定价 {unpriced}</span>
      <span className="data-sep" />
      <Tooltip title={sources.length ? `本次快照来源：${sources.join('、')}` : '尚无来源记录；数据到达后自动标记'}>
        <span className="data-muted">来源 {sources.length ? sources.join(' + ') : '--'}</span>
      </Tooltip>
      <span className="data-sep" />
      <span className="data-muted">{jobLabel}{pendingLabel}</span>
      <span style={{ marginLeft: 'auto' }} />
      <Button size="small" type="text" icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>
        刷新数据
      </Button>
    </div>
  )
}
