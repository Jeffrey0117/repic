import { useState, useEffect, useRef, useCallback } from 'react';
import useI18n from '../../hooks/useI18n';
import { getCached, loadImage, PRIORITY_HIGH } from '../../utils/imageLoader';
import { getLocalUrl, onPrefetchComplete } from '../../utils/prefetchManager';
import { drawAnnotation } from '../editor/utils/drawingHelpers';

const electronAPI = window.electronAPI || null;

export const ImageViewer = ({ src, crop, annotations = [] }) => {
    const { t } = useI18n();
    const containerRef = useRef(null);
    const imageRef = useRef(null);
    const canvasRef = useRef(null);

    const [scale, setScale] = useState(1);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

    // Draw annotations on canvas overlay
    useEffect(() => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !annotations?.length) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match canvas size to displayed image size
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Clear and redraw
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Convert percentage-based annotations to pixel coordinates and draw
        annotations.forEach(ann => {
            if (ann.unit === '%') {
                const pixelAnn = {
                    type: ann.type,
                    x: (ann.x / 100) * canvas.width,
                    y: (ann.y / 100) * canvas.height,
                    width: (ann.width / 100) * canvas.width,
                    height: (ann.height / 100) * canvas.height
                };
                drawAnnotation(ctx, pixelAnn);
            } else {
                drawAnnotation(ctx, ann);
            }
        });
    }, [annotations, imageSize, scale]);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [proxiedSrc, setProxiedSrc] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Reset state when src changes
    useEffect(() => {
        if (!src) return;

        setScale(1);
        setPosition({ x: 0, y: 0 });
        setProxiedSrc(null);
        setLoadFailed(false);

        // Local files: no loading state needed
        const isLocal = src.startsWith('file://') || src.startsWith('data:');
        if (isLocal) {
            setIsLoading(false);
            return;
        }

        // Check if Go prefetched this image to local temp
        const localUrl = getLocalUrl(src);
        if (localUrl) {
            console.log('[ImageViewer] Using prefetched:', localUrl);
            setProxiedSrc(localUrl);
            setIsLoading(false);
            return;
        }

        // Web images: check JS cache
        const cached = getCached(src);
        if (cached) {
            setProxiedSrc(cached);
            setIsLoading(false);
            return;
        }

        // Not prefetched yet - show loading and wait for prefetch or load via JS
        setIsLoading(true);
        let cancelled = false;

        // Listen for prefetch completion
        const unsubscribe = onPrefetchComplete(src, (localPath) => {
            if (cancelled) return;
            const fileUrl = `file:///${localPath.replace(/\\/g, '/')}`;
            console.log('[ImageViewer] Prefetch complete:', fileUrl);
            setProxiedSrc(fileUrl);
            setIsLoading(false);
        });

        // Also load via JS imageLoader as fallback
        loadImage(src, PRIORITY_HIGH)
            .then((data) => {
                if (cancelled) return;
                setProxiedSrc(data);
                setIsLoading(false);
            })
            .catch(async (err) => {
                if (cancelled) return;
                // Don't retry if aborted
                if (err?.name === 'AbortError') {
                    setIsLoading(false);
                    return;
                }
                // Try proxy as fallback
                if (electronAPI?.proxyImage) {
                    try {
                        const result = await electronAPI.proxyImage(src);
                        if (!cancelled && result.success) {
                            setProxiedSrc(result.data);
                            setIsLoading(false);
                            return;
                        }
                    } catch (e) {
                        // Proxy also failed
                    }
                }
                setIsLoading(false);
                setLoadFailed(true);
            });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [src]);

    // Actual image source (cached > proxied > original)
    const imageSrc = proxiedSrc || src;

    // Handle scroll wheel zoom - zoom toward mouse position
    const handleWheel = useCallback((e) => {
        e.preventDefault();

        const container = containerRef.current;
        const image = imageRef.current;
        if (!container || !image) return;

        const rect = container.getBoundingClientRect();

        // Mouse position relative to container center
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        const newScale = Math.max(0.5, Math.min(5, scale + delta));

        if (newScale !== scale) {
            // Adjust position to zoom toward mouse
            const scaleRatio = newScale / scale;
            const newX = mouseX - (mouseX - position.x) * scaleRatio;
            const newY = mouseY - (mouseY - position.y) * scaleRatio;

            setScale(newScale);
            setPosition({ x: newX, y: newY });
        }
    }, [scale, position]);

    // Handle double-click to reset zoom
    const handleDoubleClick = useCallback(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, []);

    // Start dragging (panning)
    const handleMouseDown = useCallback((e) => {
        if (scale <= 1) return; // Only allow panning when zoomed in
        e.preventDefault();
        setIsDragging(true);
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    }, [scale, position]);

    // During drag
    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    }, [isDragging, dragStart]);

    // End drag
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Attach wheel event with passive: false
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [handleWheel]);

    // Global mouse up to handle drag release outside container
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('mousemove', handleMouseMove);
            return () => {
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('mousemove', handleMouseMove);
            };
        }
    }, [isDragging, handleMouseUp, handleMouseMove]);

    const zoomPercent = Math.round(scale * 100);

    // Determine cursor style
    const getCursor = () => {
        if (isDragging) return 'grabbing';
        if (scale > 1) return 'grab';
        return 'default';
    };

    // Handle drag start for system-level drag (only when not zoomed)
    const handleDragStart = useCallback((e) => {
        if (scale > 1) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        // Use Electron's native drag for system-level drag
        if (electronAPI?.startDrag && src) {
            electronAPI.startDrag(src);
        }
    }, [scale, src]);

    return (
        <div
            ref={containerRef}
            onDoubleClick={handleDoubleClick}
            onMouseDown={handleMouseDown}
            draggable={scale <= 1}
            onDragStart={handleDragStart}
            className="w-full h-full flex items-center justify-center overflow-hidden relative bg-transparent"
            style={{ cursor: getCursor() }}
        >
            {/* Zoom percentage indicator */}
            {scale !== 1 && (
                <div
                    className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-mono tracking-wide shadow-lg border border-white/10 cursor-pointer hover:bg-black/80 transition-colors"
                    onClick={handleDoubleClick}
                    title={t('resetZoom')}
                >
                    {zoomPercent}%
                </div>
            )}

            {/* Unsaved indicator */}
            {src?.startsWith('data:') && (
                <div className="absolute top-4 right-4 z-10 bg-primary/80 backdrop-blur-md text-[10px] text-white px-2 py-1 rounded-full uppercase tracking-widest font-bold shadow-lg">
                    Unsaved
                </div>
            )}

            {/* Loading spinner */}
            {isLoading && !loadFailed && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-white/20 border-t-white/80 rounded-full animate-spin" />
                </div>
            )}

            {loadFailed ? (
                <div className="flex flex-col items-center justify-center text-white/40 p-8">
                    <span className="text-4xl mb-3">✕</span>
                    <span className="text-base font-medium">暫不支援此來源</span>
                </div>
            ) : (
                <div
                    className="relative rounded-md"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                    }}
                >
                    <img
                        ref={imageRef}
                        src={imageSrc}
                        alt="View"
                        className={`block select-none transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                        style={{
                            maxWidth: 'calc(100vw - 280px)',
                            maxHeight: 'calc(100vh - 160px)',
                            objectFit: crop ? 'none' : 'contain',
                            ...(crop && {
                                // Use object-view-box to show only crop region (centered & scaled)
                                objectViewBox: `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`,
                                objectFit: 'contain',
                            })
                        }}
                        draggable={false}
                        referrerPolicy="no-referrer"
                        onLoad={(e) => {
                            setIsLoading(false);
                            setImageSize({ width: e.target.clientWidth, height: e.target.clientHeight });
                        }}
                        onError={async () => {
                            // If failed and haven't tried proxy yet
                            if (src?.startsWith('http') && !proxiedSrc && electronAPI?.proxyImage) {
                                const result = await electronAPI.proxyImage(src);
                                if (result.success) {
                                    setProxiedSrc(result.data);
                                    return;
                                }
                            }
                            setIsLoading(false);
                            setLoadFailed(true);
                        }}
                    />
                    {/* Annotations overlay */}
                    {annotations?.length > 0 && (
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                ...(crop && {
                                    objectViewBox: `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`,
                                })
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
