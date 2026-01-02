# Repic 依賴報告 / Dependency Report

## 專案概述

Repic 是一個使用 Electron + React + Vite 建構的圖片裁切工具。

---

## 生產依賴 (dependencies)

| 套件名稱 | 版本 | 用途 |
|---------|------|------|
| **@modern-ffi/core** | local | 自己的 FFI 庫，用於呼叫原生 libvips 進行高效能圖片處理 |
| **react** | ^19.2.0 | 前端 UI 框架 |
| **react-dom** | ^19.2.0 | React DOM 渲染器 |
| **react-image-crop** | ^11 | 圖片裁切元件 |

---

## 已重寫並移除的依賴

| 原套件 | 重寫位置 | 節省 |
|--------|---------|------|
| ~~clsx~~ | `src/lib/cn.js` | ~2KB |
| ~~tailwind-merge~~ | `src/lib/cn.js` | ~8KB |
| ~~framer-motion~~ | `src/lib/motion/` | ~150KB |
| ~~lucide-react~~ | `src/components/icons/` | ~20KB |

**總節省: ~180KB (gzip 前)**

---

## 開發依賴 (devDependencies)

| 套件名稱 | 版本 | 用途 |
|---------|------|------|
| **@eslint/js** | ^9.39.1 | ESLint JavaScript 設定 |
| **@tailwindcss/postcss** | ^4.1.18 | Tailwind CSS PostCSS 插件 |
| **@types/react** | ^19.2.5 | React TypeScript 型別定義 |
| **@types/react-dom** | ^19.2.3 | React DOM TypeScript 型別定義 |
| **@vitejs/plugin-react** | ^5.1.1 | Vite React 插件 |
| **autoprefixer** | ^10.4.23 | CSS 自動加前綴 |
| **concurrently** | ^9.2.1 | 同時執行多個指令 |
| **cross-env** | ^10.1.0 | 跨平台環境變數設定 |
| **electron** | ^31.7.7 | 桌面應用程式框架 |
| **electron-builder** | ^26.0.12 | Electron 打包工具 |
| **eslint** | ^9.39.1 | JavaScript 程式碼檢查工具 |
| **eslint-plugin-react-hooks** | ^7.0.1 | React Hooks ESLint 規則 |
| **eslint-plugin-react-refresh** | ^0.4.24 | React Refresh ESLint 規則 |
| **globals** | ^16.5.0 | 全域變數定義 |
| **postcss** | ^8.5.6 | CSS 後處理器 |
| **tailwindcss** | ^4.1.18 | CSS 框架 |
| **vite** | ^7.2.4 | 前端建置工具 |
| **wait-on** | ^9.0.3 | 等待資源就緒的工具 |

---

## 原生依賴 (Native Dependencies)

| 名稱 | 版本 | 來源 | 用途 |
|------|------|------|------|
| **libvips** | 8.16 | [build-win64-mxe](https://github.com/libvips/build-win64-mxe/releases) | 高效能原生圖片處理 |
| **koffi** | (間接) | @modern-ffi/core 依賴 | FFI 底層實作 |

---

## 自製模組說明

### 1. cn() - `src/lib/cn.js`
替換 clsx + tailwind-merge
```javascript
import { cn } from '@/lib/cn';
cn('p-4 text-white', 'p-2'); // => 'text-white p-2'
cn('base', { active: isActive }); // => 'base active'
```

### 2. Motion - `src/lib/motion/`
替換 framer-motion (~150KB -> ~0.5KB)
```javascript
import { motion, AnimatePresence } from '@/lib/motion';
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
```

### 3. Icons - `src/components/icons/`
替換 lucide-react，只包含實際使用的圖示
```javascript
import { FolderOpen, Download, X } from '@/components/icons';
```

---

## 依賴關係圖

```
repic
├── @modern-ffi/core (你的專案 - dogfooding)
│   └── koffi (底層 FFI 實作)
│       └── libvips-42.dll (原生圖片處理)
│       └── libgobject-2.0-0.dll (GLib 物件管理)
├── react + react-dom (UI 框架)
├── react-image-crop (裁切元件)
├── [自製] src/lib/cn.js (className 工具)
├── [自製] src/lib/motion/ (動畫系統)
├── [自製] src/components/icons/ (圖示)
└── electron (桌面框架)
```

---

## 效益總結

| 指標 | Before | After | 改善 |
|------|--------|-------|------|
| 生產依賴數量 | 8 | 4 | -50% |
| Bundle Size (估計) | ~250KB | ~70KB | -72% |
| 原生整合 | 無 | 完整 libvips | +原生效能 |
| 可控性 | 低 | 高 | 完全掌控 |

---

*報告更新時間: 2026-01-03*
