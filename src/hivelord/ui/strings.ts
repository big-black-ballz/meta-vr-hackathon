/**
 * Every user-facing string in the Hivelord UI layer. Components must reference
 * these entries; no hard-coded user-facing text in components.
 */
export const STRINGS = {
  appTitle: 'Hivelord: Rise of the Swarm King',
  appPitch:
    'Centuries ago, the Hivelord, a king who commanded a living swarm, was betrayed and destroyed. Now his soul awakens in you. Reclaim the swarm\u2019s lost powers, chapter by chapter, with your bare hands.',

  presessionTitle: 'Hivelord: Rise of the Swarm King',
  presessionEnterXR: 'Enter XR',
  presessionVirtualMode: 'Continue in virtual mode',
  presessionNoWebXR:
    'This browser does not support WebXR. Open this link on a Meta Quest 3 browser.',
  presessionNoAR:
    'AR is not supported on this device, but VR is. You can continue in virtual mode.',
  presessionNoHands:
    'Hand tracking is unavailable. The game needs hand tracking to play.',
  presessionPermissionDenied:
    'Permission was denied. Allow XR access and try again.',
  presessionDesktop:
    'Hivelord is a hands-only VR game. Open this link on a Meta Quest 3 browser to play. You can look around in virtual mode from here.',

  startBegin: 'Begin',
  startSettings: 'Settings',
  startSkills: 'Skills',
  startExit: 'Exit',
  startSubtitle: 'The swarm remembers you.',

  loadingTitle: 'Entering the hive...',
  loadingTip: 'Hold your hands where you can see them.',

  pauseTitle: 'Paused',
  pauseResume: 'Resume',
  pauseRestart: 'Restart Chapter',
  pauseSettings: 'Settings',
  pauseSkills: 'Skills',
  pauseRecenter: 'Recenter',
  pauseMenu: 'Menu',
  pauseExit: 'Exit',

  settingsTitle: 'Settings',
  settingsAudio: 'Audio',
  settingsMaster: 'Master',
  settingsMusic: 'Music',
  settingsSfx: 'SFX',
  settingsVoice: 'Voice',
  settingsSubtitles: 'Subtitles',
  settingsSubtitlesOn: 'On',
  settingsSubtitleSize: 'Size',
  settingsSubtitleBg: 'Background',
  settingsHands: 'Hands',
  settingsDominant: 'Dominant hand',
  settingsQuality: 'Quality',
  settingsComfort: 'Comfort',
  settingsReduceFlash: 'Reduce flashing',
  settingsVignette: 'Comfort vignette',
  settingsDebugOverlay: 'Debug overlay',
  settingsReset: 'Reset progress',
  settingsBack: 'Back',
  settingsSizeS: 'S',
  settingsSizeM: 'M',
  settingsSizeL: 'L',
  settingsBgNone: 'None',
  settingsBgLight: 'Light',
  settingsBgSolid: 'Solid',
  settingsQualityLow: 'Low',
  settingsQualityMedium: 'Medium',
  settingsQualityHigh: 'High',
  settingsHandLeft: 'Left',
  settingsHandRight: 'Right',
  settingsHandAuto: 'Auto',

  skillsTitle: 'Skills',
  skillsLocked: 'Memory not yet recovered',
  skillsBack: 'Back',

  chapterTitle: 'Chapter Complete',
  chapterSummary: 'The swarm grows stronger. (Summary placeholder.)',
  chapterContinue: 'Continue',
  chapterMenu: 'Menu',

  confirmTitle: 'Are you sure?',
  confirmRestartMsg: 'Restart the current chapter? Progress in this chapter is lost.',
  confirmResetMsg: 'Erase all saved progress and settings?',
  confirmYes: 'Confirm',
  confirmNo: 'Cancel',

  trackingBanner: 'Show your hands to continue',

  errorTitle: 'Something went wrong',
  errorRetry: 'Retry',
  errorExit: 'Exit',

  wristPause: 'Pause',
  wristSkills: 'Skills',
  wristSettings: 'Settings',
  wristRecenter: 'Recenter',
  wristToggleHud: 'HUD on/off',

  objectiveDefault: 'Follow the swarm hint.',
  toastRestarted: 'Chapter restarted (placeholder).',
  toastRecentered: 'View recentered.',
  toastProgressReset: 'Progress erased.',
  toastHudOn: 'HUD on.',
  toastHudOff: 'HUD off.',
  toastSkillUnlocked: 'Skill unlocked.',
  subtitleSpeaker: 'Old You',
} as const;

export type StringKey = keyof typeof STRINGS;
