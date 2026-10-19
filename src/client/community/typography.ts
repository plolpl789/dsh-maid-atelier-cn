/**
 * 社区增强版 · 字体细粒度设置
 *
 * 7 个区域各自可选字号与字体，覆盖规则通过皮肤自有的 <style> 注入。
 * 图标（svg）、代码块、弹层不会被误改；细分类别默认不干预（跟随官方）。
 *
 * 注意：选择器刻意保持简单。带 :where() 会把特异性清零，带多层 :not()
 * 组合则可能让浏览器整条丢弃规则——两者都会导致"设置了却没反应"。
 */

/** localStorage 键。 */
export const TYPOGRAPHY_STORAGE_KEY = 'maid-atelier.typography'
/** 字体样式 <style> 的 data-plugin-css 标识。 */
export const TYPOGRAPHY_STYLE_TAG = 'maid-atelier/typography'

export type TypographyArea = 'workspace' | 'panel' | 'chat' | 'code' | 'tool' | 'system' | 'title'

export interface TypographyValues {
  workspaceSize: number
  workspaceFont: string
  panelSize: number
  panelFont: string
  chatSize: number
  chatFont: string
  codeSize: number
  codeFont: string
  toolSize: number
  toolFont: string
  systemSize: number
  systemFont: string
  titleSize: number
  titleFont: string
}

/** 字号候选（0 = 跟随官方）。 */
export const TYPOGRAPHY_SIZES: readonly number[] = [0, 12, 13, 14, 15, 16, 18, 20, 24]

/** 字体候选：已按 Windows 实装字体校对（缺装的跨平台字体不列入）。 */
export const TYPOGRAPHY_FONTS: ReadonlyArray<readonly [value: string, label: string]> = [
  ['', '跟随界面默认'],
  ['Microsoft YaHei', '微软雅黑'],
  ['KaiTi', '楷体'],
  ['FangSong', '仿宋'],
  ['SimHei', '黑体'],
  ['DengXian', '等线'],
  ['STKaiti', '华文楷体'],
  ['STSong', '华文宋体'],
  ['STFangsong', '华文仿宋'],
  ['Microsoft JhengHei', '微软正黑体'],
  ['Noto Sans SC', 'Noto Sans SC'],
  ['Noto Serif SC', 'Noto Serif SC 衬线'],
  ['LXGW WenKai', '霞鹜文楷（需安装）'],
  ['Georgia', 'Georgia 西文衬线'],
  ['Consolas', 'Consolas 等宽'],
  ['JetBrains Mono', 'JetBrains Mono 等宽'],
]

export const TYPOGRAPHY_AREAS: ReadonlyArray<readonly [area: TypographyArea, label: string]> = [
  ['workspace', '工作区'],
  ['panel', '面板区'],
  ['chat', '聊天正文'],
  ['code', '代码块'],
  ['tool', '工具结果'],
  ['system', '系统标签'],
  ['title', '标题'],
]

export const TYPOGRAPHY_DEFAULTS: TypographyValues = {
  workspaceSize: 14,
  workspaceFont: '',
  panelSize: 13,
  panelFont: '',
  chatSize: 0,
  chatFont: '',
  codeSize: 0,
  codeFont: '',
  toolSize: 0,
  toolFont: '',
  systemSize: 0,
  systemFont: '',
  titleSize: 0,
  titleFont: '',
}

/** 工作区 = 中央会话列（data-pane 优先、哈希类名兜底）。 */
const WORKSPACE_SELECTOR = ':is([data-pane="conversation"], [class*="centerCol"])'

/** 面板区 = 侧栏 + 详情列。 */
const PANEL_SELECTOR =
  ':is([data-pane="sidebar"], [class*="sidebarCol"], [data-pane="details"], [class*="detailsCol"])'

/** 文本目标：排除图标与代码块自身的排版。 */
const TEXT_TARGETS = ':not(svg):not(svg *):not(pre):not(pre *):not(code):not(code *)'

