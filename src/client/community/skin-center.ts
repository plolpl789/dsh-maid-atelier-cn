/**
 * 社区增强版 · 皮肤设置中心
 *
 * 在会话头部的标签栏里注入第三枚「皮肤」按钮，点开是三页设置：
 * 背景 / 字体 / 浮窗。面板配色全部走 dsh 的系统 CSS 变量，
 * 随亮暗主题自动切换，不做自定义皮肤化。
 */

import {
  BACKDROP_PALETTES,
  BACKDROP_SIZE,
  MAID_BACKDROP_STATE,
  THEME_OVERRIDE_KEY,
  clearBackdrop,
  putBackdrop,
  saveBackdropMode,
  saveBackdropPalette,
  saveBackdropSlot,
  showUploadedBackdrop,
  type BackdropKind,
  type BackdropMode,
  type BackdropPalette,
} from './backdrop.ts'
import {
  TYPOGRAPHY_AREAS,
  TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_FONTS,
  TYPOGRAPHY_SIZES,
  saveTypography,
  type TypographyValues,
} from './typography.ts'
import type { FloatingWindowsHandle } from './floating-windows.ts'

export interface SkinCenterDeps {
  skinOwner: string
  typography: TypographyValues
  applyTypography: () => void
  floating: FloatingWindowsHandle
  /** 重绘背景（index.ts 的 syncBackdrop）。 */
  syncBackdrop: () => void
  /** 当前主题槽位。 */
  currentKind: () => BackdropKind
}

const PANEL_CSS =
  'position:fixed;top:96px;right:28px;z-index:999;width:360px;max-height:72vh;overflow:auto;padding:0;' +
  'border-radius:14px;background:var(--dsw-alias-bg-overlay,rgba(255,255,255,.97));' +
  'background-color:var(--dsw-alias-bg-overlay,rgba(255,255,255,.97));' +
  'color:var(--dsw-alias-label-primary,#1b1b1b);border:1px solid var(--dsw-alias-border-l2,#dcdcdc);' +
  'box-shadow:0 20px 56px rgba(0,0,0,.22);backdrop-filter:blur(20px) saturate(1.06);' +
  'font-size:12px;line-height:18px;font-family:inherit;display:none'

const TABS_CSS =
  'display:flex;gap:6px;padding:11px 14px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,#dcdcdc);' +
  'position:sticky;top:0;background:var(--dsw-alias-bg-overlay,rgba(255,255,255,.97));border-radius:14px 14px 0 0'

const PILL_CSS =
  'border:1px solid var(--dsw-alias-border-l2,#dcdcdc);border-radius:999px;background:transparent;' +
  'color:var(--dsw-alias-label-secondary,#6b6b6b);font-size:11.5px;padding:4px 14px;cursor:pointer;font-family:inherit'

const ACTION_CSS =
  'border:1px solid var(--dsw-alias-border-l2,#dcdcdc);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f4f4f4);' +
  'color:var(--dsw-alias-label-primary,#1b1b1b);font-size:11.5px;padding:5px 14px;cursor:pointer;font-family:inherit'

const MINI_CSS =
  'border:1px solid var(--dsw-alias-border-l2,#dcdcdc);border-radius:999px;background:transparent;' +
  'color:var(--dsw-alias-label-secondary,#6b6b6b);font-size:10px;padding:2px 8px;cursor:pointer;font-family:inherit'

const SELECT_CSS =
  'width:100%;font-size:11px;padding:3px;border:1px solid var(--dsw-alias-border-l2,#dcdcdc);border-radius:6px;' +
  'background:var(--dsw-alias-bg-layer-2,#f6f6f6);color:var(--dsw-alias-label-primary,#1b1b1b);font-family:inherit'

function button(label: string, css: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  element.style.cssText = css
  element.addEventListener('click', onClick)
  return element
}

