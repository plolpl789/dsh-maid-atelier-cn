/**
 * 社区增强版 · 角色浮窗
 *
 * 把立绘（或任意图片）变成可自由摆放的浮窗：拖拽、滚轮缩放、显隐、锁定、删除。
 * 位置与尺寸按【对话区比例】存储，窗口拉伸、右栏开合时随之自适应缩放。
 *
 * 与上游固定立绘的关系：module.css 的社区补丁已把 [data-maid-character]
 * 隐藏，立绘完全由本模块接管。
 */

const FLOATING_DB_NAME = 'maid-atelier-windows'
const FLOATING_STORE = 'windows'

/** localStorage 键（保存位置、尺寸、显隐、锁定）。 */
export const FLOATING_STORAGE_KEY = 'maid-atelier.windows'

/** 尺寸上下限与步进（px）。 */
export const FLOATING_SIZE_MIN = 120
export const FLOATING_SIZE_MAX = 1500
export const FLOATING_SIZE_STEP = 24
export const FLOATING_DEFAULT_HEIGHT = 560

export type FloatingSource = 'LEFT' | 'RIGHT'

export interface FloatingWindowItem {
  id: string
  name: string
  kind: 'builtin' | 'file'
  /** 仅 builtin 使用：取内置立绘素材。 */
  src?: FloatingSource
  xRatio: number
  yRatio: number
  hRatio: number
  visible: boolean
  locked: boolean
}

export interface FloatingWindowDeps {
  /** 内置左女仆素材 URL。 */
  maidLeft: string
  /** 内置右女仆素材 URL。 */
  maidRight: string
  /** 皮肤归属标记，写进 DOM 便于排查。 */
  skinOwner: string
}

