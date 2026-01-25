import { useState, useEffect, useRef, useCallback } from 'react';
import useI18n from '../../hooks/useI18n';

const electronAPI = window.electronAPI || null;

export const ImageViewer = ({ src, crop }) => {
    const { t } = useI18n();
    const containerRef = useRef(null);
    const imageRef = useRef(null);

    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [proxiedSrc, setProxiedSrc] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Reset zoom, position, proxied src, and failed state when image changes
    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setProxiedSrc(null);
        setLoadFailed(false);
        // Only show loading for web images, local files load fast
        const isLocalFile = src?.startsWith('file://') || src?.startsWith('data:');
        setIsLoading(!isLocalFile);
    }, [src]);

    // Actual image source (use proxied if available)
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
            {imageSrc.startsWith('data:') && !proxiedSrc && (
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
                <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="View"
                    className={`block select-none rounded-md transition-opacity duration-200 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                        // Apply crop using clip-path if crop params exist
                        ...(crop && {
                            clipPath: `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`
                        })
                    }}
                    draggable={false}
                    referrerPolicy="no-referrer"
                    onLoad={() => setIsLoading(false)}
                    onError={async () => {
                        // If image fails to load and we haven't tried proxy yet
                        if (src.startsWith('http') && !proxiedSrc && electronAPI?.proxyImage) {
                            console.log('[ImageViewer] Image failed, trying proxy:', src);
                            const result = await electronAPI.proxyImage(src);
                            if (result.success) {
                                setProxiedSrc(result.data);
                            } else {
                                setIsLoading(false);
                                setLoadFailed(true);
                            }
                        } else if (proxiedSrc) {
                            // Proxied image also failed
                            setIsLoading(false);
                            setLoadFailed(true);
                        } else {
                            setIsLoading(false);
                            setLoadFailed(true);
                        }
                    }}
                />
            )}
        </div>
    );
};
