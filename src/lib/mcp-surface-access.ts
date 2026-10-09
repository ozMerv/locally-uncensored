import type { MCPServerConfig, MCPToolDefinition } from '../api/mcp/types'

export type McpSurface = 'chat' | 'agent'

/** Existing servers remain available in Agent mode. Main Chat is opt-in. */
export function isMcpAssigned(server: MCPServerConfig, surface: McpSurface): boolean {
  if (server.enabled === false) return false
  return surface === 'chat' ? server.useInChat === true : server.useInAgent !== false
}

/**
 * A tool must belong to an actively connected, explicitly assigned MCP.
 * Built-in tools are controlled separately by the existing tool permissions.
 */
export function toolAllowedOnSurface(
  tool: MCPToolDefinition,
  servers: readonly MCPServerConfig[],
  connected: readonly string[],
  surface: McpSurface,
): boolean {
  if (tool.source !== 'external') return true
  if (!tool.serverId || !connected.includes(tool.serverId)) return false
  const owner = servers.find((server) => server.id === tool.serverId)
  return !!owner && isMcpAssigned(owner, surface)
}

export const CHAT_TOOL_CATEGORIES = {
  web: ['web_search', 'web_fetch'],
  files: ['file_write'],
  image: ['image_generate'],
  video: ['video_generate'],
} as const

export interface ChatToolSwitches {
  chatToolWebEnabled?: boolean
  chatToolFilesEnabled?: boolean
  chatToolImageEnabled?: boolean
  chatToolVideoEnabled?: boolean
}

/** Absent fields in old saved settings retain the previous enabled defaults. */
export function chatBuiltinToolNames(settings: ChatToolSwitches): string[] {
  return [
    ...(settings.chatToolWebEnabled !== false ? CHAT_TOOL_CATEGORIES.web : []),
    ...(settings.chatToolFilesEnabled !== false ? CHAT_TOOL_CATEGORIES.files : []),
    ...(settings.chatToolImageEnabled !== false ? CHAT_TOOL_CATEGORIES.image : []),
    ...(settings.chatToolVideoEnabled !== false ? CHAT_TOOL_CATEGORIES.video : []),
  ]
}

/** Adding an MCP to Chat does not enable any unsafe built-in file operations. */
export function chatToolNames(
  settings: ChatToolSwitches,
  allTools: readonly MCPToolDefinition[],
  servers: readonly MCPServerConfig[],
  connected: readonly string[],
): string[] {
  return [
    ...chatBuiltinToolNames(settings),
    ...allTools
      .filter((tool) => tool.source === 'external' && toolAllowedOnSurface(tool, servers, connected, 'chat'))
      .map((tool) => tool.name),
  ]
}
