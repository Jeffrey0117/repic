import { useState, useEffect, useCallback } from 'react';
import { motion } from '../../lib/motion';

const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const MIN_WIDTH = 80;
const MAX_WIDTH = 200;
const DEFAULT_WIDTH = 120;

const electronAPI = window.electronAPI || null;

// Check if file is a .repic virtual image
const isRepicFile = (path) => path?.toLowerCase().endsWith('.repic');

export const Sidebar = ({ files, currentIndex, onSelect, cacheVersion = 0, mode = 'local' }) => {
    // Cache for .repic file data (url + crop)
    const [repicData, setRepicData] = useState({});
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
                return parsed;
            }
        }
        return DEFAULT_WIDTH;
    });
    const [isResizing, setIsResizing] = useState(false);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e) => {
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            localStorage.setItem(SIDEBAR_WIDTH_KEY, width.toString());
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, width]);

    // Load .repic file data (url + crop) for local mode
    // Reset cache when cacheVersion changes (after crop save)
    useEffect(() => {
        if (mode !== 'local' || !electronAPI) return;

        // Clear cache and reload all repic files
        const loadRepicData = async () => {
            const newData = {};
            for (const file of files) {
                if (isRepicFile(file)) {
                    const result = electronAPI.readFile(file);
                    if (result && typeof result === 'object' && result.url) {
                        newData[file] = {
                            url: result.url,
                            crop: result.crop || null
                        };
                    }
                }
            }
            setRepicData(newData);
        };

        loadRepicData();
    }, [files, mode, cacheVersion]);

    return (
        <div
            className="h-full bg-surface/30 backdrop-blur-xl border-r border-white/5 flex flex-col overflow-hidden relative"
            style={{ width: `${width}px` }}
        >
            <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-2 space-y-3">
                {files.map((file, index) => {
                    const isActive = index === currentIndex;
                    // For local mode: file is a path, extract filename
                    // For web mode: file is a URL or object with url property
                    const isWeb = mode === 'web';
                    const fileUrl = isWeb ? (typeof file === 'string' ? file : file.url) : file;
                    const fileName = isWeb
                        ? (typeof file === 'string' ? file.split('/').pop()?.split('?')[0] : file.url?.split('/').pop()?.split('?')[0]) || `Image ${index + 1}`
                        : file.split(/[\\/]/).pop();

                    // Handle .repic files in local mode - use cached data
                    const isRepic = !isWeb && isRepicFile(file);
                    const repicInfo = isRepic ? repicData[file] : null;
                    const imgSrc = isWeb
                        ? fileUrl
                        : isRepic
                            ? (repicInfo?.url || '')
                            : `file://${file}?v=${cacheVersion}`;

                    // Get crop data: from .repic file or from web album image object
                    const crop = isRepic
                        ? repicInfo?.crop
                        : (isWeb && typeof file === 'object' ? file.crop : null);

                    // Calculate clip-path for cropped thumbnails
                    const clipPath = crop
                        ? `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`
                        : undefined;

                    return (
                        <motion.div
                            key={isWeb ? (typeof file === 'string' ? file : file.id) : `${file}-${cacheVersion}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onSelect(index)}
                            className={`relative cursor-pointer group flex flex-col items-center`}
                        >
                            <div className="text-[10px] text-white/40 truncate w-full mb-1 text-center group-hover:text-white/80 transition-colors">
                                {index + 1}
                            </div>

                            <div
                                className={`
                                    rounded-lg overflow-hidden border-2 transition-all duration-200 shadow-lg bg-black/50
                                    ${isActive ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-transparent group-hover:border-white/30'}
                                `}
                                style={{ width: `${width - 24}px`, height: `${width - 24}px` }}
                                draggable
                                onDragStart={(e) => {
                                    e.preventDefault();
                                    // Use Electron's native drag for system-level drag
                                    if (electronAPI?.startDrag) {
                                        electronAPI.startDrag(imgSrc, fileName);
                                    }
                                }}
                            >
                                {imgSrc ? (
                                    <img
                                        src={imgSrc}
                                        alt=""
                                        className="w-full h-full object-contain pointer-events-none"
                                        style={clipPath ? { clipPath } : undefined}
                                        loading="lazy"
                                        draggable={false}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                        Loading...
                                    </div>
                                )}
                            </div>

                            <div className={`mt-1.5 text-[10px] truncate w-full px-1 text-center font-medium ${isActive ? 'text-primary' : 'text-white/70'}`}>
                                {fileName}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={handleMouseDown}
                className={`
                    absolute top-0 right-0 w-1 h-full cursor-col-resize
                    transition-colors duration-150
                    ${isResizing ? 'bg-primary' : 'bg-transparent hover:bg-white/30'}
                `}
            />
        </div>
    );
};
