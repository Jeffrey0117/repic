# SPEC-003: Internationalization (i18n) Implementation

## Overview
Implement complete i18n support for Traditional Chinese (zh-TW) and English (en).

## Requirements
1. Create i18n infrastructure with language switching
2. Extract all hardcoded strings to translation files
3. Support zh-TW (Traditional Chinese) and en (English)
4. Persist language preference in localStorage
5. Auto-detect browser language on first visit

## Files to Create
- `src/i18n/index.js` - i18n configuration
- `src/i18n/locales/zh-TW.json` - Chinese translations
- `src/i18n/locales/en.json` - English translations
- `src/hooks/useI18n.js` - React hook for translations

## Strings to Translate
### UI Elements
- "Open Folder" / "開啟資料夾"
- "Open Image" / "開啟圖片"
- "Screenshot" / "截圖"
- "Crop" / "裁切"
- "Apply to Others" / "套用到其他"
- "Replace" / "覆蓋原檔"
- "New Folder" / "新資料夾"
- "Select Folder..." / "選擇資料夾..."
- "Confirm" / "確認"
- "Cancel" / "取消"
- "Select All" / "全選"
- "Clear" / "清除"
- "Processing..." / "處理中..."
- "Success" / "成功"
- "Failed" / "失敗"

### Messages
- "Close image?" / "關閉圖片？"
- "Completed! Success: X, Failed: Y" / "完成！成功 X 張，失敗 Y 張"

## Implementation Steps
1. Install or create simple i18n solution (no external deps preferred)
2. Create translation JSON files
3. Create useI18n hook
4. Replace all hardcoded strings with t() calls
5. Add language switcher to settings/UI

## Acceptance Criteria
- [ ] All UI text supports both languages
- [ ] Language persists across sessions
- [ ] Language switcher works
- [ ] Default to browser language
