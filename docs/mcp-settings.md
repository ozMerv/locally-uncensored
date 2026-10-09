# HTTP MCP servers in LU

Browser-based HTTP MCP servers are managed in **Settings → MCP Servers**. Each
server has its own name, endpoint URL, Connect, Edit and Remove controls. Add as
many servers as you need (up to the server's approval limit). Desktop command MCP
servers retain their existing command and argument workflow.

## Local-only approval

A browser cannot arbitrarily turn LU's server into an HTTP proxy. Before using
an HTTP endpoint, the administrator must approve it using the local key:

- Configure `LU_MCP_CONFIG_TOKEN` with a long random value in a Git-ignored
  `.env` file. Never paste this key into a commit or issue.
- LU must receive this setting in its **server process environment**.
- Enter the key in the MCP Settings panel. The key remains in page memory and
  is not saved in browser storage.
- Add the server name and full HTTP(S) MCP URL; LU approves it in the server's
  private allowlist. Then use **Connect**.
- **Import previously approved MCP servers** loads existing local approvals.
- Removing a server revokes its approval when the key is supplied and no other
  configured server uses that URL.

LU stores approved endpoints outside its Git worktree. The default location is
`/etc/locally-uncensored/mcp-approved-targets.json` (private permissions).
Use `LU_MCP_CONFIG_FILE` to choose another **private** path. Existing
`LU_MCP_ALLOWED_TARGETS` values remain supported for migration, but new
approvals should use Settings.

Requests to unauthorised URLs fail closed. URL credentials, fragments and query
strings are rejected. Proxy redirects are not followed. Limits on response size
and request duration apply.

## Public Git safety

Never commit home addresses, local hostnames, machine IPs, server URLs, API
keys, tokens or environment files. Use a private local configuration file for
machine-specific settings and placeholders in public documentation.

Before publishing any feature branch, run:

```sh
./scripts/check-public-git.sh master HEAD
```

The local pre-push hook should also be enabled with:

```sh
git config core.hooksPath .githooks
```

This scanner is deliberately conservative. Passing it is not a substitute for
reviewing every changed file, commit history and Git-tracked path.

## Main Chat and Agent MCP access (local configuration)

Manage MCP connections centrally under **Settings → AI Backends → MCP Servers**.
Each server has independent **Main Chat** and **Agents** checkboxes, allowing
neither, either, or both surfaces. The same selections are available under
**General → Main Chat MCP access** and **Agent → Agent MCP access**.

New and existing servers are not assigned to Main Chat until explicitly
selected. Older configurations retain Agent access by default. The choice is
enforced in the offered tool catalogue and at tool execution time. A server
must also be connected before its tools can run.

Approved HTTP MCPs assigned to at least one surface reconnect when LU starts.
Command-based MCPs must be connected manually and are not auto-launched.

General → Main Chat tools separately controls Web, chat file creation,
image and video tools. The chat composer toggle enables or disables the
configured set. Main Chat does not receive unrestricted local file access.

These are per-browser application routing selections, not authenticated
multi-user roles or an operating-system security boundary. The server-side
approval of HTTP endpoints remains mandatory. Do not expose LU's development
server on an untrusted network.
