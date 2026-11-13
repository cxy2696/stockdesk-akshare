import { Navigate } from 'react-router-dom'

/**
 * 旧「投资建议」页已经合并进持仓管理（/portfolio?tab=advice）。
 * 保留默认导出，避免 App.tsx 里的历史引用报错；直接访问旧地址会原地替换。
 */
export default function AdviceCenter() {
  return <Navigate to="/portfolio?tab=advice" replace />
}
