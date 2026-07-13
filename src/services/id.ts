/**
 * `crypto.randomUUID()` はHTTPのLANアクセスでは利用できないブラウザがあるため、
 * 学習履歴のローカルIDには安全な代替値を用意する。
 */
export function createLocalId(prefix = 'result'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
