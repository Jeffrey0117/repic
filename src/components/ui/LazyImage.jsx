import { useState, useEffect, useRef, memo } from 'react';
import { loadImage, loadThumbnail, getCached, getCachedThumbnail, cacheProxyResult, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW } from '../../utils/imageLoader';
import { hasImageTransparency, isPNGFormat } from '../../utils/imageUtils';

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
    showSpinner = true,
    hasTransparency = false // Only show checkerboard if image has transparency
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
    const [detectedTransparency, setDetectedTransparency] = useState(false);

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

        // Check if it's a .repic virtual image file
        if (src.toLowerCase().endsWith('.repic')) {
            if (electronAPI?.readRepicFile) {
                (async () => {
                    try {
                        const result = await electronAPI.readRepicFile(src);
                        if (result.success && result.data?.url) {
                            // Replace src with the URL from .repic file
                            // This will trigger a new load cycle with the actual URL
                            setLoadedSrc(null);
                            setIsLoading(true);
                            // Directly load the URL from .repic file
                            const actualSrc = result.data.url;

                            // Load the actual URL using the same strategy
                            const priority = isHighPriority ? PRIORITY_HIGH : PRIORITY_NORMAL;
                            const loader = useThumbnail ? loadThumbnail(actualSrc) : loadImage(actualSrc, priority);

                            loader
                                .then((data) => {
                                    if (data) {
                                        setLoadedSrc(data);
                                        setIsLoading(false);
                                        onLoad?.();
                                    }
                                })
                                .catch(async (err) => {
                                    // Try fallback proxies for web images
                                    if (electronAPI?.proxyImage) {
                                        try {
                                            const proxyResult = await electronAPI.proxyImage(actualSrc);
                                            if (proxyResult.success) {
                                                cacheProxyResult(actualSrc, proxyResult.data);
                                                setLoadedSrc(proxyResult.data);
                                                setIsLoading(false);
                                                onLoad?.();
                                                return;
                                            }
                                        } catch (e) {}
                                    }

                                    // Try browser proxy as last resort
                                    if (electronAPI?.proxyImageBrowser) {
                                        try {
                                            const browserResult = await electronAPI.proxyImageBrowser(actualSrc);
                                            if (browserResult.success) {
                                                cacheProxyResult(actualSrc, browserResult.data);
                                                setLoadedSrc(browserResult.data);
                                                setIsLoading(false);
                                                onLoad?.();
                                                return;
                                            }
                                        } catch (e) {}
                                    }

                                    setHasError(true);
                                    setIsLoading(false);
                                    onError?.(err);
                                });
                        } else {
                            setHasError(true);
                            setIsLoading(false);
                        }
                    } catch (err) {
                        setHasError(true);
                        setIsLoading(false);
                        onError?.(err);
                    }
                })();
            } else {
                setHasError(true);
                setIsLoading(false);
            }
            return;
        }

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
        } else if (src?.startsWith('http') || src?.toLowerCase().endsWith('.repic')) {
            // Reset if it's a web image or .repic file that needs loading
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

    // Detect transparency when image loads
    useEffect(() => {
        if (!loadedSrc || hasError) return;

        // Always detect transparency for PNG to avoid false positives
        if (isPNGFormat(loadedSrc)) {
            hasImageTransparency(loadedSrc).then((hasAlpha) => {
                setDetectedTransparency(hasAlpha);
            });
        } else {
            setDetectedTransparency(false);
        }
    }, [loadedSrc, hasError]);

    if (hasError) {
        return fallbackElement || (
            <div ref={imgRef} className={`flex items-center justify-center bg-black/30 text-white/40 ${className}`} style={style}>
                <span className="text-sm">✕</span>
            </div>
        );
    }

    // Show checkerboard ONLY if: 1) explicitly marked, or 2) actually detected transparency
    const shouldShowCheckerboard = hasTransparency || detectedTransparency;

    return (
        <div
            ref={imgRef}
            className={`relative ${className}`}
            style={{
                ...style,
                // Only show checkerboard for images with actual transparency
                ...(shouldShowCheckerboard ? {
                    backgroundImage: `
                        linear-gradient(45deg, #CCCCCC 25%, transparent 25%),
                        linear-gradient(-45deg, #CCCCCC 25%, transparent 25%),
                        linear-gradient(45deg, transparent 75%, #CCCCCC 75%),
                        linear-gradient(-45deg, transparent 75%, #CCCCCC 75%)
                    `,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    backgroundColor: '#FFFFFF'
                } : {})
            }}
        >
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
