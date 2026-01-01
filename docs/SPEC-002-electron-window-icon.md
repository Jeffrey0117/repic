# SPEC-002: Electron Window Icon

## Overview
Replace default Electron icon with custom repic-logo.png in the application window.

## Requirements
1. Window title bar should show repic-logo.png icon
2. Taskbar should show repic-logo.png icon
3. Works in both dev and production modes

## Implementation
- File: `electron/main.cjs`
- Add `icon` property to BrowserWindow options
- Path: `path.join(__dirname, '../repic-logo.png')` for dev
- For production: include in build files

## Acceptance Criteria
- [ ] Window shows custom icon in title bar (Windows)
- [ ] Taskbar shows custom icon
- [ ] Icon visible in dev mode
- [ ] Icon visible in production build
