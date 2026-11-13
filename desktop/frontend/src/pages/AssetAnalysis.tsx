import { Navigate } from 'react-router-dom'

/**
 * 旧「资产分析」页已经合并进持仓管理（/portfolio?tab=analysis）。
 * 保留默认导出，避免 App.tsx 里的历史引用报错；直接访问旧地址会原地替换。
 */
export default function AssetAnalysis() {
  return <Navigate to="/portfolio?tab=analysis" replace />
}
