import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The server-side store is outside the git worktree. Never put machine URLs,
// credentials, or host-specific allowlists in public source files.
const DEFAULT_CONFIG_FILE = '/etc/locally-uncensored/mcp-approved-targets.json'
const MAX_TARGETS = 64

export function normaliseMcpUrl(value: string): string {
  const candidate = value.trim()
  if (candidate.length > 2048) throw new Error('MCP URL is too long')
  let parsed: URL
  try { parsed = new URL(candidate) } catch { throw new Error('Enter a valid MCP server URL') }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('MCP URL must use HTTP or HTTPS')
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MCP URL cannot contain credentials, query strings or fragments')
  }
  if (parsed.href !== candidate) {
    throw new Error('Enter a canonical MCP URL without a trailing fragment or query')
  }
  return parsed.href
}

function storePath(): string {
  return process.env.LU_MCP_CONFIG_FILE || DEFAULT_CONFIG_FILE
}

export function readApprovedMcpTargets(): string[] {
  let stored: unknown = []
  try { stored = JSON.parse(readFileSync(storePath(), 'utf8')) }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (!Array.isArray(stored) || !stored.every((s) => typeof s === 'string')) {
    throw new Error('Invalid local MCP configuration')
  }
  return stored as string[]
}

export function isMcpTargetApproved(target: string): boolean {
  const defaults = (process.env.LU_MCP_ALLOWED_TARGETS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  return defaults.includes(target) || readApprovedMcpTargets().includes(target)
}

export function verifyMcpApprovalKey(value: string): boolean {
  const configured = process.env.LU_MCP_CONFIG_TOKEN || ''
  if (configured.length < 32 || value.length < 32) return false
  const a = Buffer.from(configured)
  const b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

function writeApprovedMcpTargets(targets: string[]): void {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = path + '.' + randomUUID() + '.tmp'
  writeFileSync(temporary, JSON.stringify(targets.sort(), null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  renameSync(temporary, path)
}

export function changeApprovedMcpTarget(target: string, action: 'approve' | 'revoke'): void {
  const canonical = normaliseMcpUrl(target)
  const current = new Set(readApprovedMcpTargets())
  if (action === 'approve') {
    if (current.size >= MAX_TARGETS && !current.has(canonical)) {
      throw new Error('MCP server limit reached')
    }
    current.add(canonical)
  } else if (action === 'revoke') {
    current.delete(canonical)
  } else {
    throw new Error('Unsupported MCP approval action')
  }
  writeApprovedMcpTargets([...current])
}
