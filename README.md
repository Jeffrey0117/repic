# Repic

A minimalist, high-performance Image Viewer & Editor with Screenshot capabilities.  
Built with **Electron**, **React**, and **TailwindCSS**.

## Features

- **Minimalist Viewer**: Drag & drop support, clean dark interface.
- **Image Editor**: iOS-style cropping with zoom and rotation support.
- **Screenshot Tool**: 
  - One-click screen capture.
  - Automatically imports captured screen into the editor for cropping.
- **Privacy Focused**: No telemetry, fully offline.

## Development

### Prerequisites
- Node.js (v18+)

### Run Locally (Web Mode)
```bash
npm run dev
```

### Run Desktop App (Electron)
```bash
npm run electron:dev
```

### Build for Windows
```bash
npm run electron:build
```
The executable will be in the `release` folder.

## Tech Stack
- **Framework**: Electron + Vite + React
- **Styling**: TailwindCSS v4
- **Cropping**: react-image-crop
- **Icons**: Lucide React
