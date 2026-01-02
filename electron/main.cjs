const { app, BrowserWindow, Menu, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Native image processing via @modern-ffi/core + libvips
let libvips = null;
let nativeAvailable = false;

let mainWindow;

// Input validation helpers
function isValidPath(filePath) {
    if (typeof filePath !== 'string') return false;
    if (filePath.length === 0 || filePath.length > 32767) return false;
    // Note: Path traversal protection is handled by the preload script's limited API
    return true;
}

function isValidBase64Data(data) {
    if (typeof data !== 'string') return false;
    return data.startsWith('data:image/');
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#000000',
        titleBarStyle: 'hiddenInset',
        icon: path.join(__dirname, '../repic-logo.png'),
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Allow Node.js modules in preload script
            webSecurity: false // Keep false for local file access (file:// protocol)
        }
    });

    Menu.setApplicationMenu(null);

    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Show window when ready to avoid white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Open DevTools in dev mode for debugging
        if (!app.isPackaged) {
            mainWindow.webContents.openDevTools();
        }
    });
}

function setupIpcHandlers() {
    ipcMain.handle('hide-window', () => {
        if (!mainWindow) return false;
        mainWindow.minimize();
        mainWindow.hide();
        return true;
    });

    ipcMain.handle('show-window', () => {
        if (!mainWindow) return false;
        mainWindow.show();
        mainWindow.focus();
        return true;
    });

    ipcMain.handle('get-desktop-sources', async () => {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: width * primaryDisplay.scaleFactor,
                height: height * primaryDisplay.scaleFactor
            }
        });

        return sources.map(s => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL()
        }));
    });

    ipcMain.handle('select-directory', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('get-file-info', async (event, filePath) => {
        // Input validation
        if (!isValidPath(filePath)) {
            console.error('Invalid file path provided to get-file-info');
            return null;
        }

        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                birthtime: stats.birthtime,
                mtime: stats.mtime
            };
        } catch (e) {
            console.error("Failed to get file info", e);
            return null;
        }
    });

    ipcMain.handle('save-file', async (event, { filePath, base64Data }) => {
        // Input validation
        if (!isValidPath(filePath)) {
            return { success: false, error: 'Invalid file path' };
        }
        if (!isValidBase64Data(base64Data)) {
            return { success: false, error: 'Invalid image data format' };
        }

        try {
            const base64Content = base64Data.split(',')[1];
            if (!base64Content) {
                return { success: false, error: 'Invalid base64 content' };
            }
            const buffer = Buffer.from(base64Content, 'base64');
            fs.writeFileSync(filePath, buffer);
            return { success: true };
        } catch (e) {
            console.error("Failed to save file", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
        if (!mainWindow) return { canceled: true };

        // Basic validation for defaultPath
        if (defaultPath && typeof defaultPath !== 'string') {
            defaultPath = undefined;
        }

        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath,
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
            ]
        });
        return result;
    });

    // Native crop using libvips + @modern-ffi/core (fast, low memory)
    ipcMain.handle('native-crop', async (event, { inputPath, outputPath, crop }) => {
        console.log('[native-crop] Received:', { inputPath, outputPath, crop });

        if (!isValidPath(inputPath) || !isValidPath(outputPath)) {
            return { success: false, error: 'Invalid path' };
        }

        // Try native libvips first
        if (nativeAvailable && libvips) {
            const result = await libvips.cropImage(inputPath, outputPath, crop);
            console.log('[native-crop] libvips result:', result);
            return result;
        }

        // Fallback: not available
        return { success: false, error: 'Native processing not available', fallback: true };
    });

    // Check if native processing is available
    ipcMain.handle('native-available', () => {
        return { available: nativeAvailable };
    });

    // Batch crop - save cropped image data to file
    ipcMain.handle('batch-crop-save', async (event, { filePath, base64Data, outputMode, originalPath, customDir }) => {
        console.log('[batch-crop-save] Received:', { filePath, outputMode, originalPath, customDir, hasBase64: !!base64Data });

        // Input validation
        if (!isValidPath(filePath)) {
            return { success: false, error: 'Invalid file path' };
        }
        if (!isValidBase64Data(base64Data)) {
            return { success: false, error: 'Invalid image data format' };
        }
        if (originalPath && !isValidPath(originalPath)) {
            return { success: false, error: 'Invalid original path' };
        }
        if (customDir && !isValidPath(customDir)) {
            return { success: false, error: 'Invalid custom directory' };
        }
        if (!['replace', 'folder', 'custom'].includes(outputMode)) {
            return { success: false, error: 'Invalid output mode' };
        }

        try {
            let targetPath = filePath;

            if (outputMode === 'custom' && customDir) {
                // Save to user-selected directory
                if (!fs.existsSync(customDir)) {
                    fs.mkdirSync(customDir, { recursive: true });
                }
                targetPath = path.join(customDir, path.basename(originalPath || filePath));
            } else if (outputMode === 'folder') {
                // Create "cropped" subfolder
                const dir = path.dirname(originalPath || filePath);
                const croppedDir = path.join(dir, 'cropped');
                if (!fs.existsSync(croppedDir)) {
                    fs.mkdirSync(croppedDir, { recursive: true });
                }
                targetPath = path.join(croppedDir, path.basename(originalPath || filePath));
            }

            console.log('[batch-crop-save] Writing to:', targetPath);
            const base64Content = base64Data.split(',')[1];
            if (!base64Content) {
                return { success: false, error: 'Invalid base64 content' };
            }
            const buffer = Buffer.from(base64Content, 'base64');
            fs.writeFileSync(targetPath, buffer);
            console.log('[batch-crop-save] Success!');
            return { success: true, path: targetPath };
        } catch (e) {
            console.error("[batch-crop-save] Failed:", e.message);
            return { success: false, error: e.message };
        }
    });
}

app.whenReady().then(async () => {
    // Try to initialize native libvips
    try {
        libvips = require('./native/libvips.cjs');
        nativeAvailable = await libvips.init();
        console.log('[main] Native libvips available:', nativeAvailable);
    } catch (e) {
        console.warn('[main] Native libvips not available:', e.message);
        nativeAvailable = false;
    }

    setupIpcHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
