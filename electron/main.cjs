const { app, BrowserWindow, Menu, ipcMain, dialog, nativeImage, session } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

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

// Extract image URL from HTML (for social media URLs that return HTML)
// Check if URL looks like a direct image URL
function looksLikeImageUrl(url) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const urlPath = url.split('?')[0].toLowerCase();
    return imageExtensions.some(ext => urlPath.endsWith(ext));
}

// Extract image URL from HTML page
// If originalUrl looks like an image URL, we prioritize finding the raw/direct link
// If originalUrl is a webpage URL, we use og:image
function extractImageFromHtml(html, originalUrl = '') {
    console.log('[extractImageFromHtml] HTML length:', html.length, 'originalUrl:', originalUrl.substring(0, 60));

    const isImageUrl = looksLikeImageUrl(originalUrl);
    console.log('[extractImageFromHtml] Original URL looks like image:', isImageUrl);

    // If the original URL looks like an image, find the raw/direct image link
    if (isImageUrl) {
        // Method 1: Find "raw" or "download" links with same filename
        const filename = originalUrl.split('/').pop()?.split('?')[0];
        console.log('[extractImageFromHtml] Looking for raw link to:', filename);

        // Look for raw.githubusercontent.com or similar raw links
        const rawLinkMatch = html.match(/href=["'](https?:\/\/[^"']*raw[^"']*\/[^"']*\.(jpg|jpeg|png|gif|webp|bmp|svg)[^"']*)["']/i)
            || html.match(/href=["'](https?:\/\/raw\.[^"']+)["']/i);
        if (rawLinkMatch) {
            console.log('[extractImageFromHtml] Found raw link:', rawLinkMatch[1]);
            return rawLinkMatch[1];
        }

        // Method 2: Find img tag with the actual image (largest or matching filename)
        const allImgMatches = html.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
        const imgUrls = allImgMatches.map(tag => {
            const srcMatch = tag.match(/src=["']([^"']+)["']/i);
            return srcMatch ? srcMatch[1] : null;
        }).filter(url => url && (url.startsWith('http') || url.startsWith('//')));

        console.log('[extractImageFromHtml] Found', imgUrls.length, 'img URLs');

        // Prefer URL containing the same filename or raw/cdn URLs
        const bestImg = imgUrls.find(url => filename && url.includes(filename))
            || imgUrls.find(url => url.includes('raw.') || url.includes('cdn.') || url.includes('githubusercontent'))
            || imgUrls.find(url => looksLikeImageUrl(url));

        if (bestImg) {
            // Handle protocol-relative URLs
            const fullUrl = bestImg.startsWith('//') ? 'https:' + bestImg : bestImg;
            console.log('[extractImageFromHtml] Found img src:', fullUrl);
            return fullUrl;
        }

        console.log('[extractImageFromHtml] No raw/direct image found for image URL');
        // Don't fall back to og:image for image URLs - it's usually wrong (like repo avatar)
        return null;
    }

    // For non-image URLs (social media posts, articles), use og:image approach
    // First try: Find img tags with instagram/threads CDN URLs (most accurate for posts)
    const imgMatches = html.match(/<img[^>]+src=["']([^"']*(?:instagram|fbcdn|cdninstagram)[^"']*)["']/gi);
    console.log('[extractImageFromHtml] Found', imgMatches?.length || 0, 'social media img matches');

    if (imgMatches && imgMatches.length > 0) {
        const urls = imgMatches.map(tag => {
            const srcMatch = tag.match(/src=["']([^"']+)["']/i);
            return srcMatch ? srcMatch[1] : null;
        }).filter(Boolean);

        const bestUrl = urls.find(url => url.includes('1080') || url.includes('1440'))
            || urls.find(url => url.includes('640') || url.includes('750'))
            || urls[0];

        if (bestUrl) {
            console.log('[extractImageFromHtml] Selected social media img:', bestUrl);
            return bestUrl;
        }
    }

    // Fallback: Try og:image (for social media/article pages)
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch) {
        console.log('[extractImageFromHtml] Found og:image:', ogMatch[1]);
        return ogMatch[1];
    }

    // Fallback: Try twitter:image
    const twitterMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twitterMatch) {
        console.log('[extractImageFromHtml] Found twitter:image:', twitterMatch[1]);
        return twitterMatch[1];
    }

    console.log('[extractImageFromHtml] No image URL found in HTML');
    return null;
}

