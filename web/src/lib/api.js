/** status = HTTP status (0 = network), code = the server's error code, data = the whole error body (its extra fields). */
export class ApiError extends Error {
  constructor(status, code, data = null) {
    super(code || `HTTP ${status}`)
    this.status = status
    this.code = code
    this.data = data
  }
}

/**
 * Same-origin JSON fetch. `body` objects are sent as JSON; Blobs/Files are sent raw.
 * A 401 broadcasts `hisaab:signedout` so the app shell can send the user to /login.
 */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, credentials: 'same-origin' }
  if (body instanceof Blob) {
    init.body = body
    if (!init.headers['Content-Type']) init.headers['Content-Type'] = body.type || 'application/octet-stream'
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['Content-Type'] = 'application/json'
  }
  let res
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'network')
  }
  if (res.status === 401) window.dispatchEvent(new Event('hisaab:signedout'))
  const type = res.headers.get('content-type') || ''
  const data = type.includes('application/json') ? await res.json().catch(() => null) : null
  if (!res.ok) throw new ApiError(res.status, data?.error, data)
  return data
}
