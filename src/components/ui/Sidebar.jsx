import { useState, useEffect, useCallback, useRef } from 'react';
import { getThumbnail, saveThumbnail, generateThumbnail } from '../../utils/thumbnailCache';
import { getCachedImage, cacheImage } from '../../utils/offlineCache';
import { preloadImages, preloadThumbnails, getCached } from '../../utils/imageLoader';
import { LazyImage } from './LazyImage';

const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const SIDEBAR_HEIGHT_KEY = 'sidebar-height';
const MIN_WIDTH = 80;
const MAX_WIDTH = 200;
const DEFAULT_WIDTH = 120;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 300;
const DEFAULT_HEIGHT = 160;

const electronAPI = window.electronAPI || null;

// Check if file is a .repic virtual image
const isRepicFile = (path) => path?.toLowerCase().endsWith('.repic');

// Cache for proxied images (URL -> base64)
const proxyCache = new Map();

// Memory cache for thumbnails (faster than IndexedDB for current session)
const thumbMemCache = new Map();

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
    onReorder,
    position = 'left' // 'left' or 'bottom'
}) => {
    const isHorizontal = position === 'bottom';
    const scrollContainerRef = useRef(null);
    // Cache for .repic file data (url + crop)
    const [repicData, setRepicData] = useState({});
    // Reorder mode (separate from multi-select)
    const [isReorderMode, setIsReorderMode] = useState(false);
    // Drag reorder state
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    // Drag scroll state
    const [isDragScrolling, setIsDragScrolling] = useState(false);
    const [dragScrollStart, setDragScrollStart] = useState({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
    // Track failed images (after proxy also failed)
    const [failedImages, setFailedImages] = useState(new Set());
    // Cached thumbnails for local files
    const [cachedThumbs, setCachedThumbs] = useState({});
    // Separate width (for left) and height (for bottom)
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
    const [height, setHeight] = useState(() => {
        const saved = localStorage.getItem(SIDEBAR_HEIGHT_KEY);
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= MIN_HEIGHT && parsed <= MAX_HEIGHT) {
                return parsed;
            }
        }
        return DEFAULT_HEIGHT;
    });
    const [isResizing, setIsResizing] = useState(false);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Skip if focus is on input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const isNext = isHorizontal ? e.key === 'ArrowRight' : e.key === 'ArrowDown';
            const isPrev = isHorizontal ? e.key === 'ArrowLeft' : e.key === 'ArrowUp';

            if (isNext && currentIndex < files.length - 1) {
                e.preventDefault();
                onSelect(currentIndex + 1);
            } else if (isPrev && currentIndex > 0) {
                e.preventDefault();
                onSelect(currentIndex - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isHorizontal, currentIndex, files.length, onSelect]);

    // Drag to scroll (carousel effect)
    const handleScrollDragStart = useCallback((e) => {
        if (isReorderMode || isMultiSelectMode) return;
        // Don't start drag scroll if clicking on a thumbnail (let it select)
        if (e.target.closest('[data-thumb]')) return;

        const container = scrollContainerRef.current;
        if (!container) return;

        e.preventDefault();
        setIsDragScrolling(true);
        setDragScrollStart({
            x: e.clientX,
            y: e.clientY,
            scrollX: container.scrollLeft,
            scrollY: container.scrollTop
        });
    }, [isReorderMode, isMultiSelectMode]);

    // Global cleanup for drag scrolling - ensures state is always cleaned up
    useEffect(() => {
        if (!isDragScrolling) return;

        const handleMouseMove = (e) => {
            const container = scrollContainerRef.current;
            if (!container) return;

            if (isHorizontal) {
                const dx = dragScrollStart.x - e.clientX;
                container.scrollLeft = dragScrollStart.scrollX + dx;
            } else {
                const dy = dragScrollStart.y - e.clientY;
                container.scrollTop = dragScrollStart.scrollY + dy;
            }
        };

        const handleMouseUp = () => {
            setIsDragScrolling(false);
        };

        // Also clean up on blur (window loses focus)
        const handleBlur = () => {
            setIsDragScrolling(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [isDragScrolling, dragScrollStart, isHorizontal]);

    // Safety: reset drag state when mode changes
    useEffect(() => {
        setIsDragScrolling(false);
    }, [isReorderMode, isMultiSelectMode]);

    // Calculate thumbnail size based on position
    const thumbSize = isHorizontal ? height - 60 : width - 24; // Leave room for labels

    // Scroll to current item when it changes
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || currentIndex < 0) return;

        const itemSize = thumbSize + 12; // thumbnail size + gap
        const scrollPos = currentIndex * itemSize;

        if (isHorizontal) {
            const containerWidth = container.clientWidth;
            const targetScroll = scrollPos - containerWidth / 2 + itemSize / 2;
            container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
        } else {
            const containerHeight = container.clientHeight;
            const targetScroll = scrollPos - containerHeight / 2 + itemSize / 2;
            container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }
    }, [currentIndex, thumbSize, isHorizontal]);

    const handleResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e) => {
            if (isHorizontal) {
                const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, window.innerHeight - e.clientY));
                setHeight(newHeight);
            } else {
                const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            if (isHorizontal) {
                localStorage.setItem(SIDEBAR_HEIGHT_KEY, height.toString());
            } else {
                localStorage.setItem(SIDEBAR_WIDTH_KEY, width.toString());
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, width, isHorizontal]);

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

    // Load/generate thumbnails for local files (with caching)
    useEffect(() => {
        if (mode !== 'local' || !electronAPI) return;

        const loadThumbnails = async () => {
            // Only process visible files (first 50)
            const visibleFiles = files.slice(0, 50).filter(f => !isRepicFile(f));

            for (const file of visibleFiles) {
                // Skip if already cached in memory
                if (thumbMemCache.has(file) || cachedThumbs[file]) continue;

                try {
                    // Try memory cache first
                    if (thumbMemCache.has(file)) {
                        setCachedThumbs(prev => ({ ...prev, [file]: thumbMemCache.get(file) }));
                        continue;
                    }

                    // Try IndexedDB cache
                    const cached = await getThumbnail(file, cacheVersion);
                    if (cached) {
                        thumbMemCache.set(file, cached);
                        setCachedThumbs(prev => ({ ...prev, [file]: cached }));
                        continue;
                    }

                    // Generate new thumbnail
                    const thumb = await generateThumbnail(`file://${file}`);
                    if (thumb) {
                        thumbMemCache.set(file, thumb);
                        setCachedThumbs(prev => ({ ...prev, [file]: thumb }));
                        // Save to IndexedDB (async, don't wait)
                        saveThumbnail(file, cacheVersion, thumb);
                    }
                } catch (e) {
                    // Silently fail, will use original image
                }
            }
        };

        loadThumbnails();
    }, [files, mode, cacheVersion]);

    // Preload ALL thumbnails from cache when album changes (instant display)
    useEffect(() => {
        if (mode !== 'web' || files.length === 0) return;

        // Get all URLs and preload thumbnails from IndexedDB into memory
        const allUrls = files
            .map(file => typeof file === 'string' ? file : file.url)
            .filter(url => url?.startsWith('http'));

        if (allUrls.length > 0) {
            preloadThumbnails(allUrls);
        }
    }, [files, mode]);

    // Preload full images for nearby items (smoother main view navigation)
    useEffect(() => {
        if (mode !== 'web' || files.length === 0) return;

        // Preload full images around current index for main viewer
        const preloadRange = 3;
        const urlsToPreload = [];

        for (let i = -preloadRange; i <= preloadRange; i++) {
            const idx = currentIndex + i;
            if (idx >= 0 && idx < files.length && idx !== currentIndex) {
                const file = files[idx];
                const url = typeof file === 'string' ? file : file.url;
                if (url?.startsWith('http')) {
                    urlsToPreload.push(url);
                }
            }
        }

        if (urlsToPreload.length > 0) {
            preloadImages(urlsToPreload);
        }
    }, [files, mode, currentIndex]);

    return (
        <div
            className={`bg-surface/30 backdrop-blur-xl overflow-hidden relative transition-all duration-300 ease-out flex-shrink-0 ${
                isHorizontal
                    ? 'w-full border-t border-white/5 flex flex-row'
                    : 'h-full border-r border-white/5 flex flex-col'
            }`}
            style={isHorizontal ? { height: `${height}px` } : { width: `${width}px` }}
        >
            {/* Toolbar for album mode */}
            {mode === 'web' && (
                <div className={`flex-shrink-0 ${isHorizontal ? 'border-r py-2 px-1 flex flex-col justify-center' : 'border-b px-2 py-2'} border-white/5`}>
                    {isMultiSelectMode ? (
                        <div className={`flex ${isHorizontal ? 'flex-col items-center gap-2' : 'flex-col gap-1'}`}>
                            <div className={`flex items-center ${isHorizontal ? 'flex-col gap-1' : 'justify-between w-full'}`}>
                                <span className="text-[10px] text-white/60">
                                    {selectedIds.size} 選中
                                </span>
                                <button
                                    onClick={onExitMultiSelect}
                                    className="text-[10px] text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className={`flex ${isHorizontal ? 'flex-col' : 'flex-row'} items-center gap-1`}>
                                <button
                                    onClick={onDownloadSelected}
                                    disabled={selectedIds.size === 0}
                                    className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="下載"
                                >
                                    ↓
                                </button>
                                <button
                                    onClick={onUploadSelected}
                                    disabled={selectedIds.size === 0}
                                    className="text-[10px] text-green-400 hover:text-green-300 px-2 py-1 rounded hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="上傳"
                                >
                                    ↑
                                </button>
                            </div>
                        </div>
                    ) : isReorderMode ? (
                        <div className={`flex ${isHorizontal ? 'flex-col items-center gap-2' : 'items-center justify-between'}`}>
                            <span className="text-[10px] text-yellow-400">排序中</span>
                            <button
                                onClick={() => setIsReorderMode(false)}
                                className="text-[10px] text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10"
                            >
                                完成
                            </button>
                        </div>
                    ) : (
                        <div className={`flex ${isHorizontal ? 'flex-col' : 'flex-row'} items-center gap-1`}>
                            <button
                                onClick={onEnterMultiSelect}
                                className={`text-[10px] text-white/50 hover:text-white/80 py-1 px-2 rounded hover:bg-white/5 transition-colors ${isHorizontal ? '' : 'flex-1'}`}
                            >
                                多選
                            </button>
                            {onReorder && (
                                <button
                                    onClick={() => setIsReorderMode(true)}
                                    className={`text-[10px] text-white/50 hover:text-white/80 py-1 px-2 rounded hover:bg-white/5 transition-colors ${isHorizontal ? '' : 'flex-1'}`}
                                >
                                    排序
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div
                ref={scrollContainerRef}
                onMouseDown={handleScrollDragStart}
                className={`flex-1 no-scrollbar select-none ${
                    isHorizontal
                        ? 'overflow-x-auto overflow-y-hidden px-4 py-2 flex flex-row gap-3 items-center'
                        : 'overflow-y-auto py-4 px-2 space-y-3'
                } ${isDragScrolling ? 'cursor-grabbing' : ''}`}
            >
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

                    // For local files, use file:// URL directly
                    const imgSrc = isWeb ? originalUrl : originalUrl;

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

                    // Drag reorder handlers (for album mode, only when reorder mode is active)
                    const canReorder = isWeb && onReorder && isReorderMode && !isMultiSelectMode;
                    const isDragging = dragIndex === index;
                    const isDragOver = dragOverIndex === index;

                    return (
                        <div
                            key={isWeb ? (typeof file === 'string' ? file : file.id) : `${file}-${cacheVersion}`}
                            data-thumb="true"
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
                            className={`relative cursor-pointer group flex flex-col items-center transition-transform duration-100 ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'scale-110' : ''} ${!isMultiSelectMode && !isDragging ? 'hover:scale-105 active:scale-95' : ''}`}
                            style={{ contentVisibility: 'auto', containIntrinsicSize: `${thumbSize}px ${thumbSize + 40}px` }}
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
                                style={{ width: `${thumbSize}px`, height: `${thumbSize}px` }}
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
                                ) : isWeb && originalUrl.startsWith('http') ? (
                                    // Web images: use LazyImage with thumbnail for fast loading
                                    <LazyImage
                                        src={originalUrl}
                                        className="w-full h-full"
                                        style={clipPath ? { clipPath } : undefined}
                                        isHighPriority={Math.abs(index - currentIndex) <= 2}
                                        useThumbnail={true}
                                        onError={() => setFailedImages(prev => new Set([...prev, fileUrl]))}
                                        fallbackElement={
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-black/30 text-white/40">
                                                <span className="text-sm">✕</span>
                                                <span className="text-[8px] mt-0.5">暫不支援</span>
                                            </div>
                                        }
                                    />
                                ) : imgSrc ? (
                                    // Local files: direct img tag
                                    <img
                                        src={imgSrc}
                                        alt=""
                                        className="w-full h-full object-contain pointer-events-none"
                                        style={clipPath ? { clipPath } : undefined}
                                        loading="lazy"
                                        draggable={false}
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    // Loading spinner for .repic files loading
                                    isRepic ? (
                                        <div className="w-full h-full flex items-center justify-center bg-black/20">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                                        </div>
                                    ) : null
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
                        </div>
                    );
                })}
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={handleResizeMouseDown}
                className={`
                    absolute transition-colors duration-150 z-10
                    ${isHorizontal
                        ? 'left-0 top-0 h-1 w-full cursor-row-resize'
                        : 'top-0 right-0 w-1 h-full cursor-col-resize'
                    }
                    ${isResizing ? 'bg-primary' : 'bg-transparent hover:bg-white/30'}
                `}
            />
        </div>
    );
};
