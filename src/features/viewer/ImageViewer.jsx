import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from '../../lib/motion';
import useI18n from '../../hooks/useI18n';

export const ImageViewer = ({ src, showInfoPanel = true }) => {
    const { t } = useI18n();
    const containerRef = useRef(null);
    const imageRef = useRef(null);

    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Calculate max width based on sidebar (~150px) + InfoPanel (280px if shown) + margins
    const sidebarWidth = 150;
    const infoPanelWidth = showInfoPanel ? 280 : 0;
    const margins = 80;
    const maxImageWidth = `calc(100vw - ${sidebarWidth + infoPanelWidth + margins}px)`;

    // Reset zoom and position when image changes
    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, [src]);

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
        return 'zoom-in';
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full relative flex items-center justify-center overflow-hidden transition-all duration-300 ease-out"
        >
            {/* Zoom percentage indicator */}
            {scale !== 1 && (
                <div
                    className="absolute top-8 left-8 z-10 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-mono tracking-wide shadow-lg border border-white/10 cursor-pointer hover:bg-black/80 transition-colors"
                    onClick={handleDoubleClick}
                    title={t('resetZoom')}
                >
                    {zoomPercent}%
                </div>
            )}

            <div
                ref={containerRef}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                className="relative group shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden border border-white/5 transition-all duration-300 ease-out"
                style={{ cursor: getCursor() }}
            >
                <img
                    ref={imageRef}
                    src={src}
                    alt="View"
                    className="block select-none"
                    style={{
                        maxWidth: maxImageWidth,
                        maxHeight: 'calc(100vh - 180px)',
                        objectFit: 'contain',
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out, max-width 0.3s ease-out, max-height 0.3s ease-out'
                    }}
                    draggable={false}
                />

                {/* Unsaved indicator */}
                {src.startsWith('data:') && (
                    <div className="absolute top-4 right-4 bg-primary/80 backdrop-blur-md text-[10px] text-white px-2 py-1 rounded-full uppercase tracking-widest font-bold shadow-lg">
                        Unsaved
                    </div>
                )}

                {/* Subtle shine overlay */}
                <div className="absolute inset-0 pointer-events-none bg-linear-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            </div>
        </motion.div>
    );
};
