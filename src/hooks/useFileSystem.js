import { useState, useEffect, useCallback } from 'react';

// Safe require for Electron
const electron = window.require ? window.require('electron') : null;
const fs = window.require ? window.require('fs') : null;
const path = window.require ? window.require('path') : null;
const os = window.require ? window.require('os') : null;

export const useFileSystem = () => {
    const [files, setFiles] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [currentPath, setCurrentPath] = useState(null);
    const [currentMetadata, setCurrentMetadata] = useState(null);
    const [thumbCache, setThumbCache] = useState({}); // Simple memory cache

    // Initial Load - Desktop
    useEffect(() => {
        if (!fs || !os || !path) return;
        try {
            const desktopPath = path.join(os.homedir(), 'Desktop');
            loadFolder(desktopPath);
        } catch (e) {
            console.error("Failed to load desktop", e);
        }
    }, []);

    const loadFolder = useCallback((folderPath) => {
        if (!fs || !path) return;

        fs.readdir(folderPath, (err, dirFiles) => {
            if (err) {
                console.error("Failed to read dir", err);
                return;
            }

            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
            const imageFiles = dirFiles
                .filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return imageExtensions.includes(ext);
                })
                .map(file => path.join(folderPath, file));

            if (imageFiles.length > 0) {
                setFiles(imageFiles);
                setCurrentIndex(0);
                setCurrentPath(folderPath); // Track current folder

                // Prefetch thumbnails (limited set for performance)
                imageFiles.slice(0, 30).forEach(file => {
                    if (!thumbCache[file]) {
                        const img = new Image();
                        img.onload = () => {
                            setThumbCache(prev => ({ ...prev, [file]: img.src }));
                        };
                        img.src = `file://${file}`;
                    }
                });
            } else {
                setFiles([]);
                setCurrentIndex(-1);
            }
        });
    }, [thumbCache]);

    const nextImage = useCallback(() => {
        if (files.length === 0) return null;
        setCurrentIndex(prev => (prev + 1) % files.length);
    }, [files]);

    const prevImage = useCallback(() => {
        if (files.length === 0) return null;
        setCurrentIndex(prev => (prev - 1 + files.length) % files.length);
    }, [files]);

    const selectImage = useCallback((index) => {
        if (index >= 0 && index < files.length) {
            setCurrentIndex(index);
        }
    }, [files]);

    const currentImage = files[currentIndex] || null;

    useEffect(() => {
        if (!currentImage || !electron) {
            setCurrentMetadata(null);
            return;
        }

        const fetchInfo = async () => {
            const info = await electron.ipcRenderer.invoke('get-file-info', currentImage);
            if (info) {
                // Also try to get image dimensions
                const img = new Image();
                img.onload = () => {
                    setCurrentMetadata({
                        ...info,
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    });
                };
                img.src = `file://${currentImage}`;
            }
        };

        fetchInfo();
    }, [currentImage]);

    return {
        files,
        currentIndex,
        currentImage,
        loadFolder,
        nextImage,
        prevImage,
        selectImage,
        currentPath,
        currentMetadata
    };
};
