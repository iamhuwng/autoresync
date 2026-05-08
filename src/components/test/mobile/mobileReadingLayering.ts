export const MOBILE_READING_LAYER_Z_INDEX = {
  HEADER: 1100,
  FAB: 1000,
  SHEET_BACKDROP: 2000,
  SHEET: 2001,
  REVIEW_SUMMARY: 2002,
  OVERFLOW_MENU: 4000,
  UTILITY_MODAL: 4500,
  SYSTEM_OVERLAY: 9000,
  FINAL_CONFIRM_MODAL: 9500,
} as const;

type MobileReadingLayerVarName =
  | '--mobile-reading-layer-header'
  | '--mobile-reading-layer-fab'
  | '--mobile-reading-layer-sheet-backdrop'
  | '--mobile-reading-layer-sheet'
  | '--mobile-reading-layer-review-summary'
  | '--mobile-reading-layer-overflow-menu'
  | '--mobile-reading-layer-utility-modal'
  | '--mobile-reading-layer-system-overlay'
  | '--mobile-reading-layer-final-confirm-modal';

export const mobileReadingLayerVars: Record<MobileReadingLayerVarName, string> = {
  '--mobile-reading-layer-header': String(MOBILE_READING_LAYER_Z_INDEX.HEADER),
  '--mobile-reading-layer-fab': String(MOBILE_READING_LAYER_Z_INDEX.FAB),
  '--mobile-reading-layer-sheet-backdrop': String(MOBILE_READING_LAYER_Z_INDEX.SHEET_BACKDROP),
  '--mobile-reading-layer-sheet': String(MOBILE_READING_LAYER_Z_INDEX.SHEET),
  '--mobile-reading-layer-review-summary': String(MOBILE_READING_LAYER_Z_INDEX.REVIEW_SUMMARY),
  '--mobile-reading-layer-overflow-menu': String(MOBILE_READING_LAYER_Z_INDEX.OVERFLOW_MENU),
  '--mobile-reading-layer-utility-modal': String(MOBILE_READING_LAYER_Z_INDEX.UTILITY_MODAL),
  '--mobile-reading-layer-system-overlay': String(MOBILE_READING_LAYER_Z_INDEX.SYSTEM_OVERLAY),
  '--mobile-reading-layer-final-confirm-modal': String(MOBILE_READING_LAYER_Z_INDEX.FINAL_CONFIRM_MODAL),
};
