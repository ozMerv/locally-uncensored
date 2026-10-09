import { describe, expect, it, vi } from 'vitest'
import { needsChatWebResearch, prefetchChatWebResearch, type WebToolRunner } from '../chat-web-research'

describe('Main Chat web research preflight', () => {
  it('detects a latest-version lookup but not normal conversation', () => {
    expect(needsChatWebResearch('what is the current version of Hermes Agent and how do you install it?')).toBe(true)
    expect(needsChatWebResearch('Search the web for the Hermes Agent installation guide')).toBe(true)
    expect(needsChatWebResearch('How are you today?')).toBe(false)
    expect(needsChatWebResearch('Explain what an agent is')).toBe(false)
    expect(needsChatWebResearch('How do I set up Paperclip with an Anthropic API key and run the test-drive?')).toBe(true)
    expect(needsChatWebResearch('How do I install Hermes Agent?')).toBe(true)
    expect(needsChatWebResearch('How do I configure Open WebUI with an API key?')).toBe(true)
    expect(needsChatWebResearch('How do I install the npm package for this CLI?')).toBe(true)
    expect(needsChatWebResearch('How do I set up a birthday party?')).toBe(false)
    expect(needsChatWebResearch('How do I install a ceiling fan?')).toBe(false)
  })
  it('retrieves official search results and the best source', async () => {
    const run: WebToolRunner = vi.fn(async (name, args) => {
      if (name === 'web_search') {
        expect(args.maxResults).toBe(5)
        expect(args.query).toContain('official documentation GitHub')
        return '1. Paperclip test-drive CLI\\n   https://github.com/paperclipai/paperclip/blob/master/doc/CLI.md\\n   Official Paperclip Anthropic test-drive setup'
      }
      expect(args.url).toBe('https://github.com/paperclipai/paperclip/blob/master/doc/CLI.md')
      return 'Title: Paperclip test-drive with Anthropic API key'
    })
    const r = await prefetchChatWebResearch('How do I set up Paperclip with an Anthropic API key and run the test-drive?', run, true)
    expect(r.ok).toBe(true)
    expect(r.evidence).toContain('Paperclip test-drive')
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
