/**
 * 社区增强版 · 背景换图
 *
 * 用户上传的背景图优先，内置宫殿图兜底；按亮/暗主题分槽存储。
 * 图片本体进 IndexedDB（可能很大），设置（铺法）进 localStorage。
 * 铺法通过 `--maid-palace-size` 变量交给 CSS，舞台规则见 module.css 的社区补丁。
 */

/** IndexedDB 库与对象仓库。 */
const BACKDROP_DB_NAME = 'maid-atelier-backdrops'
const BACKDROP_STORE = 'backdrops'

/** localStorage 键（保存铺法）。 */
export const BACKDROP_SETTINGS_KEY = 'maid-atelier.backdrop'

/**
 * 皮肤自己记住的日夜选择（'light' | 'dark'）。
 * 宿主若重置主题，本模块会在启动时重新应用，保证用户的「白天/夜晚」两个
 * 背景槽位不会因为宿主行为而错位。
 */
export const THEME_OVERRIDE_KEY = 'maid-atelier.theme-override'

export type BackdropMode = 'fill' | 'cover' | 'contain'

/** CSS background-size 取值。 */
export const BACKDROP_SIZE: Record<BackdropMode, string> = {
  fill: '100% 100%',
  cover: 'cover',
  contain: 'contain',
}

export type BackdropKind = 'day' | 'night'

/** 内置宫殿图的画质版本。 */
export type BackdropPalette = 'upstream' | 'classic'

/** 内置图选项：上游轻量版 / 原魔改经典版。 */
export const BACKDROP_PALETTES: ReadonlyArray<readonly [BackdropPalette, string, string]> = [
  ['upstream', '上游版', '上游重编码，体积小'],
  ['classic', '经典版', '原魔改版，画质更高'],
]

/**
 * 模块级共享状态：syncBackdrop 在 index.ts 里读取它决定用哪张图、哪种铺法。
 * 上传、清除、主题切换后都要通知 index.ts 重绘。
 */
export const MAID_BACKDROP_STATE: {
  dayUrl: string | null
  nightUrl: string | null
  dayMode: BackdropMode
  nightMode: BackdropMode
  palette: BackdropPalette
  /**
   * 来源选择：true = 优先用用户上传的图，false = 强制用内置图。
   * 切换内置图版本时置 false，让「经典 / 上游」立刻可见；
   * 重新上传或点「我的图」时置回 true。
   */
  useUploaded: boolean
  /**
   * 背景槽位：皮肤自己记住用白天还是夜晚的那套图。
   *
   * 不直接依赖 body 的主题属性——宿主会在启动后把主题写回它自己的
   * 持久化值，导致背景槽位跟着跳。槽位独立持久化，刷新后才能稳定不变。
   */
  slot: BackdropKind
} = {
  dayUrl: null,
  nightUrl: null,
  dayMode: 'cover',
  nightMode: 'cover',
  palette: 'upstream',
  useUploaded: true,
  slot: 'day',
}

function isBackdropMode(value: unknown): value is BackdropMode {
  return value === 'fill' || value === 'cover' || value === 'contain'
}

function isBackdropPalette(value: unknown): value is BackdropPalette {
  return value === 'upstream' || value === 'classic'
}

/** 从 localStorage 读取铺法与内置图版本；缺失或损坏时回退默认。 */
export function loadBackdropSettings(): void {
  try {
    const raw = localStorage.getItem(BACKDROP_SETTINGS_KEY)
    if (raw === null) return
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return
    const record = parsed as Record<string, unknown>
    if (isBackdropMode(record.dayMode)) MAID_BACKDROP_STATE.dayMode = record.dayMode
    if (isBackdropMode(record.nightMode)) MAID_BACKDROP_STATE.nightMode = record.nightMode
    if (isBackdropPalette(record.palette)) MAID_BACKDROP_STATE.palette = record.palette
    if (typeof record.useUploaded === 'boolean') MAID_BACKDROP_STATE.useUploaded = record.useUploaded
    if (record.slot === 'day' || record.slot === 'night') MAID_BACKDROP_STATE.slot = record.slot
  } catch {
    // 损坏数据整体回退默认值。
  }
}

/** 记住「用上传图还是内置图」，刷新后不丢。 */
function persistSource(useUploaded: boolean): void {
  try {
    const raw = localStorage.getItem(BACKDROP_SETTINGS_KEY)
    const record: Record<string, unknown> = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>)
    record.useUploaded = useUploaded
    localStorage.setItem(BACKDROP_SETTINGS_KEY, JSON.stringify(record))
  } catch {
    // 存储失败不影响当前会话。
  }
}

/** 切换内置宫殿图版本（上游轻量 / 经典高清）。 */
export function saveBackdropPalette(palette: BackdropPalette): void {
  MAID_BACKDROP_STATE.palette = palette
  // 选内置图 = 立刻看内置图；上传的图保留，随时可切回。
  MAID_BACKDROP_STATE.useUploaded = false
  persistSource(false)
  try {
    const raw = localStorage.getItem(BACKDROP_SETTINGS_KEY)
    const record: Record<string, unknown> = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>)
    record.palette = palette
    localStorage.setItem(BACKDROP_SETTINGS_KEY, JSON.stringify(record))
  } catch {
    // 存储失败不影响当前会话内的显示。
  }
}