function pillActive(element: HTMLButtonElement, active: boolean): void {
  element.style.background = active
    ? 'color-mix(in srgb, var(--dsw-alias-state-business-primary,#5b6ee1) 14%, transparent)'
    : 'transparent'
  element.style.color = active
    ? 'var(--dsw-alias-state-business-primary,#5b6ee1)'
    : 'var(--dsw-alias-label-secondary,#6b6b6b)'
  element.style.borderColor = active
    ? 'var(--dsw-alias-state-business-primary,#5b6ee1)'
    : 'var(--dsw-alias-border-l2,#dcdcdc)'
}

/** 安装设置中心；返回卸载函数。 */
export function installSkinCenter(deps: SkinCenterDeps): () => void {
  const panel = document.createElement('div')
  panel.dataset.skinChrome = 'maid-skin-center'
  panel.dataset.skinOwner = deps.skinOwner
  panel.style.cssText = PANEL_CSS

  const tabs = document.createElement('div')
  tabs.style.cssText = TABS_CSS
  const body = document.createElement('div')
  body.style.cssText = 'padding:12px 16px 16px'

  const pages: Record<string, HTMLDivElement> = {}
  const buttons: Record<string, HTMLButtonElement> = {}
  const order: Array<[key: string, label: string]> = [
    ['bg', '背景'],
    ['typo', '字体'],
    ['fw', '浮窗'],
  ]

  for (const [key, label] of order) {
    const tabButton = button(label, PILL_CSS, () => {
      for (const other of order) {
        const page = pages[other[0]]
        if (page !== undefined) page.style.display = other[0] === key ? 'block' : 'none'
        pillActive(buttons[other[0]]!, other[0] === key)
      }
    })
    buttons[key] = tabButton
    tabs.append(tabButton)
    const page = document.createElement('div')
    page.style.display = 'none'
    pages[key] = page
    body.append(page)
  }

  const close = button('×', 'margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8578);font-size:16px;line-height:1;cursor:pointer;padding:0 4px;font-family:inherit', () => {
    panel.style.display = 'none'
  })
  tabs.append(close)

  // ── 背景页 ────────────────────────────────────────────────
  const bgPage = pages.bg!
  const bgHint = document.createElement('div')
  bgHint.textContent = '上传一张图替换对话区背景。按当前主题存：浅色存「白天」，深色存「夜晚」。'
  bgHint.style.cssText = 'color:var(--dsw-alias-label-tertiary,#8a8578);line-height:1.75;margin-bottom:10px'
  const bgPreviewLabel = document.createElement('div')
  bgPreviewLabel.textContent = '当前背景'
  bgPreviewLabel.style.cssText = 'color:var(--dsw-alias-label-tertiary,#8a8578);font-size:11px;margin-bottom:5px'
  const bgPreview = document.createElement('div')
  bgPreview.style.cssText =
    'width:100%;height:96px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#dcdcdc);' +
    'background:var(--maid-palace-art) center bottom / var(--maid-palace-size,cover) no-repeat;margin-bottom:12px'

  const bgPicker = document.createElement('input')
  bgPicker.type = 'file'
  bgPicker.accept = 'image/*'
  bgPicker.style.display = 'none'
  const bgChange = button('更换背景', ACTION_CSS, () => bgPicker.click())
  const bgReset = button('恢复内置', ACTION_CSS, () => {
    void (async () => {
      await clearBackdrop(deps.currentKind())
      deps.syncBackdrop()
    })()
  })
  const bgRow = document.createElement('div')
  bgRow.style.cssText = 'display:flex;gap:8px;align-items:center'
  bgRow.append(bgPicker, bgChange, bgReset)

  const bgModeRow = document.createElement('div')
  bgModeRow.style.cssText = 'margin-top:10px;display:flex;gap:6px;align-items:center;color:var(--dsw-alias-label-tertiary,#8a8578)'
  const bgModeLabel = document.createElement('span')
  bgModeLabel.textContent = '铺法'
  bgModeRow.append(bgModeLabel)
  const modeButtons: Array<[BackdropMode, HTMLButtonElement]> = []
  for (const mode of Object.keys(BACKDROP_SIZE) as BackdropMode[]) {
    const label = mode === 'cover' ? '铺满' : mode === 'contain' ? '适中' : '拉伸'
    const modeButton = button(label, MINI_CSS, () => {
      saveBackdropMode(mode)
      deps.syncBackdrop()
      for (const [other, element] of modeButtons) pillActive(element, other === mode)
    })
    modeButtons.push([mode, modeButton])
    bgModeRow.append(modeButton)
  }

  bgPicker.addEventListener('change', () => {
    const file = bgPicker.files?.[0]
    bgPicker.value = ''
    if (file === undefined) return
    void (async () => {
      try {
        await putBackdrop(deps.currentKind(), file)
        deps.syncBackdrop()
      } catch (error) {
        console.warn('[maid-atelier] 背景保存失败', error)
      }
    })()
  })

  // 内置图版本：上游轻量 / 经典高清，二选一。
  const paletteRow = document.createElement('div')
  paletteRow.style.cssText =
    'margin-top:10px;display:flex;gap:6px;align-items:center;color:var(--dsw-alias-label-tertiary,#8a8578)'
  const paletteLabel = document.createElement('span')
  paletteLabel.textContent = '内置图'
  paletteRow.append(paletteLabel)
  const paletteButtons: Array<[BackdropPalette, HTMLButtonElement]> = []
  for (const [value, label, hint] of BACKDROP_PALETTES) {
    const paletteButton = button(label, MINI_CSS, () => {
      saveBackdropPalette(value)
      deps.syncBackdrop()
      for (const [other, element] of paletteButtons) pillActive(element, other === value)
    })
    paletteButton.title = hint
    paletteButtons.push([value, paletteButton])
    paletteRow.append(paletteButton)
  }
  for (const [value, element] of paletteButtons) pillActive(element, value === MAID_BACKDROP_STATE.palette)

  // 「我的图」：切回用户上传的那张（该主题槽位有图时才显示）。
  const uploadedButton = button('我的图', MINI_CSS, () => {
    showUploadedBackdrop()
    deps.syncBackdrop()
    for (const [, element] of paletteButtons) pillActive(element, false)
    pillActive(uploadedButton, true)
  })
  const hasUploaded = deps.currentKind() === 'night'
    ? MAID_BACKDROP_STATE.nightUrl !== null
    : MAID_BACKDROP_STATE.dayUrl !== null
  if (hasUploaded) {
    paletteRow.append(uploadedButton)
    // 若当前正用着上传图，把高亮落在它身上。
    if (MAID_BACKDROP_STATE.useUploaded) {
      for (const [, element] of paletteButtons) pillActive(element, false)
      pillActive(uploadedButton, true)
    }
  }

  // 一键切换日夜：方便给「白天 / 夜晚」两个槽位分别设置背景。
  // 皮肤自己记住选择（maid-atelier.theme-override），启动时重新应用，
  // 因此即使宿主重置主题，下一次加载仍会回到用户选定的那一侧。
  const themeRow = document.createElement('div')
  themeRow.style.cssText =
    'margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#dcdcdc);' +
    'display:flex;gap:8px;align-items:center;color:var(--dsw-alias-label-tertiary,#8a8578)'
  const themeLabel = document.createElement('span')
  themeLabel.textContent = '主题'
  const themeButton = button('切换白天 / 黑夜', ACTION_CSS, () => {
    const isNight = MAID_BACKDROP_STATE.slot === 'night'
    const nextSlot: BackdropKind = isNight ? 'day' : 'night'
    // 槽位由皮肤自己持久化：刷新后背景不再跳槽。
    saveBackdropSlot(nextSlot)
    // 顺带切一次宿主主题，让界面配色与背景一致（仅当前会话有效）。
    if (nextSlot === 'night') document.body.setAttribute('data-ds-dark-theme', '')
    else document.body.removeAttribute('data-ds-dark-theme')
    // 尽力写回 dsh 设置，与「设置 → 外观」共用存储；失败也不影响背景槽位。
    void deps.setThemePreference?.(nextSlot === 'night' ? 'dark' : 'light').catch(() => {})
    deps.syncBackdrop()
    syncThemeState()
  })
  const themeState = document.createElement('span')
  themeState.style.cssText = 'font-size:11px;color:var(--dsw-alias-label-secondary,#6b6b6b)'
  function syncThemeState(): void {
    const night = MAID_BACKDROP_STATE.slot === 'night'
    themeState.textContent = night ? '当前：夜晚槽位' : '当前：白天槽位'
    themeButton.textContent = night ? '切换到白天' : '切换到黑夜'
    // 背景模式按钮的高亮也跟着当前槽位走。
    const activeMode = night ? MAID_BACKDROP_STATE.nightMode : MAID_BACKDROP_STATE.dayMode
    for (const [mode, element] of modeButtons) pillActive(element, mode === activeMode)
  }
  syncThemeState()
  themeRow.append(themeLabel, themeButton, themeState)

  bgPage.append(bgHint, bgPreviewLabel, bgPreview, bgRow, bgModeRow, paletteRow, themeRow)

  // ── 字体页 ────────────────────────────────────────────────
  const typoPage = pages.typo!
  const typoGrid = document.createElement('div')
  // 以 Record 视图读写，避免 `${area}Size` 这类动态键在联合类型上被拒。
  const typoRecord = deps.typography as unknown as Record<string, number | string>
  for (const [area, label] of TYPOGRAPHY_AREAS) {
    const row = document.createElement('div')
    row.style.cssText = 'display:grid;grid-template-columns:62px 1fr 1fr;gap:6px;align-items:center;padding:4px 0'
    const name = document.createElement('span')
    name.textContent = label
    name.style.cssText = 'color:var(--dsw-alias-label-primary,#1b1b1b)'

    const sizeSelect = document.createElement('select')
    sizeSelect.style.cssText = SELECT_CSS
    for (const size of TYPOGRAPHY_SIZES) {
      const option = document.createElement('option')
      option.value = String(size)
      option.textContent = size === 0 ? '默认' : `${size}px`
      if (typoRecord[`${area}Size`] === size) option.selected = true
      sizeSelect.append(option)
    }
    sizeSelect.addEventListener('change', () => {
      typoRecord[`${area}Size`] = Number(sizeSelect.value)
      saveTypography(deps.typography)
      deps.applyTypography()
    })

    const fontSelect = document.createElement('select')
    fontSelect.style.cssText = SELECT_CSS
    for (const [value, text] of TYPOGRAPHY_FONTS) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = text
      if (typoRecord[`${area}Font`] === value) option.selected = true
      fontSelect.append(option)
    }
    fontSelect.addEventListener('change', () => {
      typoRecord[`${area}Font`] = fontSelect.value
      saveTypography(deps.typography)
      deps.applyTypography()
    })

    row.append(name, sizeSelect, fontSelect)
    typoGrid.append(row)
  }
  const typoReset = button('恢复默认', MINI_CSS, () => {
    Object.assign(deps.typography, TYPOGRAPHY_DEFAULTS)
    saveTypography(deps.typography)
    deps.applyTypography()
    typoGrid.querySelectorAll('select').forEach((select) => {
      select.value = '0'
    })
  })
  typoReset.style.marginTop = '10px'
  typoPage.append(typoGrid, typoReset)

  // ── 浮窗页 ────────────────────────────────────────────────
  const fwPage = pages.fw!
  const fwList = document.createElement('div')
  const fwPicker = document.createElement('input')
  fwPicker.type = 'file'
  fwPicker.accept = 'image/*'
  fwPicker.multiple = true
  fwPicker.style.display = 'none'
  const fwAdd = button('添加图片', ACTION_CSS, () => fwPicker.click())

  const rebuildList = (): void => {
    fwList.textContent = ''
    const items = deps.floating.getItems()
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.textContent = '还没有浮窗。添加一张图，它会出现在版面左上角，可拖动、滚轮缩放。'
      empty.style.cssText = 'color:var(--dsw-alias-label-tertiary,#8a8578);line-height:1.75;padding:8px 0'
      fwList.append(empty)
      return
    }
    for (const item of items) {
      const row = document.createElement('div')
      row.style.cssText = 'padding:8px 0;border-top:1px solid var(--dsw-alias-border-l2,#ece7da)'
      const title = document.createElement('div')
      title.textContent = (item.kind === 'builtin' ? '内置 · ' : '') + item.name
      title.style.cssText =
        'font-size:12px;color:var(--dsw-alias-label-primary,#1b1b1b);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      const controls = document.createElement('div')
      controls.style.cssText = 'display:flex;gap:8px;align-items:center'

      const range = document.createElement('input')
      range.type = 'range'
      range.min = '120'
      range.max = '1500'
      range.step = '24'
      range.style.cssText = 'flex:1'
      range.addEventListener('input', () => {
        const rect = conversationRectSafe()
        item.hRatio = Number(range.value) / rect.height
        deps.floating.save()
        deps.floating.render()
      })

      const visibleButton = button(item.visible ? '隐藏' : '显示', MINI_CSS, () => {
        item.visible = !item.visible
        deps.floating.save()
        deps.floating.render()
        rebuildList()
      })
      const lockButton = button(item.locked ? '解锁' : '锁定', MINI_CSS, () => {
        item.locked = !item.locked
        pillActive(lockButton, item.locked)
        deps.floating.save()
        deps.floating.render()
        rebuildList()
      })
      if (item.locked) pillActive(lockButton, true)
      const removeButton = button('删除', MINI_CSS, () => {
        void (async () => {
          await deps.floating.removeItem(item.id)
          rebuildList()
        })()
      })

      controls.append(range, visibleButton, lockButton, removeButton)
      row.append(title, controls)
      fwList.append(row)
    }
  }

  function conversationRectSafe(): { height: number } {
    const element =
      document.querySelector<HTMLElement>('[class*="centerCol"]') ??
      document.querySelector<HTMLElement>('[data-pane="conversation"]')
    if (element !== null) {
      const rect = element.getBoundingClientRect()
      if (rect.height > 0) return rect
    }
    return { height: window.innerHeight }
  }

  fwPicker.addEventListener('change', () => {
    const files = Array.from(fwPicker.files ?? [])
    fwPicker.value = ''
    if (files.length === 0) return
    void (async () => {
      try {
        await deps.floating.addFiles(files)
        rebuildList()
      } catch (error) {
        console.warn('[maid-atelier] 浮窗保存失败', error)
      }
    })()
  })

  fwPage.append(fwAdd, fwPicker, fwList)
  rebuildList()

  panel.append(tabs, body)
  document.body.append(panel)

  // 默认展开背景页
  pages.bg!.style.display = 'block'
  pillActive(buttons.bg!, true)

  // ── 「皮肤」按钮：注入到会话头部标签栏同排 ────────────────
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.dataset.maidSkinTrigger = '1'
  trigger.textContent = '皮肤'
  trigger.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
  })

  let triggerQueued = false
  const syncTrigger = (): void => {
    const tablist = document.querySelector<HTMLElement>('[class*="header"] [class*="tabs"]')
    if (tablist === null) return
    if (tablist.querySelector('[data-maid-skin-trigger]') !== null) return
    const sample = tablist.querySelector<HTMLButtonElement>("button[class*='tab']")
    // 克隆同类名以继承胶囊化样式；没有样例按钮时退回内联等价样式。
    if (sample === null) {
      trigger.className = ''
      trigger.style.cssText =
        'box-sizing:border-box;min-width:111px;height:32px;padding:0 16px;border:1px solid var(--dsw-alias-border-l2);' +
        'border-radius:18px;background:transparent;font-size:13px;display:inline-flex;align-items:center;' +
        'justify-content:center;font-family:inherit'
    } else {
      trigger.className = sample.className
      trigger.style.cssText = ''
    }
    tablist.append(trigger)
  }

  const observer = new MutationObserver(() => {
    if (triggerQueued) return
    triggerQueued = true
    requestAnimationFrame(() => {
      triggerQueued = false
      syncTrigger()
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  syncTrigger()

  return () => {
    observer.disconnect()
    trigger.remove()
    panel.remove()
  }
}
