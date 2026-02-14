# Changelog

## 2026-02-14

### Web app UX + voice reliability
- Reworked app navigation hierarchy for clearer workspace, channel, and DM browsing (including mobile drawer behavior).
- Added friendlier onboarding and stronger empty/loading states for workspaces, channels, and messages.
- Improved call controls with explicit `Join/Leave`, `Mute`, `Deafen`, input/output device pickers, loopback testing, and live mic meter.
- Added persisted audio processing options (`echoCancellation`, `noiseSuppression`, `autoGainControl`) and integrated them into active call reconfiguration.
- Added defensive microphone acquisition fallbacks/retries and user-friendly media error messages (permission denied, not found, in use, unsupported).
- Added media device diagnostics panel and `devicechange` reinitialization path for resilient browser/desktop microphone behavior.
- Improved voice leave/rejoin cleanup to prevent stale media resources and dangling tracks.
