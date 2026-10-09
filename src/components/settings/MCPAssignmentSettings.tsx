import { useMCPStore } from '../../stores/mcpStore'
import { isMcpAssigned, type McpSurface } from '../../lib/mcp-surface-access'

/** Clear, surface-specific view of connections administered in AI Backends. */
export function MCPAssignmentSettings({ surface }: { surface: McpSurface }) {
  const servers = useMCPStore((s) => s.servers)
  const connected = useMCPStore((s) => s.connectedServers)
  const setServerSurfaces = useMCPStore((s) => s.setServerSurfaces)
  const isChat = surface === 'chat'

  return (
    <div className="space-y-2">
      <p className="t-micro text-gray-500">
        {isChat
          ? 'Choose which connected MCP servers ordinary Chat Tools can use. Agent permissions are independent.'
          : 'Choose which connected MCP servers Agent mode can use. Main Chat permissions are independent.'}
        {' '}Connections and endpoint approvals are managed in AI Backends → MCP Servers.
      </p>
      {servers.length === 0 && (
        <p className="t-micro text-gray-500">No MCP servers configured. Add one in AI Backends first.</p>
      )}
      {servers.map((server) => (
        <label key={server.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 cursor-pointer">
          <span className="min-w-0">
            <span className="block t-micro text-gray-300 truncate">{server.name}</span>
            <span className="block t-micro text-gray-500">
              {connected.includes(server.id) ? 'Connected' : 'Disconnected'} · {isMcpAssigned(server, surface) ? 'Selected' : 'Not selected'}
            </span>
          </span>
          <input
            type="checkbox"
            checked={isChat ? server.useInChat === true : server.useInAgent !== false}
            aria-label={`Allow ${server.name} in ${isChat ? 'Main Chat' : 'Agent mode'}`}
            onChange={(event) => setServerSurfaces(server.id,
              isChat ? { useInChat: event.target.checked } : { useInAgent: event.target.checked })}
          />
        </label>
      ))}
    </div>
  )
}
