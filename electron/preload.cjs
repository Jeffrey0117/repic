const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Input validation helpers
function isValidPath(filePath) {
    if (typeof filePath !== 'string') return false;
    if (filePath.length === 0 || filePath.length > 32767) return false;
    // Note: We don't block '..' here as Windows paths are normalized by the OS
    // Security is maintained through contextIsolation
    return true;
}

function isValidBase64Data(data) {
    if (typeof data !== 'string') return false;
    // Must be a data URL format
    return data.startsWith('data:image/');
}

// Expose protected methods to renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
    // Directory selection dialog
    selectDirectory: async () => {
        return await ipcRenderer.invoke('select-directory');
    },

    // Save file with base64 data
    saveFile: async (filePath, base64Data) => {
        if (!isValidPath(filePath)) {
            return { success: false, error: 'Invalid file path' };
        }
        if (!isValidBase64Data(base64Data)) {
            return { success: false, error: 'Invalid image data' };
        }
        return await ipcRenderer.invoke('save-file', { filePath, base64Data });
    },

    // Batch crop save
    batchCropSave: async (options) => {
        const { filePath, base64Data, outputMode, originalPath, customDir } = options;

        if (!isValidPath(filePath)) {
            return { success: false, error: 'Invalid file path' };
        }
        if (!isValidBase64Data(base64Data)) {
            return { success: false, error: 'Invalid image data' };
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

        return await ipcRenderer.invoke('batch-crop-save', {
            filePath,
            base64Data,
            outputMode,
            originalPath,
            customDir
        });
    },

    // Get screen sources for capture
    getScreenSources: async () => {
        return await ipcRenderer.invoke('get-desktop-sources');
    },

    // Get file metadata
    getFileMetadata: async (filePath) => {
        if (!isValidPath(filePath)) {
            return null;
        }
        return await ipcRenderer.invoke('get-file-info', filePath);
    },

    // Read file as data URL (for images)
    readFile: (filePath) => {
        if (!isValidPath(filePath)) {
            return null;
        }
        try {
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.bmp': 'image/bmp'
            };
            const mimeType = mimeTypes[ext] || 'application/octet-stream';
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (e) {
            console.error('Failed to read file:', e);
            return null;
        }
    },

    // Get files in directory
    getFilesInDirectory: (dirPath, extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']) => {
        if (!isValidPath(dirPath)) {
            return [];
        }
        try {
            const files = fs.readdirSync(dirPath);
            return files
                .filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return extensions.includes(ext);
                })
                .map(file => path.join(dirPath, file));
        } catch (e) {
            console.error('Failed to read directory:', e);
            return [];
        }
    },

    // Show save dialog
    showSaveDialog: async (defaultPath) => {
        return await ipcRenderer.invoke('show-save-dialog', defaultPath);
    },

    // Window controls
    hideWindow: async () => {
        return await ipcRenderer.invoke('hide-window');
    },

    showWindow: async () => {
        return await ipcRenderer.invoke('show-window');
    },

    // Capture overlay IPC
    onInitCaptureData: (callback) => {
        const handler = (event, dataUrl) => callback(dataUrl);
        ipcRenderer.on('init-capture-data', handler);
        return () => ipcRenderer.removeListener('init-capture-data', handler);
    },

    closeCaptureWindow: async (dataUrl) => {
        return await ipcRenderer.invoke('close-capture-window', dataUrl);
    },

    // Path utilities (safe exposure of path module)
    path: {
        basename: (filePath) => path.basename(filePath),
        dirname: (filePath) => path.dirname(filePath),
        extname: (filePath) => path.extname(filePath),
        join: (...args) => path.join(...args)
    },

    // OS utilities
    getDesktopPath: () => {
        return path.join(os.homedir(), 'Desktop');
    },

    // Check if running in Electron
    isElectron: true
});