/** 切回「我的图」（该主题槽位有上传图时才有效）。 */
export function showUploadedBackdrop(): void {
  MAID_BACKDROP_STATE.useUploaded = true
  persistSource(true)
}

/** 写入当前主题对应的铺法。 */
export function saveBackdropMode(mode: BackdropMode): void {
  try {
    const raw = localStorage.getItem(BACKDROP_SETTINGS_KEY)
    const record: Record<string, unknown> = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>)
    const isNight = document.body.hasAttribute('data-ds-dark-theme')
    record[isNight ? 'nightMode' : 'dayMode'] = mode
    localStorage.setItem(BACKDROP_SETTINGS_KEY, JSON.stringify(record))
  } catch {
    // 存储失败不影响当前会话内的显示。
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BACKDROP_DB_NAME, 1)
    request.onupgradeneeded = () => {
      try {
        request.result.createObjectStore(BACKDROP_STORE, { keyPath: 'id' })
      } catch {
        // 仓库已存在，忽略。
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

interface StoredBackdrop {
  id: string
  kind: BackdropKind
  name: string
  blob: Blob
}

/** 启动时从 IndexedDB 恢复两张背景图，重建 objectURL。 */
export async function restoreBackdrop(): Promise<void> {
  try {
    const db = await openDb()
    if (!db.objectStoreNames.contains(BACKDROP_STORE)) return
    const records = await new Promise<StoredBackdrop[]>((resolve, reject) => {
      const request = db.transaction(BACKDROP_STORE, 'readonly').objectStore(BACKDROP_STORE).getAll()
      request.onsuccess = () => resolve((request.result ?? []) as StoredBackdrop[])
      request.onerror = () => reject(request.error)
    })
    for (const record of records) {
      if (record.blob === undefined || record.blob === null) continue
      const url = URL.createObjectURL(record.blob)
      if (record.kind === 'day') MAID_BACKDROP_STATE.dayUrl = url
      else if (record.kind === 'night') MAID_BACKDROP_STATE.nightUrl = url
    }
  } catch {
    // 无 IndexedDB 或读取失败：保持内置背景。
  }
}

/** 保存一张用户背景，返回可直接使用的 objectURL。 */
export async function putBackdrop(kind: BackdropKind, file: File): Promise<string> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BACKDROP_STORE, 'readwrite')
    tx.objectStore(BACKDROP_STORE).put({ id: kind, kind, name: file.name, blob: file })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  const url = URL.createObjectURL(file)
  if (kind === 'day') MAID_BACKDROP_STATE.dayUrl = url
  else MAID_BACKDROP_STATE.nightUrl = url
  // 新上传即切回「我的图」。
  MAID_BACKDROP_STATE.useUploaded = true
  return url
}

/** 清除当前主题槽位的用户背景，回退到内置图。 */
export async function clearBackdrop(kind: BackdropKind): Promise<void> {
  const existing = kind === 'day' ? MAID_BACKDROP_STATE.dayUrl : MAID_BACKDROP_STATE.nightUrl
  if (existing !== null) URL.revokeObjectURL(existing)
  if (kind === 'day') MAID_BACKDROP_STATE.dayUrl = null
  else MAID_BACKDROP_STATE.nightUrl = null
  // 清除后回到内置图。
  MAID_BACKDROP_STATE.useUploaded = true
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BACKDROP_STORE, 'readwrite')
      tx.objectStore(BACKDROP_STORE).delete(kind)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // 删除失败仅影响下次刷新，不回滚当前显示。
  }
}

/** 当前主题下应当使用的图源与铺法。 */
export function currentBackdrop(_isDark: boolean, fallbackDark: string, fallbackLight: string): {
  source: string
  size: string
  uploaded: boolean
} {
  // 槽位以皮肤自己的持久化选择为准——宿主启动后会把 data-ds-dark-theme
  // 写回它自己的值，直接跟着主题走会让背景在刷新时跳槽。
  const isDark = MAID_BACKDROP_STATE.slot === 'night'
  const candidate = isDark ? MAID_BACKDROP_STATE.nightUrl : MAID_BACKDROP_STATE.dayUrl
  // useUploaded 为 false 时强制走内置图，让版本切换立刻可见。
  const uploaded = MAID_BACKDROP_STATE.useUploaded ? candidate : null
  const mode = isDark ? MAID_BACKDROP_STATE.nightMode : MAID_BACKDROP_STATE.dayMode
  return {
    source: uploaded ?? (isDark ? fallbackDark : fallbackLight),
    size: BACKDROP_SIZE[mode] ?? 'cover',
    uploaded: uploaded !== null,
  }
}

/** 切换背景槽位（白天 / 夜晚），并持久化，刷新后保持。 */
export function saveBackdropSlot(slot: BackdropKind): void {
  MAID_BACKDROP_STATE.slot = slot
  try {
    const raw = localStorage.getItem(BACKDROP_SETTINGS_KEY)
    const record: Record<string, unknown> = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>)
    record.slot = slot
    localStorage.setItem(BACKDROP_SETTINGS_KEY, JSON.stringify(record))
  } catch {
    // 存储失败只影响持久化。
  }
}
