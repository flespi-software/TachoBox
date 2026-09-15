// URL-parameter helpers for embedding: ?jsonurl= payloads and ?from= / ?to=.

import { splitResponse, isMediaItem } from './ddd.js'

// A payload is reduced to single-file documents (see splitResponse). On top of
// a media response or a single item it may be an array: of items (a response
// without its wrapper), or mixing responses and links - a manifest
// ["a.json", "https://host/b.json"]. Links come back as strings for
// loadJsonUrl() to fetch.
export function splitDocuments(json) {
  if (!Array.isArray(json)) return splitResponse(json)
  if (!json.length) return [json]
  if (json.every(isMediaItem)) return splitResponse({ result: json })
  return json.flatMap((el) => (typeof el === 'string' ? [el] : splitResponse(el)))
}

// An item the parser has not processed yet: listed, but without content
export function isUnparsed(doc) {
  const item = doc?.result?.[0]
  return !!item && !item.content
}

function baseName(url) {
  return new URL(url).pathname.split('/').pop() || 'remote.json'
}

function docName(doc, url) {
  const item = doc?.result?.[0]
  return item?.name || item?.uuid || baseName(url)
}

async function fetchJson(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

// Loads a ?jsonurl= payload, following manifest links in parallel (relative ones
// resolve against the manifest url). A linked document may be a response or an
// item array, not another manifest. Returns [{ json, name }] in payload order;
// a link that failed is { error, name } so the rest still loads.
export async function loadJsonUrl(url, fetchFn = fetchJson) {
  const root = new URL(url, globalThis.location?.href).href
  const docs = splitDocuments(await fetchFn(root))
  // A single file keeps the name it always had: the last segment of the url
  if (docs.length === 1 && typeof docs[0] !== 'string') {
    return [{ json: docs[0], name: url.split('/').pop() || 'remote.json' }]
  }
  const settled = await Promise.allSettled(docs.map(async (doc) => {
    if (typeof doc !== 'string') return [{ json: doc, name: docName(doc, root) }]
    const link = new URL(doc, root).href
    return splitDocuments(await fetchFn(link))
      .filter((d) => typeof d !== 'string')
      .map((d) => ({ json: d, name: docName(d, link) }))
  }))
  return settled.flatMap((res, i) => (res.status === 'fulfilled'
    ? res.value
    : [{ error: res.reason, name: baseName(new URL(docs[i], root).href) }]))
}

// Several ?jsonurl= params (?jsonurl=a&jsonurl=b), loaded in parallel. One url
// behaves exactly as loadJsonUrl(); with more, a url that fails becomes an
// { error, name } entry instead of failing the rest.
export async function loadJsonUrls(urls, fetchFn = fetchJson) {
  const list = [].concat(urls).filter(Boolean)
  if (list.length === 1) return loadJsonUrl(list[0], fetchFn)
  const settled = await Promise.allSettled(list.map((url) => loadJsonUrl(url, fetchFn)))
  return settled.flatMap((res, i) => (res.status === 'fulfilled'
    ? res.value
    : [{ error: res.reason, name: list[i].split('/').pop() || list[i] }]))
}

// fileUuid route param: one uuid or a comma-separated list, duplicates dropped
export function parseUuidList(param) {
  return [...new Set(String(param || '').split(',').map((s) => s.trim()).filter(Boolean))]
}

// ?from= / ?to= value: unix seconds or YYYY-MM-DD, floored to the UTC day the
// date range filter works in. Null when absent or unparseable.
export function parseDayParam(value) {
  if (value == null || value === '') return null
  const str = String(value)
  const ts = /^\d{4}-\d{2}-\d{2}$/.test(str) ? Date.parse(str) / 1000 : Number(str)
  if (!Number.isFinite(ts) || ts <= 0) return null
  return ts - (ts % 86400)
}
