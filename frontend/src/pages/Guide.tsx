import { Card } from '../components/ui'

const ITEMS: [string, string][] = [
  ['MA5/10/20/60', '短中长期均线。价格站上均线且多头排列偏强；跌破 MA20/60 需警惕趋势转弱。'],
  ['RSI(14)', '高于 70 超买、低于 30 超卖；低位钝化后拐头向上，可能是底部反转的早期信号。'],
  ['MACD', 'DIF 上穿 DEA 为金叉，绿柱缩短代表下跌动能减弱；零轴上方金叉可靠性更高。'],
  ['九转序列', '连续 9 根收盘价低于/高于 4 日前收盘价，提示下跌/上涨动能衰竭，9 为完整结构。'],
  ['底部钝化', '价格处于 60 日低位，RSI 连续低位数日后拐头，或 MACD 绿柱缩短，属于左侧观察信号。'],
  ['主力净流入', '超大单与大单净额之和。单日易受大单影响，需要结合连续性与行业资金一起看。'],
  ['筹码分布', '按成交量与价格分布估算持仓成本，观察获利盘、套牢盘、集中度与筹码峰。'],
  ['黄金分割', '以前高前低计算 0.236/0.382/0.5/0.618/0.786 支撑压力，作为交易参考而非预测。'],
  ['策略与标的', '形态、量价、资金、流动性综合评分；仅用于缩小观察范围，不构成投资建议。'],
]

export default function Guide() {
  return (
    <div>
      <div className="muted small" style={{ marginBottom: 12 }}>
        指标只描述过去与当前状态，不预测未来。任何信号都需要结合仓位、止损与基本面。
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {ITEMS.map(([title, text]) => (
          <Card key={title} title={title}><div className="small" style={{ color: 'var(--text-sub)', lineHeight: 1.8 }}>{text}</div></Card>
        ))}
      </div>
    </div>
  )
}
