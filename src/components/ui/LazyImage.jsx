import { useState, useEffect, useRef, memo } from 'react';
import { loadImage, loadThumbnail, getCached, getCachedThumbnail, cacheProxyResult, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW } from '../../utils/imageLoader';

const electronAPI = window.electronAPI || null;

/**
 * LazyImage - Only loads when visible in viewport
 * Uses imageLoader for optimized concurrent loading
 *
 * useThumbnail: Use 256x256 JPEG thumbnail for faster loading (sidebar)
 */
export const LazyImage = memo(({
    src,
    alt = '',
    className = '',
    style,
    isHighPriority = false,
    useThumbnail = false, // Use cached thumbnail instead of full image
    onLoad,
    onError,
    fallbackElement,
    showSpinner = true
}) => {
    const imgRef = useRef(null);

    // Initialize from cache immediately
    const [loadedSrc, setLoadedSrc] = useState(() => {
        if (useThumbnail) {
            return getCachedThumbnail(src) || getCached(src);
        }
        return getCached(src);
    });
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
    // Strategy: fetch() -> Node proxy -> browser proxy (page-level)
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
        let cancelled = false;

        const priority = isHighPriority ? PRIORITY_HIGH : PRIORITY_NORMAL;

        // Use thumbnail loader for sidebar (faster, smaller)
        const loader = useThumbnail ? loadThumbnail(src) : loadImage(src, priority);

        // Timeout: if image doesn't load in 5s, try proxy
        const timeoutId = setTimeout(async () => {
            if (cancelled || loadedSrc) return;
            console.log('[LazyImage] Timeout, trying proxy:', src);
            if (electronAPI?.proxyImage) {
                try {
                    const result = await electronAPI.proxyImage(src);
                    if (!cancelled && result.success) {
                        cacheProxyResult(src, result.data);
                        setLoadedSrc(result.data);
                        setIsLoading(false);
                        onLoad?.();
                    }
                } catch (e) {}
            }
        }, 5000);

        loader
            .then((data) => {
                clearTimeout(timeoutId);
                if (cancelled) return;
                if (data) {
                    setLoadedSrc(data);
                    setIsLoading(false);
                    onLoad?.();
                } else {
                    throw new Error('No data');
                }
            })
            .catch(async (err) => {
                clearTimeout(timeoutId);
                if (cancelled) return;
                // Don't retry if request was intentionally aborted (album switch)
                if (err?.name === 'AbortError') {
                    setIsLoading(false);
                    return;
                }

                // Layer 2: Try Node.js proxy (handles most CORS)
                console.log('[LazyImage] Load failed, trying proxy:', src);
                if (electronAPI?.proxyImage) {
                    try {
                        const result = await electronAPI.proxyImage(src);
                        if (!cancelled && result.success) {
                            cacheProxyResult(src, result.data);
                            setLoadedSrc(result.data);
                            setIsLoading(false);
                            onLoad?.();
                            return;
                        }
                    } catch (e) {
                        // Continue to browser proxy
                    }
                }

                // Layer 3: Try browser proxy (hidden window, loads host page)
                // For strict sites like postimg that block all direct requests
                console.log('[LazyImage] Node proxy failed, trying browser proxy:', src);
                if (!cancelled && electronAPI?.proxyImageBrowser) {
                    try {
                        const result = await electronAPI.proxyImageBrowser(src);
                        if (!cancelled && result.success) {
                            cacheProxyResult(src, result.data);
                            setLoadedSrc(result.data);
                            setIsLoading(false);
                            onLoad?.();
                            return;
                        }
                    } catch (e) {
                        // All methods failed
                    }
                }

                if (!cancelled) {
                    setHasError(true);
                    setIsLoading(false);
                    onError?.(err);
                }
            });

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [isVisible, src, loadedSrc, isHighPriority, useThumbnail, onLoad, onError]);

    // Reset when src changes - check cache first
    useEffect(() => {
        // Check thumbnail cache first if using thumbnails
        const cached = useThumbnail
            ? (getCachedThumbnail(src) || getCached(src))
            : getCached(src);

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
    }, [src, useThumbnail]);

    if (hasError) {
        return fallbackElement || (
            <div ref={imgRef} className={`flex items-center justify-center bg-black/30 text-white/40 ${className}`} style={style}>
                <span className="text-sm">✕</span>
            </div>
        );
    }

    return (
        <div ref={imgRef} className={`relative ${className}`} style={style}>
            {/* Loading state: spinner for full images, subtle bg for thumbnails */}
            {isLoading && (
                useThumbnail ? (
                    // Thumbnails: just a subtle shimmer background, no spinner
                    <div className="absolute inset-0 bg-white/5 animate-pulse" />
                ) : showSpinner ? (
                    // Full images: show spinner
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                    </div>
                ) : null
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
