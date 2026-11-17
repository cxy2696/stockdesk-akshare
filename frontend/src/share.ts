import { message } from 'antd'

declare global {
  interface Window { html2canvas?: any }
}

function loadScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas)
    const s = document.createElement('script')
    s.src = '/vendor/html2canvas.min.js'
    s.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('加载失败'))
    s.onerror = () => reject(new Error('加载失败'))
    document.head.appendChild(s)
    setTimeout(() => reject(new Error('加载超时')), 12000)
  })
}

export async function sharePageImage() {
  const el = (document.querySelector('.content') || document.body) as HTMLElement
  try {
    const lib = await loadScript()
    const canvas = await lib(el, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#070a0c',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    })
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('图片生成失败')
    const w = window as any
    if (w.pywebview?.api?.share_image) {
      try {
        const res = await w.pywebview.api.share_image(canvas.toDataURL('image/png'))
        if (res?.ok) {
          message.success('已保存并打开系统分享')
          return
        }
      } catch {
        /* fall through to the browser/download path */
      }
    }
    const file = new File([blob], `stockdesk-${Date.now()}.png`, { type: 'image/png' })
    const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
    if (mobile && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'StockDesk 界面分享' })
      message.success('已调起系统分享')
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
      message.success('界面图片已保存到下载目录')
    }
  } catch {
    try {
      await navigator.clipboard.writeText(el.innerText.slice(0, 1200))
      message.success('图片生成不可用，已复制当前页面文字')
    } catch {
      message.warning('分享失败，请重试')
    }
  }
}
