import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  changeApprovedMcpTarget,
  isMcpTargetApproved,
  normaliseMcpUrl,
  readApprovedMcpTargets,
  verifyMcpApprovalKey,
} from '../mcp-http-targets'

const KEY = 'a'.repeat(64)
const URL_A = 'https://mcp.example.org/service-a'
const URL_B = 'https://mcp.example.org/service-b'
const saved = {
  LU_MCP_CONFIG_FILE: process.env.LU_MCP_CONFIG_FILE,
  LU_MCP_ALLOWED_TARGETS: process.env.LU_MCP_ALLOWED_TARGETS,
  LU_MCP_CONFIG_TOKEN: process.env.LU_MCP_CONFIG_TOKEN,
}
let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lu-mcp-settings-test-'))
  process.env.LU_MCP_CONFIG_FILE = join(dir, 'approved.json')
  process.env.LU_MCP_ALLOWED_TARGETS = ''
  process.env.LU_MCP_CONFIG_TOKEN = KEY
})
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('local-only HTTP MCP approval', () => {
  it('starts with no approved targets', () => {
    expect(readApprovedMcpTargets()).toEqual([])
    expect(isMcpTargetApproved(URL_A)).toBe(false)
  })

  it('authorises multiple URLs and persists them outside the working tree', () => {
    changeApprovedMcpTarget(URL_A, 'approve')
    changeApprovedMcpTarget(URL_B, 'approve')
    expect(isMcpTargetApproved(URL_A)).toBe(true)
    expect(isMcpTargetApproved(URL_B)).toBe(true)
    expect(JSON.parse(readFileSync(process.env.LU_MCP_CONFIG_FILE!, 'utf8'))).toHaveLength(2)
  })

  it('revokes only the selected endpoint', () => {
    changeApprovedMcpTarget(URL_A, 'approve')
    changeApprovedMcpTarget(URL_B, 'approve')
    changeApprovedMcpTarget(URL_A, 'revoke')
    expect(isMcpTargetApproved(URL_A)).toBe(false)
    expect(isMcpTargetApproved(URL_B)).toBe(true)
  })

  it('rejects invalid protocols and embedded secrets', () => {
    expect(() => normaliseMcpUrl('file:///etc/passwd')).toThrow()
    expect(() => normaliseMcpUrl('https://user:pass@mcp.example.org/mcp')).toThrow()
    expect(() => normaliseMcpUrl('https://mcp.example.org/mcp?token=secret')).toThrow()
  })

  it('accepts only the complete local administrator key', () => {
    expect(verifyMcpApprovalKey(KEY)).toBe(true)
    expect(verifyMcpApprovalKey('wrong')).toBe(false)
    expect(verifyMcpApprovalKey('a'.repeat(63))).toBe(false)
  })
})
