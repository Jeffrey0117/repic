import { useState, useEffect, useRef, memo } from 'react';
import { loadImage, getCached, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW } from '../../utils/imageLoader';

const electronAPI = window.electronAPI || null;

/**
 * LazyImage - Only loads when visible in viewport
 * Uses imageLoader for optimized concurrent loading
 */
export const LazyImage = memo(({
    src,
    alt = '',
    className = '',
    style,
    isHighPriority = false,
    onLoad,
    onError,
    fallbackElement,
    showSpinner = true
}) => {
    const imgRef = useRef(null);
    const [loadedSrc, setLoadedSrc] = useState(() => getCached(src)); // Use cache immediately if available
    const [isLoading, setIsLoading] = useState(!loadedSrc);
    const [hasError, setHasError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // Intersection Observer for visibility detection
    useEffect(() => {
        const img = imgRef.current;
        if (!img) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                rootMargin: '100px', // Start loading slightly before visible
                threshold: 0
            }
        );

        observer.observe(img);

        return () => observer.disconnect();
    }, []);

    // Load image when visible
    useEffect(() => {
        if (!isVisible || !src) return;
        if (loadedSrc) return; // Already loaded

        // Check if it's a local file (no need for imageLoader)
        if (src.startsWith('file://') || src.startsWith('data:')) {
            setLoadedSrc(src);
            setIsLoading(false);
            return;
        }

        // Only load web images
        if (!src.startsWith('http')) {
            setHasError(true);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setHasError(false);

        const priority = isHighPriority ? PRIORITY_HIGH : PRIORITY_NORMAL;

        loadImage(src, priority)
            .then((data) => {
                setLoadedSrc(data);
                setIsLoading(false);
                onLoad?.();
            })
            .catch(async (err) => {
                console.log('[LazyImage] Load failed, trying proxy:', src);
                // Try proxy if direct load fails
                if (electronAPI?.proxyImage) {
                    try {
                        const result = await electronAPI.proxyImage(src);
                        if (result.success) {
                            setLoadedSrc(result.data);
                            setIsLoading(false);
                            onLoad?.();
                            return;
                        }
                    } catch (e) {
                        // Proxy also failed
                    }
                }
                setHasError(true);
                setIsLoading(false);
                onError?.(err);
            });
    }, [isVisible, src, loadedSrc, isHighPriority, onLoad, onError]);

    // Reset when src changes - batch updates to reduce renders
    useEffect(() => {
        const cached = getCached(src);
        if (cached) {
            // Single batch update
            setLoadedSrc(cached);
            setIsLoading(false);
            setHasError(false);
        } else if (src?.startsWith('http')) {
            // Only reset if it's a web image that needs loading
            setLoadedSrc(null);
            setIsLoading(true);
            setHasError(false);
        } else {
            // Local files don't need loading state
            setLoadedSrc(src);
            setIsLoading(false);
            setHasError(false);
        }
    }, [src]);

    if (hasError) {
        return fallbackElement || (
            <div ref={imgRef} className={`flex items-center justify-center bg-black/30 text-white/40 ${className}`} style={style}>
                <span className="text-sm">✕</span>
            </div>
        );
    }

    return (
        <div ref={imgRef} className={`relative ${className}`} style={style}>
            {/* Loading spinner */}
            {isLoading && showSpinner && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                </div>
            )}
            {/* Image */}
            {loadedSrc && (
                <img
                    src={loadedSrc}
                    alt={alt}
                    className={`w-full h-full object-contain transition-opacity duration-200 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    style={style}
                    draggable={false}
                    referrerPolicy="no-referrer"
                />
            )}
        </div>
    );
});

LazyImage.displayName = 'LazyImage';
