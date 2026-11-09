/** Hivelord Level 0 configuration. Dev-only flags live here, not in project config. */
export const MAX_BOTS = 150;
export const BOT_COUNT_DEFAULT = 15;
export const FIXED_TIMESTEP = 1 / 60;
export const SEATED_REACH_M = 0.75;

// Dev-only switch. Set false for production builds.
export const DEBUG = true;

// Auto-advance Boot -> Menu -> Playing while developing Level 0.
export const AUTO_ADVANCE_ON_BOOT = true;
export const BOOT_TO_MENU_SECONDS = 0.6;
export const MENU_TO_PLAYING_SECONDS = 0.6;

// Stops legacy productivity content from spawning when false.
// This project currently has no productivity objects to gate.
export const LEGACY_PRODUCTIVITY_OBJECTS = false;

// Debug overlay. `DEBUG_OVERLAY_ENABLED` is the gesture-free fallback;
// H toggles it at runtime while DEBUG is true.
export const DEBUG_OVERLAY_ENABLED = true;
export const DEBUG_OVERLAY_KEY = 'KeyH';
export const PAUSE_KEY = 'KeyP';
export const DEBUG_OVERLAY_UPDATE_HZ = 4;
