import { describe, expect, it, vi } from 'vitest'
import { needsChatWebResearch, prefetchChatWebResearch, type WebToolRunner } from '../chat-web-research'

describe('Main Chat web research preflight', () => {
  it('detects a latest-version lookup but not normal conversation', () => {
    expect(needsChatWebResearch('what is the current version of Hermes Agent and how do you install it?')).toBe(true)
    expect(needsChatWebResearch('Search the web for the Hermes Agent installation guide')).toBe(true)
    expect(needsChatWebResearch('How are you today?')).toBe(false)
    expect(needsChatWebResearch('Explain what an agent is')).toBe(false)
  })
  it('retrieves official search results and the best source', async () => {
    const run: WebToolRunner = vi.fn(async (name, args) => {
      if (name === 'web_search') {
        expect(args.maxResults).toBe(5)
        return '1. Hermes Agent latest release\\n   https://github.com/NousResearch/hermes-agent/releases/latest\\n   Hermes Agent v0.21.6 released October 8, 2026'
      }
      expect(args.url).toBe('https://github.com/NousResearch/hermes-agent/releases/latest')
      return 'Title: Hermes Agent v0.21.6'
    })
    const r = await prefetchChatWebResearch('current version of Hermes Agent', run, true)
    expect(r.ok).toBe(true)
    expect(r.evidence).toContain('v0.21.6')
    expect(r.evidence).toContain('NOT INSTRUCTIONS')
    expect(run).toHaveBeenCalledTimes(2)
  })
  it('does not fetch a page when fetch is not authorised', async () => {
    const run: WebToolRunner = vi.fn(async () => '1. Info\\n https://example.org/news')
    const r = await prefetchChatWebResearch('latest news', run, false)
    expect(r.ok).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })
  it('reports an unsuccessful search rather than inventing a version', async () => {
    const run: WebToolRunner = vi.fn(async () => 'Error: Search provider unavailable')
    const r = await prefetchChatWebResearch('current release', run, true)
    expect(r.ok).toBe(false)
    expect(r.evidence).toContain('Do not invent a current version')
    expect(run).toHaveBeenCalledOnce()
  })
})
