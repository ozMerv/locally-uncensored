import type { RouteMount } from './routes'
import { requirePost, sendJson, withJsonBody } from './http'
import { bodyString } from '../src/dev/http-body'
import { isRecord, prop } from '../src/types/json-guards'
import {
  changeApprovedMcpTarget,
  isMcpTargetApproved,
  normaliseMcpUrl,
  readApprovedMcpTargets,
  verifyMcpApprovalKey,
} from './mcp-http-targets'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export function registerMcpHttpRoutes(routes: RouteMount): void {
  // Changes to the server-side allowlist require a local administrator key.
  // The key is not distributed in the browser bundle or stored in Git.
  routes.use('/local-api/mcp-http/approve', (req, res) => {
    if (!requirePost(req, res)) return
    const approvalKey = req.headers['x-lu-mcp-approval-key']
    if (typeof approvalKey !== 'string' || !verifyMcpApprovalKey(approvalKey)) {
      sendJson(res, 403, { error: 'MCP approval key is required or incorrect' })
      return
    }
    withJsonBody(req, res, (body) => {
      if (!isRecord(body)) { sendJson(res, 400, { error: 'Invalid MCP approval request' }); return }
      const target = bodyString(body, 'target')
      const action = prop(body, 'action')
      if (!target || (action !== 'approve' && action !== 'revoke')) {
        sendJson(res, 400, { error: 'Provide a URL and an approve or revoke action' })
        return
      }
      try {
        changeApprovedMcpTarget(target, action)
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid MCP URL' })
      }
    })
  })

  routes.use('/local-api/mcp-http/approved', (req, res) => {
    if (!requirePost(req, res)) return
    const approvalKey = req.headers['x-lu-mcp-approval-key']
    if (typeof approvalKey !== 'string' || !verifyMcpApprovalKey(approvalKey)) {
      sendJson(res, 403, { error: 'MCP approval key is required or incorrect' })
      return
    }
    sendJson(res, 200, { targets: readApprovedMcpTargets() })
  })

  routes.use('/local-api/mcp-http', (req, res) => {
    if (!requirePost(req, res)) return
    withJsonBody(req, res, (body) => {
      void (async () => {
        if (!isRecord(body)) {
          sendJson(res, 400, { error: 'Request body must be an object' })
          return
        }
        const raw = bodyString(body, 'target')
        let target: string
        try { target = normaliseMcpUrl(raw || '') }
        catch { sendJson(res, 400, { error: 'Invalid MCP URL' }); return }

        if (!isMcpTargetApproved(target)) {
          sendJson(res, 403, { error: 'MCP target is not approved. Add it in Settings using your local approval key.' })
          return
        }
        const message = prop(body, 'message')
        if (!isRecord(message) || message.jsonrpc !== '2.0') {
          sendJson(res, 400, { error: 'Invalid MCP JSON-RPC message' })
          return
        }

        const sessionId = bodyString(body, 'sessionId')
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        }
        if (sessionId) headers['Mcp-Session-Id'] = sessionId

        try {
          const upstream = await fetch(target, {
            method: 'POST',
            headers,
            body: JSON.stringify(message),
            redirect: 'manual',
            signal: AbortSignal.timeout(20000),
          })
          // Do not follow HTTP redirects to unapproved internal endpoints.
          const length = Number(upstream.headers.get('content-length') || 0)
          if (length > MAX_RESPONSE_BYTES) {
            sendJson(res, 502, { error: 'MCP response exceeds size limit' })
            return
          }
          const reader = upstream.body?.getReader()
          const chunks: Uint8Array[] = []
          let size = 0
          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              size += value.length
              if (size > MAX_RESPONSE_BYTES) {
                await reader.cancel()
                sendJson(res, 502, { error: 'MCP response exceeds size limit' })
                return
              }
              chunks.push(value)
            }
          }
          const combined = new Uint8Array(size)
          let offset = 0
          for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length }
          const responseBody = new TextDecoder().decode(combined)
          sendJson(res, upstream.ok ? 200 : upstream.status, {
            ok: upstream.ok,
            status: upstream.status,
            sessionId: upstream.headers.get('mcp-session-id') || sessionId || null,
            contentType: upstream.headers.get('content-type') || '',
            body: responseBody,
          })
        } catch (err) {
          sendJson(res, 502, { error: err instanceof Error ? err.message : String(err) })
        }
      })()
    })
  })
}
