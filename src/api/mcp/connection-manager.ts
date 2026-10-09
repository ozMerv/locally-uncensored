import type { MCPServerConfig, MCPToolDefinition } from './types'
import type { MCPExternalClient } from './external-client'
import { toolRegistry } from './index'
import { useMCPStore } from '../../stores/mcpStore'
import { isMcpAssigned } from '../../lib/mcp-surface-access'

// Connection lifecycle is global, not tied to the Settings panel being mounted.
// No command-based MCP executable is automatically started at application boot.
const clients = new Map<string, MCPExternalClient>()
const connecting = new Map<string, Promise<MCPToolDefinition[]>>()

function clearConnection(id: string): void {
  toolRegistry.unregisterServer(id)
  const store = useMCPStore.getState()
  store.setConnected(id, false)
  store.clearServerTools(id)
  clients.delete(id)
}

export async function connectMcpServer(server: MCPServerConfig): Promise<MCPToolDefinition[]> {
  const pending = connecting.get(server.id)
  if (pending) return pending
  if (clients.has(server.id)) return useMCPStore.getState().serverTools[server.id] ?? []
  if (server.enabled === false) throw new Error('This MCP server is disabled')

  const run = (async () => {
    const { MCPExternalClient } = await import('./external-client')
    const client = new MCPExternalClient(server, {
      onExit: (id) => clearConnection(id),
    })
    try {
      const tools = await client.connect()
      // The user might remove or disable a server during the handshake.
      const current = useMCPStore.getState().servers.find((s) => s.id === server.id)
      if (!current || current.enabled === false) {
        await client.disconnect()
        throw new Error('MCP server was disabled or removed while connecting')
      }
      clients.set(server.id, client)
      const state = useMCPStore.getState()
      state.setConnected(server.id, true)
      state.setServerTools(server.id, tools)
      toolRegistry.registerExternal(
        server.id, tools, async (toolName, args) => client.callTool(toolName, args),
      )
      return tools
    } catch (error) {
      clearConnection(server.id)
      throw error
    }
  })()

  connecting.set(server.id, run)
  try { return await run }
  finally { connecting.delete(server.id) }
}

export async function disconnectMcpServer(id: string): Promise<void> {
  // If the handshake has started, let it finish before disconnecting it.
  const pending = connecting.get(id)
  if (pending) {
    try { await pending } catch { /* failed handshake leaves nothing connected */ }
  }
  const client = clients.get(id)
  try { if (client) await client.disconnect() }
  finally { clearConnection(id) }
}

/** Auto-connect only approved HTTP servers which an admin assigned to a mode.
 * Commands such as npx/uvx are never run without a manual Connect click. */
export async function bootstrapApprovedHttpMcp(): Promise<void> {
  if (typeof window === 'undefined') return
  // Persisted browser state is usually hydrated synchronously at import.
  // Do not overwrite servers already loaded/added by the user mid-session.
  if (!useMCPStore.persist.hasHydrated() && useMCPStore.getState().servers.length === 0) {
    await useMCPStore.persist.rehydrate()
  }
  const servers = useMCPStore.getState().servers.filter((server) =>
    server.command.toLowerCase() === 'http' &&
    (isMcpAssigned(server, 'chat') || isMcpAssigned(server, 'agent')),
  )
  await Promise.allSettled(servers.map((server) => connectMcpServer(server)))
}