// Convert special URLs to direct image URLs
function normalizeImageUrl(url) {
    // GitHub blob URL -> add ?raw=true to get direct image
    // https://github.com/user/repo/blob/branch/path/image.png
    // -> https://github.com/user/repo/blob/branch/path/image.png?raw=true
    if (url.match(/^https?:\/\/github\.com\/[^/]+\/[^/]+\/blob\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
        const rawUrl = url + '?raw=true';
        console.log('[normalizeImageUrl] GitHub blob -> raw:', rawUrl);
        return rawUrl;
    }

    // GitHub user content (already raw, no change needed)
    // raw.githubusercontent.com URLs are already direct

    return url;
}

// Download image from URL to temp file (with cache)
let requestCounter = 0;
function downloadToTemp(url) {
    // Normalize URL first (e.g., GitHub blob -> raw)
    const normalizedUrl = normalizeImageUrl(url);
    if (normalizedUrl !== url) {
        console.log('[downloadToTemp] URL normalized, using:', normalizedUrl);
        return downloadToTemp(normalizedUrl);
    }

    const reqId = ++requestCounter;
    console.log(`[downloadToTemp #${reqId}] START url:`, url.substring(0, 80) + '...');

    return new Promise((resolve, reject) => {
        // Check cache first
        const cached = downloadCache.get(url);
        if (cached && fs.existsSync(cached)) {
            console.log(`[downloadToTemp #${reqId}] CACHE HIT:`, cached);
            resolve(cached);
            return;
        }

        ensureTempDir();

        // Generate temp filename using proper hash for uniqueness
        const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
        const urlObj = new URL(url);
        const ext = path.extname(urlObj.pathname) || '.png';
        const filename = `drag-${urlHash}${ext}`;
        const tempPath = path.join(TEMP_DIR, filename);
        console.log(`[downloadToTemp #${reqId}] Hash: ${urlHash}, File: ${filename}`);

        // Check if file already exists (from previous session)
        if (fs.existsSync(tempPath)) {
            console.log(`[downloadToTemp #${reqId}] FILE EXISTS on disk:`, tempPath);
            downloadCache.set(url, tempPath);
            resolve(tempPath);
            return;
        }
        console.log(`[downloadToTemp #${reqId}] Downloading fresh...`);

        const protocol = url.startsWith('https') ? https : http;

        // Add browser-like headers to bypass restrictions
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': urlObj.origin + '/',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin'
            }
        };

        console.log('[downloadToTemp] Downloading:', url);

        const request = protocol.get(url, options, (response) => {
            console.log('[downloadToTemp] Response status:', response.statusCode, 'content-type:', response.headers['content-type']);

            // Follow redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                const redirectUrl = response.headers.location.startsWith('http')
                    ? response.headers.location
                    : new URL(response.headers.location, url).href;
                console.log('[downloadToTemp] Redirecting to:', redirectUrl);
                downloadToTemp(redirectUrl).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const contentType = response.headers['content-type'] || '';

            // If response is HTML, try to extract image URL
            if (contentType.includes('text/html')) {
                console.log(`[downloadToTemp #${reqId}] Got HTML, extracting image URL...`);
                let html = '';
                response.on('data', chunk => html += chunk);
                response.on('end', () => {
                    console.log(`[downloadToTemp #${reqId}] HTML received, length:`, html.length);
                    const imageUrl = extractImageFromHtml(html, url);
                    if (imageUrl) {
                        console.log(`[downloadToTemp #${reqId}] Found image URL:`, imageUrl.substring(0, 80) + '...');
                        // Recursively download the actual image, then cache with original URL
                        downloadToTemp(imageUrl).then((filePath) => {
                            // Cache original URL to the same file
                            console.log(`[downloadToTemp #${reqId}] Caching original URL to:`, filePath);
                            downloadCache.set(url, filePath);
                            resolve(filePath);
                        }).catch(reject);
                    } else {
                        console.log(`[downloadToTemp #${reqId}] NO IMAGE FOUND in HTML!`);
                        reject(new Error('No image found in HTML'));
                    }
                });
                return;
            }

            const fileStream = fs.createWriteStream(tempPath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                downloadCache.set(url, tempPath);
                console.log('[downloadToTemp] Saved to:', tempPath);
                resolve(tempPath);
            });

            fileStream.on('error', (err) => {
                fs.unlink(tempPath, () => {});
                reject(err);
            });
        });

        request.on('error', (err) => {
            console.error('[downloadToTemp] Error:', err.message);
            reject(err);
        });
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

    // Proxy image download - bypass browser restrictions
    ipcMain.handle('proxy-image', async (event, url) => {
        console.log('[proxy-image] Requested:', url);
        try {
            const filePath = await downloadToTemp(url);
            // Read the file and return as base64
            const buffer = fs.readFileSync(filePath);

            // Check if the file is actually an image (not HTML)
            const firstBytes = buffer.slice(0, 20).toString('utf-8');
            if (firstBytes.includes('<!DOCTYPE') || firstBytes.includes('<html')) {
                console.error('[proxy-image] Received HTML instead of image');
                return { success: false, error: 'URL returned HTML, not an image' };
            }

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            };
            const mimeType = mimeTypes[ext] || 'image/jpeg';
            const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
            console.log('[proxy-image] Success, size:', buffer.length);
            return { success: true, data: base64 };
        } catch (e) {
            console.error('[proxy-image] Error:', e.message);
            return { success: false, error: e.message };
        }
    });

    // Set always on top
    ipcMain.handle('set-always-on-top', (event, value) => {
        console.log('[set-always-on-top] Called with value:', value);
        if (mainWindow) {
            // Use 'floating' level for better Windows compatibility
            mainWindow.setAlwaysOnTop(value, 'floating');
            const actualValue = mainWindow.isAlwaysOnTop();
            console.log('[set-always-on-top] Result:', actualValue);
            return { success: true, isAlwaysOnTop: actualValue };
        }
        console.log('[set-always-on-top] Window not found');
        return { success: false, error: 'Window not found' };
    });

    // Get always on top status
    ipcMain.handle('get-always-on-top', () => {
        if (mainWindow) {
            const value = mainWindow.isAlwaysOnTop();
            console.log('[get-always-on-top] Current value:', value);
            return { success: true, isAlwaysOnTop: value };
        }
        return { success: false, error: 'Window not found' };
    });

    // Scrape images from webpage URL - helper function for recursive calls
    const scrapeImagesFromUrl = async (url, redirectCount = 0) => {
        // Prevent infinite redirect loops
        if (redirectCount > 5) {
            return { success: false, error: 'Too many redirects' };
        }

        console.log('[scrape-images] Scraping:', url);
        try {
            const protocol = url.startsWith('https') ? https : http;
            const urlObj = new URL(url);

            // Build headers with site-specific cookies
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            };

            // PTT requires over18 cookie for adult content boards
            if (urlObj.hostname.includes('ptt.cc')) {
                headers['Cookie'] = 'over18=1';
            }

            const options = { headers };

            return new Promise((resolve) => {
                const request = protocol.get(url, options, (response) => {
                    // Follow redirects
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        const redirectUrl = response.headers.location.startsWith('http')
                            ? response.headers.location
                            : new URL(response.headers.location, url).href;
                        console.log('[scrape-images] Redirecting to:', redirectUrl);
                        // Recursively call the helper function
                        scrapeImagesFromUrl(redirectUrl, redirectCount + 1).then(resolve);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        resolve({ success: false, error: `HTTP ${response.statusCode}` });
                        return;
                    }

                    let html = '';
                    response.on('data', chunk => html += chunk);
                    response.on('end', () => {
                        const images = new Set();

                        // Extract img src
                        const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
                        for (const match of imgMatches) {
                            let imgUrl = match[1];
                            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
                            else if (imgUrl.startsWith('/')) imgUrl = urlObj.origin + imgUrl;
                            else if (!imgUrl.startsWith('http')) continue;
                            // Filter out tiny images (icons, trackers)
                            if (!imgUrl.includes('1x1') && !imgUrl.includes('pixel') && !imgUrl.includes('tracking')) {
                                images.add(imgUrl);
                            }
                        }

                        // Extract srcset
                        const srcsetMatches = html.matchAll(/srcset=["']([^"']+)["']/gi);
                        for (const match of srcsetMatches) {
                            const srcset = match[1];
                            const urls = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
                            for (let imgUrl of urls) {
                                if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
                                else if (imgUrl.startsWith('/')) imgUrl = urlObj.origin + imgUrl;
                                else if (!imgUrl.startsWith('http')) continue;
                                images.add(imgUrl);
                            }
                        }

                        // Extract og:image
                        const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                        if (ogMatch) {
                            let imgUrl = ogMatch[1];
                            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
                            images.add(imgUrl);
                        }

                        // Extract background-image URLs
                        const bgMatches = html.matchAll(/background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/gi);
                        for (const match of bgMatches) {
                            let imgUrl = match[1];
                            if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
                            else if (imgUrl.startsWith('/')) imgUrl = urlObj.origin + imgUrl;
                            else if (!imgUrl.startsWith('http')) continue;
                            images.add(imgUrl);
                        }

                        const imageList = Array.from(images);
                        console.log('[scrape-images] Found', imageList.length, 'images');
                        resolve({ success: true, images: imageList });
                    });
                });

                request.on('error', (err) => {
                    console.error('[scrape-images] Error:', err.message);
                    resolve({ success: false, error: err.message });
                });
                request.setTimeout(15000, () => {
                    request.destroy();
                    resolve({ success: false, error: 'Timeout' });
                });
            });
        } catch (e) {
            console.error('[scrape-images] Error:', e.message);
            return { success: false, error: e.message };
        }
    };

    // Try Go scraper first (faster), fallback to Node.js
    const scrapeWithGo = (url) => {
        return new Promise((resolve) => {
            const scraperPath = path.join(__dirname, '..', 'scraper', 'scraper.exe');

            // Check if Go scraper exists
            if (!fs.existsSync(scraperPath)) {
                console.log('[scrape-images] Go scraper not found, using Node.js');
                resolve(null); // Will fallback to Node.js
                return;
            }

            console.log('[scrape-images] Using Go scraper');
            const proc = spawn(scraperPath, ['--url', url]);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0 && stdout) {
                    try {
                        const result = JSON.parse(stdout);
                        console.log('[scrape-images] Go scraper found', result.images?.length || 0, 'images');
                        resolve(result);
                    } catch (e) {
                        console.error('[scrape-images] Go scraper parse error:', e);
                        resolve(null);
                    }
                } else {
                    console.log('[scrape-images] Go scraper failed:', stderr || `exit code ${code}`);
                    resolve(null);
                }
            });

            proc.on('error', (err) => {
                console.error('[scrape-images] Go scraper spawn error:', err);
                resolve(null);
            });

            // Timeout after 20 seconds
            setTimeout(() => {
                proc.kill();
                resolve(null);
            }, 20000);
        });
    };

    // Batch download with Go (faster than Node.js Promise.all)
    const batchDownloadWithGo = (urls, outputDir, concurrency = 8) => {
        return new Promise((resolve) => {
            const scraperPath = path.join(__dirname, '..', 'scraper', 'scraper.exe');

            if (!fs.existsSync(scraperPath)) {
                console.log('[batch-download] Go downloader not found');
                resolve(null);
                return;
            }

            console.log('[batch-download] Using Go downloader for', urls.length, 'images');
            const startTime = Date.now();

            const proc = spawn(scraperPath, [
                '--download',
                '--urls', urls.join(','),
                '--output', outputDir,
                '--concurrency', String(concurrency)
            ]);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                const duration = Date.now() - startTime;
                if (code === 0 && stdout) {
                    try {
                        const result = JSON.parse(stdout);
                        console.log(`[batch-download] Go completed: ${result.completed}/${result.total} in ${duration}ms`);
                        resolve(result);
                    } catch (e) {
                        console.error('[batch-download] Parse error:', e);
                        resolve(null);
                    }
                } else {
                    console.log('[batch-download] Go failed:', stderr || `exit code ${code}`);
                    resolve(null);
                }
            });

            proc.on('error', (err) => {
                console.error('[batch-download] Spawn error:', err);
                resolve(null);
            });

            // Timeout after 60 seconds for batch downloads
            setTimeout(() => {
                proc.kill();
                console.log('[batch-download] Timeout');
                resolve(null);
            }, 60000);
        });
    };

    // Batch download IPC handler
    ipcMain.handle('batch-download-images', async (event, { urls, outputDir, concurrency }) => {
        console.log('[batch-download-images] Request:', urls.length, 'images to', outputDir);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Try Go first
        const goResult = await batchDownloadWithGo(urls, outputDir, concurrency || 8);
        if (goResult && goResult.success) {
            return goResult;
        }

        // Fallback to Node.js Promise.all
        console.log('[batch-download-images] Falling back to Node.js');
        const startTime = Date.now();
        const results = await Promise.all(urls.map(async (url, index) => {
            try {
                const filePath = await downloadToTemp(url);
                const filename = path.basename(filePath);
                const targetPath = path.join(outputDir, filename);
                fs.copyFileSync(filePath, targetPath);
                const stats = fs.statSync(targetPath);
                return { url, filename, success: true, size: stats.size };
            } catch (e) {
                return { url, filename: `image_${index}.jpg`, success: false, error: e.message };
            }
        }));

        const completed = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const duration = Date.now() - startTime;

        console.log(`[batch-download-images] Node.js completed: ${completed}/${urls.length} in ${duration}ms`);

        return {
            success: failed === 0,
            total: urls.length,
            completed,
            failed,
            items: results,
            duration_ms: duration
        };
    });

    // Scrape images from webpage URL - IPC handler
    ipcMain.handle('scrape-images', async (event, url) => {
        // Try Go scraper first
        const goResult = await scrapeWithGo(url);
        if (goResult && goResult.success) {
            return goResult;
        }

        // Fallback to Node.js scraper
        console.log('[scrape-images] Falling back to Node.js scraper');
        return scrapeImagesFromUrl(url);
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

    // Configure session to bypass third-party cookie restrictions
    const ses = session.defaultSession;

    // Remove Referer header and add necessary headers for image requests
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
        // Remove Referer to bypass hotlink protection
        delete details.requestHeaders['Referer'];
        // Add headers that some sites require
        details.requestHeaders['Accept'] = 'image/webp,image/apng,image/*,*/*;q=0.8';
        callback({ requestHeaders: details.requestHeaders });
    });

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
