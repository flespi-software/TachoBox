import { describe, it, expect } from 'vitest'
import { splitDocuments, isUnparsed, loadJsonUrl, parseDayParam } from '../src/utils/embed.js'

const item = (uuid, content = { DF_Tachograph: {} }) => ({ uuid, name: `${uuid}.ddd`, meta: {}, content })

// fetch stand-in serving a fixed url -> json map
const server = (routes) => async (url) => {
  if (!(url in routes)) throw new Error('HTTP 404')
  return routes[url]
}

describe('jsonurl payloads', () => {
  it('splits a flespi response into single-item responses', () => {
    const docs = splitDocuments({ result: [item('a'), item('b')] })
    expect(docs).toEqual([{ result: [item('a')] }, { result: [item('b')] }])
  })

  it('treats a bare item array like a response', () => {
    expect(splitDocuments([item('a'), item('b')])).toEqual([{ result: [item('a')] }, { result: [item('b')] }])
  })

  it('passes a single legacy object through', () => {
    const card = { EF_Driver_Activity_Data: {} }
    expect(splitDocuments(card)).toEqual([card])
  })

  it('flags a listed but unparsed item', () => {
    expect(isUnparsed({ result: [{ uuid: 'x', name: 'x.ddd' }] })).toBe(true)
    expect(isUnparsed({ result: [item('a')] })).toBe(false)
  })

  it('names a single file after its url, as before', async () => {
    const docs = await loadJsonUrl('https://h/data/driver.json', server({ 'https://h/data/driver.json': { result: [item('a')] } }))
    expect(docs).toEqual([{ json: { result: [item('a')] }, name: 'driver.json' }])
  })

  it('reads a bare array of legacy per-day VU items as one file', () => {
    const day = { uuid: 'd', content: { CurrentDateTime: [1], ActivityChangeInfo: [{}] } }
    expect(splitDocuments([day, { ...day }])).toEqual([{ result: [day, { ...day }] }])
  })

  it('loads a bundle from one url, naming documents after their items', async () => {
    const docs = await loadJsonUrl('https://h/b.json', server({ 'https://h/b.json': { result: [item('a'), item('b')] } }))
    expect(docs.map((d) => d.name)).toEqual(['a.ddd', 'b.ddd'])
  })

  it('follows manifest links, relative ones against the manifest, in manifest order', async () => {
    const docs = await loadJsonUrl('https://h/set/m.json', server({
      'https://h/set/m.json': ['a.json', 'https://cdn/b.json'],
      'https://h/set/a.json': { result: [item('a')] },
      'https://cdn/b.json': [item('b1'), item('b2')],
    }))
    expect(docs.map((d) => d.json.result[0].uuid)).toEqual(['a', 'b1', 'b2'])
  })

  it('keeps loading the rest when one link fails', async () => {
    const docs = await loadJsonUrl('https://h/m.json', server({
      'https://h/m.json': ['missing.json', 'a.json'],
      'https://h/a.json': { result: [item('a')] },
    }))
    expect(docs[0]).toMatchObject({ name: 'missing.json' })
    expect(docs[0].error.message).toBe('HTTP 404')
    expect(docs[1].json.result[0].uuid).toBe('a')
  })

  it('does not follow a manifest nested in a linked document', async () => {
    const docs = await loadJsonUrl('https://h/m.json', server({
      'https://h/m.json': ['n.json'],
      'https://h/n.json': ['a.json'],
    }))
    expect(docs).toEqual([])
  })
})

describe('from/to params', () => {
  it('reads a calendar date as its UTC day', () => {
    expect(parseDayParam('2026-01-15')).toBe(Date.UTC(2026, 0, 15) / 1000)
  })

  it('floors a unix timestamp to its UTC day', () => {
    expect(parseDayParam(String(Date.UTC(2026, 0, 15, 17, 30) / 1000))).toBe(Date.UTC(2026, 0, 15) / 1000)
  })

  it('ignores absent or garbage values', () => {
    expect(parseDayParam(undefined)).toBe(null)
    expect(parseDayParam('')).toBe(null)
    expect(parseDayParam('yesterday')).toBe(null)
  })
})
