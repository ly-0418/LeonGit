export type ThemeMode = "light" | "dark";

export const FONT_REFERENCE_PX = 16;
export const FONT_MIN_PX = 18;
export const FONT_MAX_PX = 28;
export const FONT_DEFAULT_PX = 20;
export type FontScale = number;
export const DEFAULT_FONT_SCALE: FontScale = FONT_DEFAULT_PX / FONT_REFERENCE_PX;

export const THEME_STORAGE_KEY = "leongit:theme";
export const FONT_SCALE_STORAGE_KEY = "leongit:font-scale";
export const MAX_REPOS = 8;

export interface RepoEntry {
  id: string;
  path: string;
  name: string;
  openedAt: number;
}

export interface RepoEntryInput {
  path: string;
  name: string;
  openedAt: number;
}

export interface UiState {
  theme: ThemeMode;
  fontScale: FontScale;
  repos: RepoEntry[];
}

export function fontScaleToPx(scale: number): number {
  return Math.round(scale * FONT_REFERENCE_PX);
}

export function fontPxToScale(px: number): FontScale {
  return Math.min(FONT_MAX_PX, Math.max(FONT_MIN_PX, px)) / FONT_REFERENCE_PX;
}

export function normalizeFontScale(scale: number): FontScale {
  if (!Number.isFinite(scale)) {
    return DEFAULT_FONT_SCALE;
  }
  return fontPxToScale(Math.round(scale * FONT_REFERENCE_PX));
}
