import { useState, useEffect, useCallback } from 'react';
import { motion } from '../../lib/motion';

const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const MIN_WIDTH = 80;
const MAX_WIDTH = 200;
const DEFAULT_WIDTH = 120;

const electronAPI = window.electronAPI || null;

// Check if file is a .repic virtual image
const isRepicFile = (path) => path?.toLowerCase().endsWith('.repic');

// Cache for proxied images (URL -> base64)
const proxyCache = new Map();

export const Sidebar = ({
    files,
    currentIndex,
    onSelect,
    cacheVersion = 0,
    mode = 'local',
    isMultiSelectMode = false,
    selectedIds = new Set(),
    onToggleSelect,
    onEnterMultiSelect,
    onExitMultiSelect,
    onDeleteSelected,
    onDownloadSelected,
    onUploadSelected,
    onReorder
}) => {
    // Cache for .repic file data (url + crop)
    const [repicData, setRepicData] = useState({});
    // Drag reorder state
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    // Cache for proxied images (when direct load fails)
    const [proxiedUrls, setProxiedUrls] = useState({});
    // Track failed images (after proxy also failed)
    const [failedImages, setFailedImages] = useState(new Set());
    // Track loading images (to show placeholder instead of broken image)
    const [loadingImages, setLoadingImages] = useState(new Set());
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
            {/* Multi-select toolbar for album mode */}
            {mode === 'web' && (
                <div className="flex-shrink-0 px-2 py-2 border-b border-white/5">
                    {isMultiSelectMode ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={onExitMultiSelect}
                                    className="text-[10px] text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10"
                                >
                                    ✕
                                </button>
                                <span className="text-[10px] text-white/60">
                                    {selectedIds.size} 選中
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={onDownloadSelected}
                                    disabled={selectedIds.size === 0}
                                    className="flex-1 text-[10px] text-blue-400 hover:text-blue-300 px-1 py-1 rounded hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="下載"
                                >
                                    ↓
                                </button>
                                <button
                                    onClick={onUploadSelected}
                                    disabled={selectedIds.size === 0}
                                    className="flex-1 text-[10px] text-green-400 hover:text-green-300 px-1 py-1 rounded hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="上傳"
                                >
                                    ↑
                                </button>
                                <button
                                    onClick={onDeleteSelected}
                                    disabled={selectedIds.size === 0}
                                    className="flex-1 text-[10px] text-red-400 hover:text-red-300 px-1 py-1 rounded hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="刪除"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={onEnterMultiSelect}
                            className="w-full text-[10px] text-white/50 hover:text-white/80 py-1 rounded hover:bg-white/5 transition-colors"
                        >
                            多選
                        </button>
                    )}
                </div>
            )}

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
                    const originalUrl = isWeb
                        ? fileUrl
                        : isRepic
                            ? (repicInfo?.url || '')
                            : `file://${file}?v=${cacheVersion}`;

                    // Use proxied URL if available (for hotlink protected images)
                    const imgSrc = (isWeb && proxiedUrls[fileUrl]) ? proxiedUrls[fileUrl] : originalUrl;

                    // Check if image failed to load
                    const isFailed = isWeb && failedImages.has(fileUrl);

                    // Get crop data: from .repic file or from web album image object
                    const crop = isRepic
                        ? repicInfo?.crop
                        : (isWeb && typeof file === 'object' ? file.crop : null);

                    // Calculate clip-path for cropped thumbnails
                    const clipPath = crop
                        ? `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`
                        : undefined;

                    // Get image id for multi-select
                    const imageId = isWeb && typeof file === 'object' ? file.id : null;
                    const isSelected = imageId && selectedIds.has(imageId);

                    // Drag reorder handlers (for album mode)
                    const canReorder = isWeb && onReorder && !isMultiSelectMode;
                    const isDragging = dragIndex === index;
                    const isDragOver = dragOverIndex === index;

                    return (
                        <motion.div
                            key={isWeb ? (typeof file === 'string' ? file : file.id) : `${file}-${cacheVersion}`}
                            whileHover={{ scale: isMultiSelectMode || isDragging ? 1 : 1.05 }}
                            whileTap={{ scale: isMultiSelectMode ? 1 : 0.95 }}
                            onClick={() => {
                                if (isMultiSelectMode && imageId) {
                                    onToggleSelect(imageId);
                                } else if (!isDragging) {
                                    onSelect(index);
                                }
                            }}
                            draggable={canReorder}
                            onDragStart={(e) => {
                                if (canReorder) {
                                    setDragIndex(index);
                                    e.dataTransfer.effectAllowed = 'move';
                                }
                            }}
                            onDragOver={(e) => {
                                if (canReorder && dragIndex !== null && dragIndex !== index) {
                                    e.preventDefault();
                                    setDragOverIndex(index);
                                }
                            }}
                            onDragLeave={() => {
                                if (canReorder) {
                                    setDragOverIndex(null);
                                }
                            }}
                            onDrop={(e) => {
                                if (canReorder && dragIndex !== null && dragIndex !== index) {
                                    e.preventDefault();
                                    onReorder(dragIndex, index);
                                    setDragIndex(null);
                                    setDragOverIndex(null);
                                }
                            }}
                            onDragEnd={() => {
                                setDragIndex(null);
                                setDragOverIndex(null);
                            }}
                            className={`relative cursor-pointer group flex flex-col items-center ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'scale-110' : ''}`}
                        >
                            <div className="text-[10px] text-white/40 truncate w-full mb-1 text-center group-hover:text-white/80 transition-colors">
                                {index + 1}
                            </div>

                            <div
                                className={`
                                    rounded-lg overflow-hidden border-2 transition-all duration-200 shadow-lg bg-black/50 relative
                                    ${isSelected ? 'border-green-500 ring-2 ring-green-500/30' : isActive ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-transparent group-hover:border-white/30'}
                                    ${isDragOver ? 'border-primary border-dashed' : ''}
                                `}
                                style={{ width: `${width - 24}px`, height: `${width - 24}px` }}
                                draggable={!isMultiSelectMode && !canReorder}
                                onDragStart={(e) => {
                                    if (!canReorder) {
                                        e.preventDefault();
                                        // Use Electron's native drag for system-level drag
                                        if (electronAPI?.startDrag) {
                                            electronAPI.startDrag(imgSrc, fileName);
                                        }
                                    }
                                }}
                            >
                                {isFailed ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-black/30 text-white/40">
                                        <span className="text-sm">✕</span>
                                        <span className="text-[8px] mt-0.5">暫不支援</span>
                                    </div>
                                ) : imgSrc ? (
                                    <>
                                        {/* Loading placeholder - shows while image loads */}
                                        {isWeb && loadingImages.has(fileUrl) && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                                            </div>
                                        )}
                                        <img
                                            src={imgSrc}
                                            alt=""
                                            className={`w-full h-full object-contain pointer-events-none transition-opacity ${isWeb && loadingImages.has(fileUrl) ? 'opacity-0' : 'opacity-100'}`}
                                            style={clipPath ? { clipPath } : undefined}
                                            loading="lazy"
                                            draggable={false}
                                            referrerPolicy="no-referrer"
                                            onLoadStart={() => {
                                                if (isWeb && !proxiedUrls[fileUrl]) {
                                                    setLoadingImages(prev => new Set([...prev, fileUrl]));
                                                }
                                            }}
                                            onLoad={() => {
                                                setLoadingImages(prev => {
                                                    const newSet = new Set(prev);
                                                    newSet.delete(fileUrl);
                                                    return newSet;
                                                });
                                            }}
                                            onError={async (e) => {
                                                // Remove from loading
                                                setLoadingImages(prev => {
                                                    const newSet = new Set(prev);
                                                    newSet.delete(fileUrl);
                                                    return newSet;
                                                });
                                                // If image fails to load and we haven't tried proxy yet
                                                if (isWeb && originalUrl.startsWith('http') && !proxiedUrls[fileUrl] && electronAPI?.proxyImage) {
                                                    setLoadingImages(prev => new Set([...prev, fileUrl]));
                                                    console.log('[Sidebar] Image failed, trying proxy:', originalUrl);
                                                    const result = await electronAPI.proxyImage(originalUrl);
                                                    setLoadingImages(prev => {
                                                        const newSet = new Set(prev);
                                                        newSet.delete(fileUrl);
                                                        return newSet;
                                                    });
                                                    if (result.success) {
                                                        setProxiedUrls(prev => ({ ...prev, [fileUrl]: result.data }));
                                                    } else {
                                                        setFailedImages(prev => new Set([...prev, fileUrl]));
                                                    }
                                                } else if (isWeb && proxiedUrls[fileUrl]) {
                                                    setFailedImages(prev => new Set([...prev, fileUrl]));
                                                }
                                            }}
                                        />
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-black/20">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                                    </div>
                                )}
                                {/* Selection checkbox indicator */}
                                {isMultiSelectMode && imageId && (
                                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-green-500 text-white' : 'bg-black/50 border border-white/30 text-transparent'}`}>
                                        ✓
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
