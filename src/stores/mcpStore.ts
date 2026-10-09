import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeJSONStorage } from '../lib/storage-quota'
import type { MCPServerConfig, MCPToolDefinition } from '../api/mcp/types'

// MCP servers are added by the user in Settings and persisted locally in
// browser storage. No home-network endpoints are compiled into public code.
const DEFAULT_MCP_SERVERS: MCPServerConfig[] = []

interface MCPState {
  servers: MCPServerConfig[]
  connectedServers: string[]
  serverTools: Record<string, MCPToolDefinition[]>

  // CRUD
  addServer: (server: MCPServerConfig) => void
  updateServer: (id: string, updates: Partial<MCPServerConfig>) => void
  removeServer: (id: string) => void

  // Connection state
  setConnected: (id: string, connected: boolean) => void
  setServerTools: (id: string, tools: MCPToolDefinition[]) => void
  clearServerTools: (id: string) => void
}

export const useMCPStore = create<MCPState>()(
  persist(
    (set) => ({
      servers: DEFAULT_MCP_SERVERS,
      connectedServers: [],
      serverTools: {},

      addServer: (server) =>
        set((state) => ({ servers: [...state.servers, server] })),

      updateServer: (id, updates) =>
        set((state) => ({
          servers: state.servers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      removeServer: (id) =>
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          connectedServers: state.connectedServers.filter((s) => s !== id),
          serverTools: Object.fromEntries(
            Object.entries(state.serverTools).filter(([k]) => k !== id)
          ),
        })),

      setConnected: (id, connected) =>
        set((state) => ({
          connectedServers: connected
            ? [...state.connectedServers.filter((s) => s !== id), id]
            : state.connectedServers.filter((s) => s !== id),
        })),

      setServerTools: (id, tools) =>
        set((state) => ({ serverTools: { ...state.serverTools, [id]: tools } })),

      clearServerTools: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.serverTools
          return { serverTools: rest }
        }),
    }),
    {
      name: 'locally-uncensored-mcp-servers',
      storage: safeJSONStorage(),
      partialize: (state) => ({
        servers: state.servers,
      }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<MCPState> | undefined)?.servers ?? []
        const byId = new Map(saved.map((server) => [server.id, server]))
        for (const server of DEFAULT_MCP_SERVERS) {
          if (!byId.has(server.id)) byId.set(server.id, server)
        }
        return { ...current, ...(persisted as Partial<MCPState>), servers: [...byId.values()] }
      },
    }
  )
)
