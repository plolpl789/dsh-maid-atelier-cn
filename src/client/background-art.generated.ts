import { skinAssetUrl } from './asset-url.ts'

/**
 * Generated palace backdrops and independent character layers. Run
 * `pnpm run generate:backgrounds` after replacing any source PNG.
 */
export const MAID_ATELIER_PALACE_LIGHT = skinAssetUrl('52e7dce6993e3f955c3fbb2875885e7ab60fb38ca89adb15d977c7a85d58c073.webp')
export const MAID_ATELIER_PALACE_DARK = skinAssetUrl('ae6917bb1aafa71e6a10cfcaa1289f13e265aa7f32d3fb7c1988004bf50f8983.webp')
export const MAID_ATELIER_MAID_LEFT = skinAssetUrl('2818e5359596b13c5d64f5b1c5d4a9e0c05be477824779af8af37a0e10016b07.webp')
export const MAID_ATELIER_MAID_RIGHT = skinAssetUrl('7c5a5493e84418bc0435013c8605222718923872c15eb46fdd36158d201c0b1e.webp')

/**
 * 社区增强版 · 经典宫殿图（未压缩，来自 maid-atelier v0.0.1）
 * 上游在 v0.1.8 把两张宫殿图重新编码压小了一半；这里保留原始画质版本，
 * 让用户在「皮肤 → 背景 → 内置图」里自行选择。
 */
export const MAID_ATELIER_PALACE_LIGHT_CLASSIC = skinAssetUrl('f4ebfb9324dab864065767473e91cbb04b147b24633e7126f0a8c5bdc67d2e32.webp')
export const MAID_ATELIER_PALACE_DARK_CLASSIC = skinAssetUrl('0b82ac2d707124422b730c27067be5e08f84c3f92e347698088cac31f44bc04c.webp')
