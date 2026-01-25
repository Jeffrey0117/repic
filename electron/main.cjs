const { app, BrowserWindow, Menu, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// Temp directory for drag & drop
const TEMP_DIR = path.join(os.tmpdir(), 'repic-temp');
const TEMP_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Cache for downloaded URLs (URL -> tempFilePath)
const downloadCache = new Map();

// Ensure temp directory exists
function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}

// Clean up expired temp files
function cleanupTempFiles() {
    try {
        if (!fs.existsSync(TEMP_DIR)) return;
        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > TEMP_EXPIRY_MS) {
                fs.unlinkSync(filePath);
                console.log('[cleanup] Deleted expired temp file:', file);
            }
        }
    } catch (e) {
        console.error('[cleanup] Error:', e);
    }
}

// Download image from URL to temp file (with cache)
function downloadToTemp(url) {
    return new Promise((resolve, reject) => {
        // Check cache first
        const cached = downloadCache.get(url);
        if (cached && fs.existsSync(cached)) {
            console.log('[downloadToTemp] Using cached:', cached);
            resolve(cached);
            return;
        }

        ensureTempDir();

        // Generate temp filename using URL hash for consistency
        const urlHash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_').slice(0, 32);
        const urlObj = new URL(url);
        const ext = path.extname(urlObj.pathname) || '.png';
        const filename = `drag-${urlHash}${ext}`;
        const tempPath = path.join(TEMP_DIR, filename);

        // Check if file already exists (from previous session)
        if (fs.existsSync(tempPath)) {
            downloadCache.set(url, tempPath);
            resolve(tempPath);
            return;
        }

        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
            // Follow redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadToTemp(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(tempPath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                downloadCache.set(url, tempPath);
                resolve(tempPath);
            });

            fileStream.on('error', (err) => {
                fs.unlink(tempPath, () => {});
                reject(err);
            });
        });

        request.on('error', reject);
        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

// V8 Startup Optimization
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
// Enable V8 code cache for faster startup
app.commandLine.appendSwitch('js-flags', '--use-strict');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWindow;
let fileToOpen = null; // File path from command line or file association

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    // Handle second instance (when user opens another file while app is running)
    app.on('second-instance', (_event, commandLine) => {
        // Find image or .repic file from command line args
        const filePath = commandLine.find(arg => {
            if (arg.startsWith('-') || arg.startsWith('--')) return false;
            const ext = path.extname(arg).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.repic'].includes(ext);
        });

        if (filePath && mainWindow) {
            // Check if it's a .repic virtual image file
            if (filePath.toLowerCase().endsWith('.repic')) {
                handleRepicFile(filePath);
            } else {
                // Send file to renderer
                mainWindow.webContents.send('open-file', filePath);
            }
            // Focus the window
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Get file from command line args (first launch)
function getFileFromArgs() {
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    return args.find(arg => {
        if (arg.startsWith('-') || arg.startsWith('--')) return false;
        const ext = path.extname(arg).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.repic'].includes(ext);
    });
}

// Handle .repic virtual image file
async function handleRepicFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        // Validate .repic file format
        if (data.type !== 'virtual-image' || !data.url) {
            console.error('Invalid .repic file format');
            return;
        }

        // Get all .repic files in the same folder for navigation
        const folderPath = path.dirname(filePath);
        const allRepicFiles = fs.readdirSync(folderPath)
            .filter(f => f.toLowerCase().endsWith('.repic'))
            .map(f => path.join(folderPath, f));

        // Send to renderer
        if (mainWindow) {
            mainWindow.webContents.send('open-virtual-image', {
                ...data,
                filePath,
                folderPath,
                siblingFiles: allRepicFiles
            });
        }
    } catch (e) {
        console.error('Failed to handle .repic file:', e);
    }
}

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
        title: 'Repic',
        backgroundColor: '#000000',
        titleBarStyle: 'hiddenInset',
        icon: path.join(__dirname, '../repic-logo.png'),
        show: true, // Show immediately for faster perceived startup
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
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Send file to open when renderer is ready
    mainWindow.webContents.once('did-finish-load', () => {
        if (fileToOpen) {
            // Check if it's a .repic virtual image file
            if (fileToOpen.toLowerCase().endsWith('.repic')) {
                handleRepicFile(fileToOpen);
            } else {
                mainWindow.webContents.send('open-file', fileToOpen);
            }
            fileToOpen = null;
        }
    });

    // F12 to toggle DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }
    });
}

