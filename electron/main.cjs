const { app, BrowserWindow, Menu, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#000000',
        titleBarStyle: 'hiddenInset',
        icon: path.join(__dirname, '../repic-logo.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    Menu.setApplicationMenu(null);

    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:8888');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Handle port fallback manually if needed, but wait-on usually handles 5174.
    // Ideally passed via env var.
}

function setupIpcHandlers() {
    ipcMain.handle('hide-window', () => {
        mainWindow.minimize();
        mainWindow.hide();
        return true;
    });

    ipcMain.handle('show-window', () => {
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
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('get-file-info', async (event, filePath) => {
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
        try {
            const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
            fs.writeFileSync(filePath, buffer);
            return { success: true };
        } catch (e) {
            console.error("Failed to save file", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath,
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
            ]
        });
        return result;
    });

    // Batch crop - save cropped image data to file
    ipcMain.handle('batch-crop-save', async (event, { filePath, base64Data, outputMode, originalPath, customDir }) => {
        console.log('[batch-crop-save] Received:', { filePath, outputMode, originalPath, customDir, hasBase64: !!base64Data });
        try {
            let targetPath = filePath;

            if (outputMode === 'custom' && customDir) {
                // Save to user-selected directory
                if (!fs.existsSync(customDir)) {
                    fs.mkdirSync(customDir, { recursive: true });
                }
                targetPath = path.join(customDir, path.basename(originalPath));
            } else if (outputMode === 'folder') {
                // Create "cropped" subfolder
                const dir = path.dirname(originalPath);
                const croppedDir = path.join(dir, 'cropped');
                if (!fs.existsSync(croppedDir)) {
                    fs.mkdirSync(croppedDir, { recursive: true });
                }
                targetPath = path.join(croppedDir, path.basename(originalPath));
            }

            console.log('[batch-crop-save] Writing to:', targetPath);
            const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
            fs.writeFileSync(targetPath, buffer);
            console.log('[batch-crop-save] Success!');
            return { success: true, path: targetPath };
        } catch (e) {
            console.error("[batch-crop-save] Failed:", e.message);
            return { success: false, error: e.message };
        }
    });
}

app.whenReady().then(() => {
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
