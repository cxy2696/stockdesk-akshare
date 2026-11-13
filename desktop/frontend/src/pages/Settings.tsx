import { useEffect, useState } from 'react'
import { Button, Descriptions, Form, Input, InputNumber, Segmented, Tag, message } from 'antd'
import { ClearOutlined, ReloadOutlined, SaveOutlined, WalletOutlined } from '@ant-design/icons'
import { api } from '../api'
import { Card, StatLine } from '../components/ui'
import { fmt } from '../utils'
import { useTheme } from '../ThemeContext'
import { getAdmin, saveAdmin } from '../admin'

export default function SettingsPage() {
  const [summary, setSummary] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const { mode, setMode, scale, setScale, lang, setLang } = useTheme()
  const initialAdmin = getAdmin()
  const [adminName, setAdminName] = useState(initialAdmin.name)
  const [adminUid, setAdminUid] = useState(initialAdmin.uid)

  const load = async () => {
    const [s, h] = await Promise.all([api.get<any>('/api/portfolio/summary'), api.get<any>('/api/health')])
    setSummary(s)
    setHealth(h)
    form.setFieldsValue({ assets: s.assets })
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await api.put('/api/portfolio/account', { assets: v.assets })
      message.success('已保存，可用现金已按流水重算')
      load()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="grid-2">
        <Card title="资产总览" desc="总资产随持仓市值实时变化">
          <div className="hero" style={{ padding: 16, borderRadius: 14, marginBottom: 14 }}>
            <div className="hero-label">当前总资产</div>
            <div className="hero-value num" style={{ fontSize: 30 }}>¥ {fmt.money(summary?.total)}</div>
            <div className="hero-row" style={{ marginTop: 10, gap: 18 }}>
              <div className="hero-stat">
                <div className="k">持仓市值</div>
                <div className="v num">¥{fmt.money(summary?.market_value)}</div>
              </div>
              <div className="hero-stat">
                <div className="k">可用现金</div>
                <div className="v num">¥{fmt.money(summary?.cash)}</div>
              </div>
              <div className="hero-stat">
                <div className="k">累计收益</div>
                <div className={`v num ${(summary?.total_pct ?? 0) >= 0 ? 'up' : 'down'}`}>{fmt.pct(summary?.total_pct)}</div>
              </div>
            </div>
          </div>
          <Form form={form} layout="vertical">
            <Form.Item
              name="assets"
              label="初始资产（收益基准，¥）"
              rules={[{ required: true }]}
              extra="初始资产只用于计算累计收益率；当前总资产 = 可用现金 + 持仓市值，会随行情自动变动。"
            >
              <InputNumber style={{ width: '100%' }} min={0} step={1000} />
            </Form.Item>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>保存初始资产</Button>
          </Form>
          <div className="muted small" style={{ marginTop: 14, lineHeight: 1.8 }}>
            净投入 = 累计买入（含费用）− 累计卖出（扣费用）。买入减少现金、卖出增加现金，持仓涨跌直接反映在总资产上。
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="资金与流水" desc="自动计算">
            <StatLine k="累计买入" v={`¥${fmt.money(summary?.buy_total)}`} />
            <StatLine k="累计卖出" v={`¥${fmt.money(summary?.sell_total)}`} />
            <StatLine k="净投入" v={`¥${fmt.money(summary?.net_invested)}`} />
            <StatLine k="交易费用" v={`¥${fmt.money(summary?.fees)}`} />
            <StatLine k="交易笔数" v={`${summary?.trade_count ?? 0} 笔`} />
            <StatLine k="持仓数量" v={`${summary?.positions?.length ?? 0} 只`} />
          </Card>

          <Card title="数据与缓存" desc="东方财富公开接口">
            <StatLine k="运行状态" v={<Tag color="green">正常</Tag>} />
            <StatLine k="服务版本" v={health?.version ?? '--'} />
            <StatLine k="行情时段" v={health?.status?.label ?? '--'} />
            <StatLine k="缓存策略" v="快照 3 分钟 / K线 10 分钟" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button icon={<ReloadOutlined />} onClick={load}>刷新状态</Button>
              <Button
                icon={<ClearOutlined />}
                loading={clearing}
                onClick={async () => {
                  setClearing(true)
                  try {
                    await fetch('/api/health')
                    message.success('已重载')
                    location.reload()
                  } finally {
                    setClearing(false)
                  }
                }}
              >
                清理并重载
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title={lang === 'en' ? 'Language' : '语言'} desc={lang === 'en' ? 'Switch the interface language' : '切换界面语言'}>
          <Segmented value={lang} onChange={(v) => setLang(v as 'zh' | 'en')} options={[{ label: '中文', value: 'zh' }, { label: 'English', value: 'en' }]} />
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="字体缩放" desc="只放大文字，布局自动换行/增行">
          <Segmented
            value={scale}
            onChange={(v) => setScale(Number(v))}
            options={[{ label: '100%', value: 1 }, { label: '120%', value: 1.2 }, { label: '150%', value: 1.5 }]}
          />
          <div className="muted small" style={{ marginTop: 8 }}>不缩放地图与固定图形；按键、表格、卡片按文字自动增高。</div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="管理员名片" desc="显示在 HUD 中枢左下角">
          <div className="grid-2" style={{ alignItems: 'end' }}>
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>名称</div>
              <Input value={adminName} maxLength={18} onChange={(e) => setAdminName(e.target.value)} placeholder="StockDesk" />
            </div>
            <div>
              <div className="muted small" style={{ marginBottom: 6 }}>UID</div>
              <Input value={adminUid} maxLength={24} onChange={(e) => setAdminUid(e.target.value)} placeholder="LOCAL-0001" />
            </div>
          </div>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            style={{ marginTop: 12 }}
            onClick={() => {
              saveAdmin({ name: adminName.trim() || 'StockDesk', uid: adminUid.trim() || 'LOCAL-0001' })
              message.success('管理员名片已更新')
            }}
          >
            保存名片
          </Button>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="关于 StockDesk">
          <Descriptions size="small" column={2} colon={false} labelStyle={{ color: 'var(--text-sub)', width: 110 }} contentStyle={{ color: 'var(--text)' }}>
            <Descriptions.Item label="应用">StockDesk · 个人股票投资台</Descriptions.Item>
            <Descriptions.Item label="版本">v1.11.0</Descriptions.Item>
            <Descriptions.Item label="定位">本地优先、单用户、离线可用的投资工作台</Descriptions.Item>
            <Descriptions.Item label="技术栈">FastAPI + React + ECharts</Descriptions.Item>
            <Descriptions.Item label="数据存储">SQLite（本地 data 目录）</Descriptions.Item>
            <Descriptions.Item label="覆盖市场">A 股（沪深主板 / 创业板 / 科创板 / 北交所）</Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
    </div>
  )
}
