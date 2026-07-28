// Original (unparsed) files stored in flespi device media storage. The parsed
// JSON comes from the REST API, but the raw .ddd/.v1b binary is served by UUID
// from media.flespi.io. Files that are not marked `shared` need the token, so
// the download goes through fetch + blob instead of a plain <a href>.
const MEDIA_BASE = 'https://media.flespi.io'

export async function downloadMediaFile(uuid, fileName, token) {
  const headers = {}
  if (token) headers.Authorization = `FlespiToken ${token}`
  const resp = await fetch(`${MEDIA_BASE}/${uuid}`, { headers })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const blob = await resp.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName || uuid
  a.click()
  URL.revokeObjectURL(blobUrl)
}
