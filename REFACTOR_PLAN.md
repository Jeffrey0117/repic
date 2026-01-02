# Repic 依賴重寫計畫

## 目標

減少外部依賴、提升效能、深度整合原生處理、增加可控性。

---

## 優先級 1：react-image-crop → 自製 Cropper

### 重寫動機
| 項目 | 說明 |
|------|------|
| **整合原生處理** | 直接對接 libvips，避免 Canvas 中間層 |
| **效能優化** | 大圖片預覽時只載入縮圖，裁切時處理原檔 |
| **功能擴展** | 旋轉、翻轉、比例鎖定、多區域裁切 |
| **Bundle 減少** | 移除 ~15KB 依賴 |

### 實作方針
```
src/components/cropper/
├── Cropper.jsx          # 主元件
├── CropArea.jsx         # 裁切區域 (拖曳/縮放)
├── CropHandle.jsx       # 8個控制點
├── useCropGestures.js   # 滑鼠/觸控手勢
└── cropMath.js          # 座標計算、比例限制
```

### 關鍵技術
- CSS `transform` 做預覽，不渲染實際像素
- `PointerEvents` API 統一滑鼠/觸控
- libvips 做最終裁切（非 Canvas）
- 虛擬滾動處理超大圖片預覽

---

## 優先級 2：framer-motion → 自製動畫系統

### 重寫動機
| 項目 | 說明 |
|------|------|
| **Bundle 巨大** | framer-motion ~150KB (gzip ~50KB) |
| **功能過剩** | Repic 只用到基本 fade/slide |
| **效能** | CSS 動畫比 JS 動畫更流暢 |

### 實作方針
```
src/lib/motion/
├── Motion.jsx           # 動畫容器元件
├── presets.js           # 預設動畫 (fadeIn, slideUp, scale)
├── useMotion.js         # 動畫狀態管理
└── transitions.css      # CSS keyframes
```

### 關鍵技術
- CSS `@keyframes` + `transition`
- `IntersectionObserver` 觸發進入動畫
- `requestAnimationFrame` 處理複雜序列
- 保留類似 framer-motion 的 API：
  ```jsx
  <Motion animate="fadeIn" exit="fadeOut">
    <Content />
  </Motion>
  ```

---

## 優先級 3：clsx + tailwind-merge → 自製 cn()

### 重寫動機
| 項目 | 說明 |
|------|------|
| **過度工程** | 兩個套件做一件事 |
| **簡單需求** | 只需條件式 className 合併 |

### 實作方針
```javascript
// src/lib/cn.js (~30 行)
export function cn(...inputs) {
  const classes = [];

  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      classes.push(input);
    } else if (Array.isArray(input)) {
      classes.push(cn(...input));
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }

  // Tailwind 衝突解決（簡化版）
  return dedupeClasses(classes.join(' '));
}

function dedupeClasses(str) {
  // 處理 p-4 vs p-2, text-red vs text-blue 等衝突
  const prefixMap = new Map();
  const classes = str.split(/\s+/);

  for (const cls of classes) {
    const prefix = cls.replace(/-[^-]+$/, '');
    prefixMap.set(prefix, cls);
  }

  return [...prefixMap.values()].join(' ');
}
```

---

## 優先級 4：lucide-react → 自製 Icon 系統

### 重寫動機
| 項目 | 說明 |
|------|------|
| **Tree-shaking 問題** | 即使只用 10 個圖示，也可能打包更多 |
| **一致性** | 自製可確保風格統一 |

### 實作方針
```
src/components/icons/
├── Icon.jsx             # 通用 SVG 包裝器
├── icons/
│   ├── crop.svg
│   ├── download.svg
│   ├── folder.svg
│   └── ...
└── index.js             # 統一匯出
```

### 關鍵技術
- 只包含實際使用的 SVG
- Vite 的 `?react` import 直接當元件用
- 統一 size/color props

---

## 不建議重寫

| 套件 | 原因 |
|------|------|
| **react / react-dom** | 核心框架，無替代 |
| **tailwindcss** | 建置工具，不影響 runtime |
| **electron** | 平台框架 |
| **@modern-ffi/core** | 你自己的專案，持續維護 |

---

## 重寫順序建議

```
Phase 1: cn() 替換 clsx + tailwind-merge
         ↓ (1 天)
Phase 2: Icon 系統替換 lucide-react
         ↓ (2 天)
Phase 3: Motion 替換 framer-motion
         ↓ (3-5 天)
Phase 4: Cropper 替換 react-image-crop
         ↓ (5-7 天，最複雜)
```

---

## 預期效益

| 指標 | Before | After |
|------|--------|-------|
| Bundle Size | ~250KB | ~80KB |
| 外部依賴 | 8 個 | 4 個 |
| 原生整合 | 部分 | 完整 |
| 可控性 | 低 | 高 |

---

## 新專案結構

可考慮將重寫的模組獨立成 npm packages：

```
@repic/cn          - className 工具
@repic/motion      - 輕量動畫系統
@repic/cropper     - 圖片裁切元件
@repic/icons       - SVG 圖示集
```

這樣其他專案也能使用，達到更多 dogfooding 機會。

---

*計畫建立時間: 2026-01-02*
