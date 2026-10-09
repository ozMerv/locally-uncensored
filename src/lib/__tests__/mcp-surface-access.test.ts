import { describe, it, expect } from 'vitest'
import type { MCPServerConfig, MCPToolDefinition } from '../../api/mcp/types'
import {
  isMcpAssigned, toolAllowedOnSurface, chatBuiltinToolNames, chatToolNames,
} from '../mcp-surface-access'

const server = (overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
  id: 'server-a', name: 'Research Server', command: 'http', args: ['https://example.org/mcp'],
  enabled: true, ...overrides,
})

const tool = (source: MCPToolDefinition['source'], serverId?: string, name = 'research_find'): MCPToolDefinition => ({
  name,
  description: 'Research',
  category: 'web',
  source,
  serverId,
  inputSchema: { type: 'object', properties: {}, required: [] },
})

describe('MCP surface separation', () => {
  it('legacy servers are agent-only until Chat access is selected', () => {
    const old = server()
    expect(isMcpAssigned(old, 'agent')).toBe(true)
    expect(isMcpAssigned(old, 'chat')).toBe(false)
  })

  it('allows independent Chat and Agent selections', () => {
    const chatOnly = server({ useInChat: true, useInAgent: false })
    const agentOnly = server({ useInChat: false, useInAgent: true })
    expect(isMcpAssigned(chatOnly, 'chat')).toBe(true)
    expect(isMcpAssigned(chatOnly, 'agent')).toBe(false)
    expect(isMcpAssigned(agentOnly, 'chat')).toBe(false)
    expect(isMcpAssigned(agentOnly, 'agent')).toBe(true)
  })

  it('requires connection and assignment; disabled servers cannot run', () => {
    const external = tool('external', 'server-a')
    expect(toolAllowedOnSurface(external, [server({ useInChat: true })], [], 'chat')).toBe(false)
    expect(toolAllowedOnSurface(external, [server({ useInChat: true, enabled: false })], ['server-a'], 'chat')).toBe(false)
    expect(toolAllowedOnSurface(external, [server({ useInChat: true })], ['server-a'], 'chat')).toBe(true)
    expect(toolAllowedOnSurface(external, [server({ useInAgent: false })], ['server-a'], 'agent')).toBe(false)
  })

  it('refuses orphaned external tools, but does not alter built-in permissions', () => {
    expect(toolAllowedOnSurface(tool('external', 'unknown'), [server({ useInChat: true })], ['server-a'], 'chat')).toBe(false)
    expect(toolAllowedOnSurface(tool('external'), [server({ useInChat: true })], ['server-a'], 'chat')).toBe(false)
    expect(toolAllowedOnSurface(tool('builtin', undefined, 'web_search'), [], [], 'chat')).toBe(true)
  })

  it('Main Chat never gains Agent-only tools from the MCP registry', () => {
    const all = [
      tool('builtin', undefined, 'web_search'),
      tool('builtin', undefined, 'shell_execute'),
      tool('external', 'server-a', 'research_find'),
      tool('external', 'server-b', 'hidden_agent_tool'),
    ]
    const permitted = chatToolNames(
      { chatToolWebEnabled: true, chatToolFilesEnabled: false, chatToolImageEnabled: false, chatToolVideoEnabled: false },
      all, [server({ useInChat: true }), { ...server(), id: 'server-b', useInAgent: true, useInChat: false }],
      ['server-a', 'server-b'],
    )
    expect(permitted).toEqual(['web_search', 'web_fetch', 'research_find'])
    expect(permitted).not.toContain('shell_execute')
    expect(permitted).not.toContain('hidden_agent_tool')
  })

  it('built-in tool categories can each be disabled without changing Agents', () => {
    expect(chatBuiltinToolNames({})).toEqual([
      'web_search','web_fetch','file_write','image_generate','video_generate',
    ])
    expect(chatBuiltinToolNames({
      chatToolWebEnabled: false, chatToolFilesEnabled: true,
      chatToolImageEnabled: false, chatToolVideoEnabled: true,
    })).toEqual(['file_write', 'video_generate'])
  })

  it('keeps all tools off if all Main Chat categories are disabled and no MCP assigned', () => {
    const selected = chatToolNames({
      chatToolWebEnabled: false, chatToolFilesEnabled: false,
      chatToolImageEnabled: false, chatToolVideoEnabled: false,
    }, [tool('external', 'server-a')], [server()], ['server-a'])
    expect(selected).toEqual([])
  })
})