/** 对话区矩形：浮窗一切比例都以它为参照。 */
export function conversationRect(): { left: number; top: number; width: number; height: number } {
  try {
    const element =
      document.querySelector<HTMLElement>('[class*="centerCol"]') ??
      document.querySelector<HTMLElement>('[data-pane="conversation"]')
    if (element !== null) {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return rect
    }
  } catch {
    // 落到视口兜底。
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

export function clampFloatingHeight(value: unknown): number {
  const size = Number(value)
  if (!Number.isFinite(size)) return FLOATING_DEFAULT_HEIGHT
  return Math.min(FLOATING_SIZE_MAX, Math.max(FLOATING_SIZE_MIN, Math.round(size / FLOATING_SIZE_STEP) * FLOATING_SIZE_STEP))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(FLOATING_DB_NAME, 1)
    request.onupgradeneeded = () => {
      try {
        request.result.createObjectStore(FLOATING_STORE, { keyPath: 'id' })
      } catch {
        // 仓库已存在。
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function loadItems(): FloatingWindowItem[] {
  try {
    const raw = localStorage.getItem(FLOATING_STORAGE_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const kept = parsed.filter(
          (item): item is FloatingWindowItem =>
            item !== null && typeof item === 'object' && typeof (item as FloatingWindowItem).id === 'string',
        )
        const rect = conversationRect()
        for (const item of kept) {
          // 迁移：早期版本没存 src，按 id 补回左右区分。
          if (item.kind === 'builtin' && item.src === undefined) {
            item.src = item.id.includes('right') ? 'RIGHT' : 'LEFT'
          }
          // 迁移：早期版本存的是像素，换算成比例。
          if (typeof item.hRatio !== 'number') {
            const legacy = item as unknown as Record<string, number>
            item.hRatio = (legacy.h ?? FLOATING_DEFAULT_HEIGHT) / rect.height
            item.xRatio = ((legacy.x ?? 0) - rect.left) / rect.width
            item.yRatio = ((legacy.y ?? 0) - rect.top) / rect.height
          }
        }
        return kept
      }
    }
  } catch {
    // 损坏数据走首次预置。
  }
  // 首次启用：两位女仆预置为浮窗，此后完全交给用户管理。
  return [
    { id: 'builtin-left', name: '左女仆', kind: 'builtin', src: 'LEFT', xRatio: 0.02, yRatio: 0.14, hRatio: 0.62, visible: true, locked: false },
    { id: 'builtin-right', name: '右女仆', kind: 'builtin', src: 'RIGHT', xRatio: 0.72, yRatio: 0.14, hRatio: 0.62, visible: true, locked: false },
  ]
}

export interface FloatingWindowsHandle {
  getItems: () => FloatingWindowItem[]
  render: () => void
  save: () => void
  addFiles: (files: File[]) => Promise<void>
  removeItem: (id: string) => Promise<void>
  dispose: () => void
}

/** 安装浮窗系统，返回操作句柄供设置面板使用。 */
export function installFloatingWindows(deps: FloatingWindowDeps): FloatingWindowsHandle {
  let items = loadItems()
  const urls = new Map<string, string>()
  let stage: HTMLDivElement | undefined
  let resizeObserver: ResizeObserver | undefined
  let queued = false

  const sourceOf = (item: FloatingWindowItem): string | undefined => {
    if (item.kind === 'builtin') return item.src === 'RIGHT' ? deps.maidRight : deps.maidLeft
    return urls.get(item.id)
  }

  const save = (): void => {
    try {
      localStorage.setItem(FLOATING_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // 存储失败不影响当前会话。
    }
  }

  const ensureStage = (): HTMLDivElement => {
    if (stage !== undefined) return stage
    const element = document.createElement('div')
    element.dataset.skinChrome = 'maid-floating-windows'
    element.dataset.skinOwner = deps.skinOwner
    element.style.cssText =
      'position:fixed;inset:0;z-index:940;pointer-events:none;overflow:hidden;' +
      'user-select:none;-webkit-user-select:none;-webkit-user-drag:none;outline:none'
    document.body.append(element)
    stage = element
    return element
  }

  const render = (): void => {
    const host = ensureStage()
    host.querySelectorAll('[data-fw-window]').forEach((node) => node.remove())

    const raw = conversationRect()
    // 加载页 / 骨架期：对话列还没收窄，宽高都接近满屏 → 不采信，
    // 改用视口中间的虚拟区域，让两位先站中间，等真实布局就绪再平滑滑开。
    const unlaid = raw.width >= window.innerWidth * 0.95 && raw.height >= window.innerHeight * 0.92
    const rect = unlaid
      ? { left: raw.width * 0.25, top: raw.top, width: raw.width * 0.5, height: raw.height }
      : raw

    for (const item of items) {
      if (!item.visible) continue
      const url = sourceOf(item)
      if (url === undefined) continue

      const heightPx = clampFloatingHeight(item.hRatio * rect.height)
      const leftPx = Math.round(rect.left + item.xRatio * rect.width)
      const topPx = Math.round(rect.top + item.yRatio * rect.height)

      const win = document.createElement('div')
      win.dataset.fwWindow = '1'
      win.dataset.fwId = item.id
      win.style.cssText =
        `position:absolute;left:${leftPx}px;top:${topPx}px;height:${heightPx}px;` +
        `pointer-events:${item.locked ? 'none' : 'auto'};cursor:${item.locked ? 'default' : 'grab'};` +
        'user-select:none;-webkit-user-select:none;-webkit-user-drag:none;touch-action:none;outline:none;' +
        '-webkit-tap-highlight-color:transparent;' +
        'transition:left .38s cubic-bezier(.22,.78,.2,1),top .38s cubic-bezier(.22,.78,.2,1),height .38s cubic-bezier(.22,.78,.2,1)'

      const img = document.createElement('img')
      img.src = url
      img.alt = item.name
      img.draggable = false
      img.style.cssText =
        'height:100%;width:auto;max-width:60vw;object-fit:contain;pointer-events:none;display:block;' +
        'filter:drop-shadow(0 12px 18px rgba(20,36,74,.18))'
      win.append(img)
      win.addEventListener('dragstart', (event) => event.preventDefault())

      let dragging = false
      let dragRect: ReturnType<typeof conversationRect> | undefined
      let startX = 0
      let startY = 0
      let originX = 0
      let originY = 0

      win.addEventListener('pointerdown', (event) => {
        if (item.locked) return
        dragging = true
        dragRect = conversationRect()
        win.style.transition = 'none'
        startX = event.clientX
        startY = event.clientY
        originX = Number.parseFloat(win.style.left) || 0
        originY = Number.parseFloat(win.style.top) || 0
        win.style.cursor = 'grabbing'
        try {
          win.setPointerCapture(event.pointerId)
        } catch {
          // 捕获失败不阻塞拖动。
        }
      })

      win.addEventListener('pointermove', (event) => {
        if (!dragging) return
        const nextX = Math.max(0, Math.min(window.innerWidth - 40, originX + (event.clientX - startX)))
        const nextY = Math.max(0, Math.min(window.innerHeight - 40, originY + (event.clientY - startY)))
        win.style.left = `${nextX}px`
        win.style.top = `${nextY}px`
      })

      const endDrag = (): void => {
        if (!dragging) return
        dragging = false
        win.style.cursor = 'grab'
        win.style.transition = ''
        const reference = dragRect ?? conversationRect()
        item.xRatio = (Number.parseFloat(win.style.left) - reference.left) / reference.width
        item.yRatio = (Number.parseFloat(win.style.top) - reference.top) / reference.height
        save()
      }
      win.addEventListener('pointerup', endDrag)
      win.addEventListener('pointercancel', endDrag)

      win.addEventListener(
        'wheel',
        (event) => {
          if (item.locked) return
          event.preventDefault()
          const reference = conversationRect()
          const current = Number.parseFloat(win.style.height) || clampFloatingHeight(item.hRatio * reference.height)
          const next = clampFloatingHeight(current + (event.deltaY < 0 ? FLOATING_SIZE_STEP : -FLOATING_SIZE_STEP))
          win.style.height = `${next}px`
          item.hRatio = next / reference.height
          save()
        },
        { passive: false },
      )

      host.append(win)
    }
  }

  const addFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    const db = await openDb()
    for (const file of files) {
      const id = `fw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      items.push({
        id,
        name: file.name,
        kind: 'file',
        xRatio: 0.03,
        yRatio: 0.14,
        hRatio: 0.62,
        visible: true,
        locked: false,
      })
      urls.set(id, URL.createObjectURL(file))
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FLOATING_STORE, 'readwrite')
        tx.objectStore(FLOATING_STORE).put({ id, name: file.name, blob: file })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    save()
    render()
  }

  const removeItem = async (id: string): Promise<void> => {
    items = items.filter((item) => item.id !== id)
    const url = urls.get(id)
    if (url !== undefined) {
      URL.revokeObjectURL(url)
      urls.delete(id)
    }
    save()
    render()
    try {
      const db = await openDb()
      const tx = db.transaction(FLOATING_STORE, 'readwrite')
      tx.objectStore(FLOATING_STORE).delete(id)
    } catch {
      // 删除失败仅影响下次启动。
    }
  }

  // 启动：从 IndexedDB 恢复上传图，等两帧后首次渲染。
  void (async () => {
    try {
      const db = await openDb()
      if (db.objectStoreNames.contains(FLOATING_STORE)) {
        const records = await new Promise<Array<{ id: string; blob: Blob }>>((resolve, reject) => {
          const request = db.transaction(FLOATING_STORE, 'readonly').objectStore(FLOATING_STORE).getAll()
          request.onsuccess = () => resolve((request.result ?? []) as Array<{ id: string; blob: Blob }>)
          request.onerror = () => reject(request.error)
        })
        for (const record of records) {
          if (record.blob !== undefined && record.blob !== null) urls.set(record.id, URL.createObjectURL(record.blob))
        }
      }
    } catch {
      // 无 IndexedDB：仅内置立绘可用。
    }
    requestAnimationFrame(() => requestAnimationFrame(render))
  })()

  // 对话区尺寸变化 → 按比例重排，复刻上游立绘的自适应手感。
  try {
    resizeObserver = new ResizeObserver(() => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        render()
      })
    })
    const target =
      document.querySelector<HTMLElement>('[class*="centerCol"]') ??
      document.querySelector<HTMLElement>('[data-pane="conversation"]')
    resizeObserver.observe(target ?? document.body)
  } catch {
    // 不支持 ResizeObserver 时退化为静态布局。
  }

  return {
    getItems: () => items,
    render,
    save,
    addFiles,
    removeItem,
    dispose: () => {
      resizeObserver?.disconnect()
      stage?.remove()
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    },
  }
}
