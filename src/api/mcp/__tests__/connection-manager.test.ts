import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MCPServerConfig } from '../types'

const attempted = vi.hoisted(() => ({
  connections: [] as string[],
  disconnects: [] as string[],
}))

vi.mock('../external-client', () => ({
  MCPExternalClient: class {
    private server: MCPServerConfig
    constructor(server: MCPServerConfig) {
      this.server = server
    }
    async connect() {
      attempted.connections.push(this.server.id)
      return [{
        name: 'remote_' + this.server.id.replace(/-/g, '_'),
        description: 'Mock research tool',
        category: 'web',
        source: 'external',
        inputSchema: { type: 'object', properties: {}, required: [] },
      }]
    }
    async disconnect() {
      attempted.disconnects.push(this.server.id)
    }
    async callTool() { return 'ok' }
  },
}))

import { connectMcpServer, disconnectMcpServer, bootstrapApprovedHttpMcp } from '../connection-manager'
import { useMCPStore } from '../../../stores/mcpStore'
import { toolRegistry } from '../index'

const config = (id: string, overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
  id,
  name: id,
  command: 'http',
  args: ['https://example.org/mcp'],
  enabled: true,
  useInAgent: true,
  useInChat: false,
  ...overrides,
})

beforeEach(() => {
  attempted.connections.length = 0
  attempted.disconnects.length = 0
  useMCPStore.setState({ servers: [], connectedServers: [], serverTools: {} })
  vi.stubGlobal('window', {})
})
afterEach(async () => {
  for (const id of ['autotest-http', 'autotest-command', 'autotest-none', 'autotest-disabled', 'autotest-shared']) {
    await disconnectMcpServer(id)
  }
  vi.unstubAllGlobals()
})

describe('MCP connection manager', () => {
  it('registers once and disconnects tools even when Settings is unmounted', async () => {
    const server = config('autotest-shared')
    useMCPStore.getState().addServer(server)
    await connectMcpServer(server)
    await connectMcpServer(server)
    expect(attempted.connections).toEqual(['autotest-shared'])
    expect(useMCPStore.getState().connectedServers).toContain('autotest-shared')
    expect(toolRegistry.getToolByName('remote_autotest_shared')).toBeDefined()
    await disconnectMcpServer('autotest-shared')
    expect(toolRegistry.getToolByName('remote_autotest_shared')).toBeUndefined()
    expect(useMCPStore.getState().connectedServers).not.toContain('autotest-shared')
  })

  it('auto-connects only assigned HTTP servers, never command MCPs', async () => {
    useMCPStore.setState({ servers: [
      config('autotest-http', { useInChat: true, useInAgent: false }),
      config('autotest-command', { command: 'npx', args: ['dangerous-package'], useInChat: true }),
      config('autotest-none', { useInAgent: false, useInChat: false }),
      config('autotest-disabled', { enabled: false }),
    ], connectedServers: [], serverTools: {} })
    await bootstrapApprovedHttpMcp()
    expect(attempted.connections).toEqual(['autotest-http'])
    expect(useMCPStore.getState().connectedServers).toEqual(['autotest-http'])
  })

  it('does not bootstrap command servers without a browser', async () => {
    vi.unstubAllGlobals()
    useMCPStore.setState({ servers: [config('autotest-http')], connectedServers: [], serverTools: {} })
    await bootstrapApprovedHttpMcp()
    expect(attempted.connections).toEqual([])
  })
})
