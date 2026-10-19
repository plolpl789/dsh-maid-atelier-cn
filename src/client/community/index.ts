/**
 * 社区增强版 · 统一入口
 *
 * 把背景、字体、浮窗、设置中心四块能力打包成一次安装调用。
 * 主 index.ts 只需提供主题判定、内置背景素材与舞台写入通道。
 */

import {
  MAID_BACKDROP_STATE,
  THEME_OVERRIDE_KEY,
  currentBackdrop,
  loadBackdropSettings,
  restoreBackdrop,
} from './backdrop.ts'
import { installFloatingWindows, type FloatingWindowsHandle } from './floating-windows.ts'
import { installSkinCenter } from './skin-center.ts'
import { applyTypography, loadTypography, releaseTypography, type TypographyValues } from './typography.ts'

export interface CommunityOptions {
  /** 皮肤归属标记。 */
  skinOwner: string
  /** 内置左女仆素材。 */
  maidLeft: string
  /** 内置右女仆素材。 */
  maidRight: string
  /** 暗色主题判定。 */
  isDark: () => boolean
  /** 内置夜晚宫殿图（上游轻量版）。 */
  fallbackDark: string
  /** 内置白天宫殿图（上游轻量版）。 */
  fallbackLight: string
  /** 经典版夜晚宫殿图（原魔改高清版）。 */
  classicDark: string
  /** 经典版白天宫殿图（原魔改高清版）。 */
  classicLight: string
  /** 把背景写进舞台变量（由 index.ts 提供，含去重与尺寸变量）。 */
  setBackdrop: (source: string, size: string) => void
  /**
   * 写入 dsh 自己的主题偏好（`ui-theme.preference`）。
   * 皮肤与设置界面共用这一份存储，避免两边各记一份、刷新时互相覆盖。
   */
  setThemePreference?: (preference: 'light' | 'dark') => Promise<void>
}

export interface CommunityHandle {
  /** 重新计算并写入背景（主题切换、上传、恢复内置后调用）。 */
  syncBackdrop: () => void
  /** 浮窗句柄，便于调试。 */
  floating: FloatingWindowsHandle
  /** 字体设置快照。 */
  typography: TypographyValues
  /** 卸载。 */
  dispose: () => void
}

/**
 * 安装全部社区增强能力。
 * 调用前应确保 body 已存在（皮肤 apply 阶段即满足）。
 */
export function installCommunityEnhancements(options: CommunityOptions): CommunityHandle {
  const typography = loadTypography()
  loadBackdropSettings()

  const syncBackdrop = (): void => {
    const dark = options.isDark()
    // 内置图按用户选择切换画质版本（上游轻量 / 经典高清）。
    const classic = MAID_BACKDROP_STATE.palette === 'classic'
    const state = currentBackdrop(
      dark,
      classic ? options.classicDark : options.fallbackDark,
      classic ? options.classicLight : options.fallbackLight,
    )
    options.setBackdrop(state.source, state.size)
  }

  // 字体：立即应用一次，让用户上次的设置生效。
  applyTypography(typography)

  // 恢复用户上次的日夜选择：皮肤自己记的偏好优先于宿主默认。
  //
  // 时序注意：dsh 的主题系统通常比皮肤晚初始化，会在挂载后把
  // data-ds-dark-theme 写回它自己的持久化值。所以不能只应用一次——
  // 要在启动窗口内（约 2 秒、8 次纠正）持续保持，随后停止干预，
  // 这样刷新后能守住用户的选择，又不会妨碍之后主动切换主题。
  try {
    const override = localStorage.getItem(THEME_OVERRIDE_KEY)
    if (override === 'dark' || override === 'light') {
      const wantDark = override === 'dark'
      let attempts = 0
      const enforce = (): void => {
        const isDark = document.body.hasAttribute('data-ds-dark-theme')
        if (isDark === wantDark) return
        if (wantDark) document.body.setAttribute('data-ds-dark-theme', '')
        else document.body.removeAttribute('data-ds-dark-theme')
        syncBackdrop()
      }
      enforce()
      const timer = setInterval(() => {
        attempts += 1
        enforce()
        if (attempts >= 8) clearInterval(timer)
      }, 250)
      const observer = new MutationObserver(() => {
        if (attempts < 8) enforce()
      })
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      setTimeout(() => observer.disconnect(), 2400)
    }
  } catch {
    // 存储异常时沿用宿主主题。
  }

  // 浮窗：接管立绘。
  const floating = installFloatingWindows({
    maidLeft: options.maidLeft,
    maidRight: options.maidRight,
    skinOwner: options.skinOwner,
  })

  // 背景：先从 IndexedDB 恢复用户图，再重绘。
  void (async () => {
    await restoreBackdrop()
    syncBackdrop()
  })()

  // 设置中心。
  const disposeCenter = installSkinCenter({
    skinOwner: options.skinOwner,
    typography,
    applyTypography: () => applyTypography(typography),
    floating,
    syncBackdrop,
    currentKind: () => MAID_BACKDROP_STATE.slot,
  })

  return {
    syncBackdrop,
    floating,
    typography,
    dispose: () => {
      disposeCenter()
      floating.dispose()
      releaseTypography()
    },
  }
}

export { MAID_BACKDROP_STATE, BACKDROP_SIZE } from './backdrop.ts'
export { TYPOGRAPHY_AREAS, TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_FONTS, TYPOGRAPHY_SIZES } from './typography.ts'
export { FLOATING_SIZE_MAX, FLOATING_SIZE_MIN, FLOATING_SIZE_STEP } from './floating-windows.ts'
export type { FloatingWindowItem, FloatingWindowsHandle } from './floating-windows.ts'
export type { TypographyValues } from './typography.ts'
