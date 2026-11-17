import { useEffect, useState } from 'react'
import { Form, InputNumber, Modal, message } from 'antd'
import { api } from '../api'

/**
 * Single-field account editor.
 * The account has one anchor — 账户资产 — and the backend derives 可用现金
 * from the trade book, so there is no second number to keep in sync.
 */
export default function AccountAssetsModal({
  open,
  onClose,
  onDone,
  assets,
  total,
  cash,
  marketValue,
}: {
  open: boolean
  onClose: () => void
  onDone?: () => void
  assets: number
  total: number
  cash: number
  marketValue: number
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) form.setFieldsValue({ assets })
  }, [open, assets])

  const submit = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await api.put('/api/portfolio/account', { assets: v.assets })
      message.success('初始资产已更新，累计收益率基准已重算')
      onClose()
      onDone?.()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="初始资产（收益基准）" open={open} onCancel={onClose} onOk={submit} okText="保存" cancelText="取消" confirmLoading={saving}>
      <div className="hero" style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
        <div className="hero-label">当前总资产</div>
        <div className="hero-value num" style={{ fontSize: 24 }}>¥ {total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="hero-row" style={{ marginTop: 8, gap: 18 }}>
          <div className="hero-stat"><div className="k">持仓市值</div><div className="v num">¥{marketValue.toLocaleString('zh-CN')}</div></div>
          <div className="hero-stat"><div className="k">可用现金</div><div className="v num">¥{cash.toLocaleString('zh-CN')}</div></div>
        </div>
      </div>
      <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.8 }}>
        总资产 = 可用现金 + 持仓市值，会随行情涨跌实时变化。下面的初始资产只作为累计收益率的计算基准，不影响总资产。
      </div>
      <Form form={form} layout="vertical">
        <Form.Item
          name="assets"
          label="初始资产（¥）"
          rules={[{ required: true, message: '请输入初始资产' }]}
          extra="你当初投入该账户的本金，用于计算累计收益率与净值曲线。"
        >
          <InputNumber style={{ width: '100%' }} min={0} step={1000} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
