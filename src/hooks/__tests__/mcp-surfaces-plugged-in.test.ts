import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = (file: string) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8')

describe('MCP access applies at both model selection and tool execution', () => {
  it('Main Chat uses enabled built-ins and Chat-assigned MCPs, not all Agent tools', () => {
    const chat = src('hooks/useChat.ts')
    expect(chat).toContain('const configured = chatToolNames(')
    expect(chat).toContain('curatedTools,')
    expect(chat).toContain('chatToolsMode: true')
    expect(chat).not.toContain('curatedTools: toolRegistry.getAll()')
  })

  it('the same surface policy is applied at discovery, prompt and execution', () => {
    const agent = src('hooks/useAgentChat.ts')
    expect(agent).toContain('toolAllowedOnSurface(')
    expect(agent).toContain("opts?.chatToolsMode ? 'chat' : 'agent'")
    expect(agent).toContain('getAll().filter((t) => toolMatchesCurated(t.name))')
    expect(agent).toContain('getTool: (name) => (toolMatchesCurated(name) ? toolRegistry.resolveExecutable(name) : undefined)')
  })

  it('AI Backends, General and Agent views let administrator assign servers by surface', () => {
    const settings = src('components/settings/SettingsPage.tsx')
    expect(settings).toContain('<MCPServerSettings />')
    expect(settings).toContain('<MCPAssignmentSettings surface="chat" />')
    expect(settings).toContain('<MCPAssignmentSettings surface="agent" />')
  })
})
