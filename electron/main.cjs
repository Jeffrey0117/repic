const { app, BrowserWindow, Menu, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#000000',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    Menu.setApplicationMenu(null);

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    // Try multiple ports if default is busy, but for now hardcode or use arg
    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    // Handle port fallback manually if needed, but wait-on usually handles 5174.
    // Ideally passed via env var.
}

ipcMain.handle('hide-window', () => {
    mainWindow.minimize(); // or hide()
    // mainWindow.hide() is better for screenshot so it completely disappears.
    // But minimize works too. Let's use hide to be instant.
    mainWindow.hide();
    return true;
});

ipcMain.handle('show-window', () => {
    mainWindow.show();
    mainWindow.focus();
    return true;
});

ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources; // Can't pass full objects properly sometimes, but basic info is fine
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

app.whenReady().then(() => {
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
