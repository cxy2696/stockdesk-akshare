import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightOutlined,
  EnvironmentOutlined,
  FilterOutlined,
  FundOutlined,
  LineChartOutlined,
  NodeIndexOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { Skeleton } from 'antd'
import { Card } from '../components/ui'

interface ResearchCard {
  key: string
  title: string
  desc: string
  detail: string
  icon: JSX.Element
}

const CARDS: ResearchCard[] = [
  {
    key: '/forecast',
    title: '市场预测',
    desc: '未来 5 日状态条件收益与上涨概率',
    detail: '只回答“环境偏多还是偏空”，不选个股。',
    icon: <RadarChartOutlined />,
  },
  {
    key: '/models',
    title: '量化模型',
    desc: 'HMM 仓位 · 渗流行业 · 九转买卖点',
    detail: '看结论、目标仓位和行业关注，模型细节默认收起。',
    icon: <NodeIndexOutlined />,
  },
  {
    key: '/factors',
    title: '因子筛选',
    desc: '横截面动量、价值、流动性、资金、稳定性',
    detail: '用于缩小观察范围，显示每个因子的覆盖率。',
    icon: <FilterOutlined />,
  },
  {
    key: '/screener',
    title: '板块跟踪',
    desc: '行业/概念、市场情绪、个股热图',
    detail: '看资金流向与板块强弱，不追没有持续性的脉冲。',
    icon: <FundOutlined />,
  },
  {
    key: '/index-analysis',
    title: '指数分析',
    desc: 'A 股宽基与海外指数的趋势、支撑压力',
    detail: '判断市场结构，给仓位和风格提供背景。',
    icon: <LineChartOutlined />,
  },
  {
    key: '/regions',
    title: '地域与产业',
    desc: '中国上市公司分布、省份龙头与行业偏好',
    detail: '从区域集中度看产业链，不把地图当交易信号。',
    icon: <EnvironmentOutlined />,
  },
]

export default function Research() {
  const nav = useNavigate()
  const [model, setModel] = useState<any>(null)
  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.get<any>('/api/market/models').catch(() => null),
      api.get<any>('/api/market/state?light=1').catch(() => null),
    ]).then(([m, s]) => {
      if (!alive) return
      setModel(m)
      setState(s)
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const hmm = model?.hmm ?? {}
  const perc = model?.percolation ?? {}
  const verdict = state?.verdict ?? {}
  const giant = Number(perc.giant_occupied ?? 0)
  const threshold = Number(perc.threshold ?? 0.5927)
  const regime = giant >= threshold ? '扩散' : giant >= threshold - 0.08 ? '临界' : '分裂'

  return (
    <div>
      <Card
        title="研究台"
        desc="先看市场结论，再进入一个研究方向；不在首页堆模型指标。"
        extra={<span className="muted small">研究入口 6 个</span>}
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <div className="research-summary">
            <div>
              <span className="muted small">HMM 状态</span>
              <b style={{ color: hmm.state === '强势' ? 'var(--up)' : hmm.state === '弱势' ? 'var(--down)' : 'var(--amber)' }}>
                {hmm.state ?? '--'}
              </b>
              <em>{hmm.confidence != null ? `置信度 ${(Number(hmm.confidence) * 100).toFixed(0)}%` : '等待模型快照'}</em>
            </div>
            <div>
              <span className="muted small">市场广度</span>
              <b style={{ color: regime === '扩散' ? 'var(--up)' : regime === '分裂' ? 'var(--down)' : 'var(--amber)' }}>{regime}</b>
              <em>{perc.ratio != null ? `上涨 ${(Number(perc.ratio) * 100).toFixed(1)}%` : '等待全市场快照'}</em>
            </div>
            <div>
              <span className="muted small">市场温度</span>
              <b>{state?.score ?? '--'}</b>
              <em>{verdict.label ?? '--'} · 仓位与风险优先</em>
            </div>
          </div>
        )}
      </Card>

      <div className="research-grid">
        {CARDS.map((c) => (
          <button key={c.key} className="research-card" onClick={() => nav(c.key)}>
            <span className="research-icon">{c.icon}</span>
            <span className="research-body">
              <b>{c.title}</b>
              <em>{c.desc}</em>
              <small>{c.detail}</small>
            </span>
            <ArrowRightOutlined className="research-arrow" />
          </button>
        ))}
      </div>

      <div className="muted small" style={{ marginTop: 12, lineHeight: 1.8 }}>
        研究页只保留入口，不重复每日策略的结论。想把模型结果变成交易计划，请回到「交易决策」或「历史测评」检查它在过去样本里的表现。
      </div>
    </div>
  )
}
