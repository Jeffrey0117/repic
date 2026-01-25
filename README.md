# Repic

A powerful, minimalist Image Viewer & Manager with virtual image support.
Built with **Electron**, **React**, and **TailwindCSS**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

### Core
- **Local Folder Browsing** - Open folders and navigate images with keyboard
- **Web Albums** - Create albums with web image URLs, stored locally
- **Virtual Images (.repic)** - Lightweight shortcut files pointing to web images
- **Non-destructive Crop** - Virtual crop that preserves original image
- **Batch Crop** - Apply same crop ratio to multiple images

### Image Operations
- **Upload to Cloud** - One-click upload to urusai.cc, URL auto-copied
- **Copy to Clipboard** - Copy image (with crop applied) to clipboard
- **Drag & Drop Export** - Drag images to other apps (Finder, Explorer, etc.)
- **Multi-select Delete** - Batch delete album images

### UX
- **Scroll Zoom** - Zoom toward mouse position
- **Drag Pan** - Pan when zoomed in
- **Keyboard Navigation** - Arrow keys to navigate
- **Loading States** - Spinner instead of broken image flash
- **Hotlink Bypass** - Proxy for protected images (Instagram, etc.)
- **i18n** - English / Traditional Chinese

### Virtual Image System
The `.repic` format stores:
- Web image URL
- Optional crop parameters (non-destructive)
- Album metadata

Export albums as `.repic` files for lightweight local access without downloading full images.

---

## Development

### Prerequisites
- Node.js v18+

### Run Desktop App
```bash
npm run electron:dev
```

### Build for Windows
```bash
npm run electron:build
```
Output: `release/` folder

---

## Tech Stack
- **Framework**: Electron + Vite + React
- **Styling**: TailwindCSS v4
- **Animation**: Framer Motion
- **Cropping**: react-image-crop
- **Icons**: Lucide React

---

## Changelog

### 2025-01-25
- **feat**: Multi-select batch delete for album images
- **feat**: Loading spinner, no broken image flash
- **fix**: Hash collision for Instagram CDN URLs (MD5)
- **fix**: GitHub blob URL normalization

### 2025-01-24
- **feat**: Drag & drop images from web browser to album
- **feat**: Delete button for album images
- **feat**: Cropped thumbnails in sidebar
- **feat**: Virtual image cropping (non-destructive)
- **feat**: Copy to clipboard with crop applied
- **feat**: Drag to other apps
- **perf**: Cache downloaded images

### 2025-01-23
- **feat**: Virtual image (.repic) file support
- **feat**: Export albums as .repic shortcuts
- **feat**: Collapsible album sidebar
- **feat**: Web image info panel

### Earlier
- **feat**: Web albums with localStorage persistence
- **feat**: Upload to urusai.cc cloud
- **feat**: Batch crop with custom output folder
- **feat**: Screenshot capture
- **feat**: i18n (EN/ZH-TW)

---

## Roadmap

### Phase 1 - Core UX ✅
- [x] Remember last opened folder
- [x] Preload adjacent images (3 ahead/behind)
- [x] Paste image from clipboard (Ctrl+V)
- [x] Drag to reorder album images

### Phase 2 - Batch Operations
- [x] Batch download (multi-select → save all)
- [x] Batch upload (multi-select → upload all)
- [ ] Batch virtualize (local → upload → .repic, option to delete local)
- [ ] Batch materialize (.repic → download → local, option to delete .repic)

### Phase 3 - Performance
- [ ] Thumbnail cache (avoid re-scaling large images)
- [ ] Virtual scroll for large image lists
- [ ] Offline cache for web album images

### Phase 4 - Advanced
- [x] Album import/export (JSON backup)
- [ ] Sidebar position toggle (left / bottom)

---

## License

MIT
