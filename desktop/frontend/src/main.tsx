import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import { buildTheme } from './theme'
import { ThemeProvider, useTheme } from './ThemeContext'
import './styles.css'

dayjs.locale('zh-cn')

function Root() {
  const { mode } = useTheme()
  return (
    <ConfigProvider locale={zhCN} theme={buildTheme(mode)}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </React.StrictMode>,
)
