import KdjPanel from '../components/KdjPanel'

export default function Kdj() {
  return (
    <div>
      <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.8 }}>
        KDJ 极值预警是独立提示层，不属于量化模型。上轨 J ≥ 118 为超买区，下轨 J ≤ -14 为超卖区；只做提示，不构成买卖指令。
      </div>
      <KdjPanel />
    </div>
  )
}
