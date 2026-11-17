const BASE = ''

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const msg = body?.error || body?.detail || `请求失败 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  if (body && typeof body === 'object' && 'ok' in body) {
    if (!body.ok) throw new Error(body.error || '请求失败')
    return body.data as T
  }
  return body as T
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, data?: any) => request<T>(p, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(p: string, data?: any) => request<T>(p, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
}

export function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}
