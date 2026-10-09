import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Power, PowerOff, Pencil } from 'lucide-react'
import { useMCPStore } from '../../stores/mcpStore'
import { toolRegistry } from '../../api/mcp'
import type { MCPServerConfig } from '../../api/mcp/types'
// `import type` und nicht `import`: die Klasse wird unten bewusst dynamisch
// geladen, damit der Tauri-Import im Dev-Modus nicht mitkommt. Ein Typ-Import
// wird beim Uebersetzen geloescht und erzeugt keine Laufzeit-Abhaengigkeit —
// er kostet also nichts und deckt dafuer `client.disconnect()` mit ab, das
// unter `any` ungeprueft war.
import type { MCPExternalClient } from '../../api/mcp/external-client'

// Active client instances (lazy-loaded to avoid Tauri import in dev mode)
const clients = new Map<string, MCPExternalClient>()

export function MCPServerSettings() {
  const { servers, connectedServers, serverTools, addServer, updateServer, removeServer, setConnected, setServerTools, clearServerTools } = useMCPStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add form state. `editingId` entscheidet, ob Speichern anlegt oder aendert.
  const [formName, setFormName] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [formArgs, setFormArgs] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  // Approval key lives in component memory only. It is never persisted in
  // browser storage, bundled into the app, or sent to Git.
  const [approvalKey, setApprovalKey] = useState('')
  const [formMode, setFormMode] = useState<'http' | 'command'>('http')
  const [formUrl, setFormUrl] = useState('')

  const changeMcpApproval = async (url: string, action: 'approve' | 'revoke') => {
    const response = await fetch('/local-api/mcp-http/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-locally-uncensored': 'true',
        'x-lu-mcp-approval-key': approvalKey,
      },
      body: JSON.stringify({ target: url, action }),
    })
    const result = await response.json() as { error?: string }
    if (!response.ok) throw new Error(result.error || 'MCP approval failed')
  }


  const closeForm = () => {
    setFormName('')
    setFormCommand('')
    setFormArgs('')
    setFormUrl('')
    setFormMode('http')
    setEditingId(null)
    setShowAddForm(false)
  }

  /**
   * Einen bestehenden Eintrag zum Bearbeiten oeffnen.
   *
   * Bis 2.6.8 gab es das nicht, und die Meldung fuer einen nicht startbaren
   * Befehl riet trotzdem dazu, den Befehl zu aendern. Ein Tester ist am
   * 05.09.2026 darueber gestolpert: die Zeile trug nur Verbinden und
   * Entfernen, wer sich vertippt hatte, musste loeschen und alles neu
   * eintippen. `updateServer` lag im Store bereits fertig und getestet und
   * wurde von nirgends gerufen.
   */
  const handleEdit = (server: MCPServerConfig) => {
    setEditingId(server.id)
    setFormName(server.name)
    setFormCommand(server.command)
    setFormArgs(server.command.toLowerCase() === 'http' ? '' : server.args.join(' '))
    setFormMode(server.command.toLowerCase() === 'http' ? 'http' : 'command')
    setFormUrl(server.command.toLowerCase() === 'http' ? server.args[0] || '' : '')
    setError(null)
    setShowAddForm(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    const isHttp = formMode === 'http'
    if (isHttp && !formUrl.trim()) return
    if (!isHttp && !formCommand.trim()) return
    setError(null)

    const fields = {
      name: formName.trim(),
      command: isHttp ? 'http' : formCommand.trim(),
      args: isHttp ? [formUrl.trim()] : (formArgs.trim() ? formArgs.trim().split(' ') : []),
    }
    if (isHttp) {
      try {
        const url = new URL(fields.args[0])
        if (!['http:', 'https:'].includes(url.protocol) ||
          url.username || url.password || url.search || url.hash) {
          throw new Error('Enter an HTTP(S) MCP endpoint URL without credentials or query parameters')
        }
        if (!approvalKey.trim()) {
          throw new Error('Enter your local MCP approval key to authorise this server')
        }
        await changeMcpApproval(fields.args[0], 'approve')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return
      }
    }
    if (editingId) {
      if (connectedServers.includes(editingId)) await handleDisconnect(editingId)
      updateServer(editingId, fields)
    } else {
      addServer({ id: uuid(), ...fields, enabled: true })
    }
    closeForm()
  }

  const handleImportApproved = async () => {
    if (!approvalKey.trim()) {
      setError('Enter your local approval key to import approved servers')
      return
    }
    setError(null)
    try {
      const response = await fetch('/local-api/mcp-http/approved', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-locally-uncensored': 'true',
          'x-lu-mcp-approval-key': approvalKey,
        },
        body: '{}',
      })
      const body = await response.json() as { error?: string; targets?: string[] }
      if (!response.ok) throw new Error(body.error || 'Failed to read local MCP approvals')
      for (const [index, url] of (body.targets || []).entries()) {
        if (!servers.some((server) => server.command.toLowerCase() === 'http' && server.args[0] === url)) {
          addServer({
            id: uuid(),
            name: `Approved MCP ${index + 1}`,
            command: 'http',
            args: [url],
            enabled: true,
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleConnect = async (server: MCPServerConfig) => {
    setConnecting(server.id)
    setError(null)
    try {
      const { MCPExternalClient } = await import('../../api/mcp/external-client')
      // A server process can die on its own (crash, OOM kill, a bad config it
      // quits on). Before this the panel stayed green and its tools stayed in
      // the registry, so the model kept being offered a terminal that was not
      // there and every call failed with "Not connected" until the app closed.
      const client = new MCPExternalClient(server, {
        onExit: (id) => {
          toolRegistry.unregisterServer(id)
          setConnected(id, false)
          clearServerTools(id)
          clients.delete(id)
        },
      })
      const tools = await client.connect()
      clients.set(server.id, client)
      setConnected(server.id, true)
      setServerTools(server.id, tools)
      // Register tools with the global registry. The two-arg executor
      // contract lets the registry bind each tool's name into its own
      // closure — previously a single-arg hack tried to smuggle the name
      // via `args.__toolName`, which was never populated, so MCP calls
      // silently dispatched with an empty tool name and failed.
      toolRegistry.registerExternal(
        server.id,
        tools,
        async (toolName, args) => client.callTool(toolName, args)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (id: string) => {
    const client = clients.get(id)
    if (client) {
      await client.disconnect()
      clients.delete(id)
    }
    toolRegistry.unregisterServer(id)
    setConnected(id, false)
    clearServerTools(id)
  }

  const handleRemove = async (id: string) => {
    const server = servers.find((s) => s.id === id)
    if (server?.command.toLowerCase() === 'http' && approvalKey.trim() &&
      !servers.some((s) => s.id !== id && s.command.toLowerCase() === 'http' && s.args[0] === server.args[0])) {
      try { await changeMcpApproval(server.args[0], 'revoke') }
      catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return
      }
    }
    await handleDisconnect(id)
    removeServer(id)
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.6rem] text-gray-500">
        Add any number of MCP servers. HTTP MCP servers can be authorised here
        with the local approval key. Each server has separate Connect, Edit and Remove controls.
      </p>
      <div className="space-y-1">
        <label className="block text-[0.6rem] text-gray-400" htmlFor="lu-mcp-approval-key">
          Local MCP approval key (never saved in the browser)
        </label>
        <input
          id="lu-mcp-approval-key"
          value={approvalKey}
          onChange={(e) => setApprovalKey(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="LU_MCP_CONFIG_TOKEN from CT213 local .env"
          className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[0.65rem] text-gray-300 placeholder-gray-600 focus:border-white/20 outline-none"
        />
      </div>

      <button
        type="button"
        onClick={handleImportApproved}
        className="w-full px-3 py-1.5 rounded-lg text-[0.65rem] text-gray-300 bg-white/[0.03] hover:bg-white/5 border border-white/10"
      >
        Import previously approved MCP servers
      </button>

      {/* Server List */}
      {servers.map((server) => {
        const isConnected = connectedServers.includes(server.id)
        const tools = serverTools[server.id] || []
        const isLoading = connecting === server.id

        return (
          <div
            key={server.id}
            className={`px-3 py-2 rounded-lg border transition-colors ${
              isConnected
                ? 'bg-green-500/[0.03] border-green-500/20'
                : 'bg-white/[0.02] border-white/[0.06]'
            }`}
          >
            <div className="flex items-center gap-2">
              {/* Status dot */}
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isConnected ? 'bg-green-500' : 'bg-gray-600'
              }`} />

              {/* Name + command */}
              <div className="flex-1 min-w-0">
                <p className="text-[0.7rem] text-gray-300 font-medium">{server.name}</p>
                <p className="text-[0.55rem] text-gray-600 font-mono truncate">
                  {server.command} {server.args.join(' ')}
                </p>
              </div>

              {/* Tools count */}
              {isConnected && tools.length > 0 && (
                <span className="text-[0.55rem] text-green-400 font-medium">
                  {tools.length} tools
                </span>
              )}

              {/* Connect/Disconnect */}
              <button
                onClick={() => isConnected ? handleDisconnect(server.id) : handleConnect(server)}
                disabled={isLoading}
                className={`p-1 rounded transition-colors ${
                  isConnected
                    ? 'text-green-400 hover:text-red-400 hover:bg-red-500/10'
                    : 'text-gray-500 hover:text-green-400 hover:bg-green-500/10'
                }`}
                title={isConnected ? 'Disconnect' : 'Connect'}
              >
                {isLoading ? (
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : isConnected ? (
                  <PowerOff size={12} />
                ) : (
                  <Power size={12} />
                )}
              </button>

              {/* Edit */}
              <button
                onClick={() => handleEdit(server)}
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                title="Edit server"
              >
                <Pencil size={11} />
              </button>

              {/* Remove */}
              <button
                onClick={() => handleRemove(server.id)}
                className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remove server"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* Expanded tool list */}
            {isConnected && tools.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-white/5 space-y-0.5">
                {tools.map((t) => (
                  <div key={t.name} className="flex items-center gap-1.5">
                    <span className="text-[0.55rem] text-gray-500 font-mono">{t.name}</span>
                    <span className="text-[0.5rem] text-gray-600 truncate">{t.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Error */}
      {error && (
        <p className="text-[0.6rem] text-red-400 px-2">{error}</p>
      )}

      {/* Add Server Form */}
      {showAddForm ? (
        <div className="space-y-2 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Server name"
            className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[0.65rem] text-gray-300 placeholder-gray-600 focus:border-white/20 outline-none"
          />
          <select
            value={formMode}
            onChange={(e) => setFormMode(e.target.value === 'command' ? 'command' : 'http')}
            className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[0.65rem] text-gray-300"
          >
            <option value="http">HTTP MCP server (browser)</option>
            <option value="command">Command MCP server (desktop)</option>
          </select>
          {formMode === 'http' ? (
            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="MCP endpoint URL, e.g. https://mcp.example.org/mcp"
              className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[0.65rem] text-gray-300 placeholder-gray-600 font-mono focus:border-white/20 outline-none"
            />
          ) : (
            <>
              <input
                value={formCommand}
                onChange={(e) => setFormCommand(e.target.value)}
                placeholder="Command (e.g. npx or uvx)"
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[0.65rem] text-gray-300 placeholder-gray-600 font-mono focus:border-white/20 outline-none"
              />
              <input
                value={formArgs}
                onChange={(e) => setFormArgs(e.target.value)}
                placeholder="Arguments (space separated)"
                className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-[0.65rem] text-gray-300 placeholder-gray-600 font-mono focus:border-white/20 outline-none"
              />
            </>
          )}
          <p className="text-[0.55rem] text-gray-500">
            HTTP endpoints are approved server-side and stored outside Git.
            Removing a server also revokes its approval if the key is provided.
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={handleSave}
              disabled={!formName.trim() || (formMode === 'http' ? !formUrl.trim() : !formCommand.trim())}
              className="px-3 py-1 rounded text-[0.6rem] font-medium bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/25 disabled:opacity-40 transition-colors"
            >
              {editingId ? 'Save Changes' : 'Add Server'}
            </button>
            <button
              onClick={closeForm}
              className="px-3 py-1 rounded text-[0.6rem] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.65rem] text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/5 border border-white/10 hover:border-white/20 transition-colors w-full justify-center"
        >
          <Plus size={12} />
          Add MCP Server
        </button>
      )}
    </div>
  )
}