const CHAT_SELECTOR = `${WORKSPACE_SELECTOR} [data-chat-anchor-key]`
const CODE_SELECTOR = `${WORKSPACE_SELECTOR} :is(pre, code)`
const TOOL_SELECTOR = `${WORKSPACE_SELECTOR} [data-tool]`
const SYSTEM_SELECTOR = `${WORKSPACE_SELECTOR} :is([class*="turnStatus"], [class*="timeStart"], [class*="timeEnd"], [class*="openError"])`
const TITLE_SELECTOR = [
  `${PANEL_SELECTOR} :is([class*="sectionHeader"], [class*="logoRow"], [class*="navTitle"], [class*="title"])`,
  `${WORKSPACE_SELECTOR} :is(header[class*="header"], [class*="crumb"], [class*="tab"], [class*="headline"])`,
].join(', ')

function clampSize(value: unknown): number {
  const size = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
  if (!Number.isFinite(size)) return 0
  return Math.min(40, Math.max(0, Math.round(size)))
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function loadTypography(): TypographyValues {
  const values: TypographyValues = { ...TYPOGRAPHY_DEFAULTS }
  try {
    const raw = localStorage.getItem(TYPOGRAPHY_STORAGE_KEY)
    if (raw === null) return values
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return values
    const record = parsed as Record<string, unknown>
    for (const area of TYPOGRAPHY_AREAS) {
      const [key] = area
      values[`${key}Size` as keyof TypographyValues] = clampSize(record[`${key}Size`]) as never
      values[`${key}Font` as keyof TypographyValues] = readString(record[`${key}Font`]) as never
    }
  } catch {
    // 损坏数据整体回退默认。
  }
  return values
}

export function saveTypography(values: TypographyValues): void {
  try {
    localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(values))
  } catch {
    // 存储失败不影响当前会话。
  }
}

/** 多词字体名加引号，单标识符与逗号列表按原样使用。 */
function quoteFontFamily(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed.includes(',') || /^["']/.test(trimmed)) return trimmed
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed
}

function declarations(size: number, font: string): string {
  const sizeRule = size > 0 ? `font-size: ${size}px !important;` : ''
  const fontName = quoteFontFamily(font)
  const fontRule = fontName === '' ? '' : `font-family: ${fontName} !important;`
  return `${sizeRule}${fontRule}`
}

function textRule(selector: string, size: number, font: string): string {
  const body = declarations(size, font)
  if (body === '') return ''
  return `${selector} ${TEXT_TARGETS} { ${body} }`
}

/** 依据设置生成覆盖规则；整体类别在前，细分类别在后。 */
export function buildTypographyCss(values: TypographyValues): string {
  const rules: string[] = []
  const push = (selector: string, size: number, font: string): void => {
    const rule = textRule(selector, size, font)
    if (rule !== '') rules.push(rule)
  }
  push(WORKSPACE_SELECTOR, values.workspaceSize, values.workspaceFont)
  push(PANEL_SELECTOR, values.panelSize, values.panelFont)
  push(CHAT_SELECTOR, values.chatSize, values.chatFont)
  const codeBody = declarations(values.codeSize, values.codeFont)
  if (codeBody !== '') rules.push(`${CODE_SELECTOR} { ${codeBody} }`)
  push(TOOL_SELECTOR, values.toolSize, values.toolFont)
  push(SYSTEM_SELECTOR, values.systemSize, values.systemFont)
  push(TITLE_SELECTOR, values.titleSize, values.titleFont)
  return rules.join('\n')
}

/** 把规则写进皮肤自有的 <style>，重复调用即热更新。 */
export function applyTypography(values: TypographyValues): void {
  let tag = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${TYPOGRAPHY_STYLE_TAG}"]`)
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.pluginCss = TYPOGRAPHY_STYLE_TAG
    document.head.append(tag)
  }
  tag.textContent = buildTypographyCss(values)
}

/** 释放字体样式标签（皮肤卸载时调用）。 */
export function releaseTypography(): void {
  document.querySelector(`style[data-plugin-css="${TYPOGRAPHY_STYLE_TAG}"]`)?.remove()
}