function setupIpcHandlers() {
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

    // Native crop - not available (using browser canvas instead)
    ipcMain.handle('native-crop', async () => {
        return { success: false, error: 'Native processing not available', fallback: true };
    });

    // Check if native processing is available
    ipcMain.handle('native-available', () => {
        return { available: false };
    });

    // Read .repic file
    ipcMain.handle('read-repic-file', async (event, filePath) => {
        if (!isValidPath(filePath)) {
            return { success: false, error: 'Invalid file path' };
        }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            return { success: true, data };
        } catch (e) {
            console.error('Failed to read .repic file:', e);
            return { success: false, error: e.message };
        }
    });

    // Write .repic file
    ipcMain.handle('write-repic-file', async (event, filePath, data) => {
        if (!isValidPath(filePath)) {
            return { success: false, error: 'Invalid file path' };
        }
        try {
            const content = JSON.stringify(data, null, 2);
            fs.writeFileSync(filePath, content, 'utf-8');
            return { success: true };
        } catch (e) {
            console.error('Failed to write .repic file:', e);
            return { success: false, error: e.message };
        }
    });

    // Write multiple .repic files (batch export)
    ipcMain.handle('write-repic-files-batch', async (event, { folderPath, files }) => {
        if (!isValidPath(folderPath)) {
            return { success: false, error: 'Invalid folder path' };
        }
        try {
            // Ensure folder exists
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            const results = [];
            for (const file of files) {
                const filePath = path.join(folderPath, file.filename);
                const content = JSON.stringify(file.data, null, 2);
                fs.writeFileSync(filePath, content, 'utf-8');
                results.push({ filename: file.filename, success: true });
            }
            return { success: true, count: results.length };
        } catch (e) {
            console.error('Failed to write .repic files:', e);
            return { success: false, error: e.message };
        }
    });

    // Start drag operation
    ipcMain.handle('start-drag', async (event, { imageSrc, fileName }) => {
        try {
            let filePath;

            if (imageSrc.startsWith('file://')) {
                // Local file - use directly
                filePath = imageSrc.replace('file://', '').split('?')[0];
            } else if (imageSrc.startsWith('http')) {
                // Web image - download to temp
                filePath = await downloadToTemp(imageSrc);
            } else if (imageSrc.startsWith('data:')) {
                // Base64 - save to temp
                ensureTempDir();
                const ext = imageSrc.includes('png') ? '.png' : '.jpg';
                const tempPath = path.join(TEMP_DIR, `drag-${Date.now()}${ext}`);
                const base64Content = imageSrc.split(',')[1];
                fs.writeFileSync(tempPath, Buffer.from(base64Content, 'base64'));
                filePath = tempPath;
            } else {
                return { success: false, error: 'Unsupported image source' };
            }

            // Create drag icon (thumbnail)
            const icon = nativeImage.createFromPath(filePath).resize({ width: 64, height: 64 });

            // Start the drag
            event.sender.startDrag({
                file: filePath,
                icon: icon
            });

            return { success: true };
        } catch (e) {
            console.error('[start-drag] Error:', e);
            return { success: false, error: e.message };
        }
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

app.whenReady().then(() => {
    // Get file from command line (for file association)
    fileToOpen = getFileFromArgs();

    // Clean up old temp files on startup
    cleanupTempFiles();

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
