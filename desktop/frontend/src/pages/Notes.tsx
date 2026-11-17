import { useState } from 'react'
import { Button, Input, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Card } from '../components/ui'

type Note = { id: string; text: string; date: string }
const KEY = 'stockdesk-notes'
const load = (): Note[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>(load)
  const [draft, setDraft] = useState('')
  const save = (next: Note[]) => { setNotes(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const add = () => {
    const text = draft.trim()
    if (!text) return
    const next = [{ id: String(Date.now()), text, date: new Date().toLocaleString('zh-CN', { hour12: false }) }, ...notes]
    save(next); setDraft(''); message.success('已保存笔记')
  }
  return (
    <div style={{ maxWidth: 860 }}>
      <Card title="笔记" desc="记录交易计划与复盘想法，保存在本机">
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.TextArea value={draft} onChange={(e) => setDraft(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="例如：明日若跌破 MA20 减仓一半…" />
          <Button type="primary" icon={<PlusOutlined />} onClick={add}>保存</Button>
        </div>
        <div style={{ marginTop: 14 }}>
          {notes.length === 0 && <div className="muted small">还没有笔记。</div>}
          {notes.map((n) => (
            <div key={n.id} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                <div className="muted small mono" style={{ marginTop: 4 }}>{n.date}</div>
              </div>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => save(notes.filter((x) => x.id !== n.id))} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
