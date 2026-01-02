import { useState, useEffect, useRef } from 'react';
import { Camera, X, Check, Copy } from '../../components/icons';

// Check if electronAPI is available (injected via preload script)
const electronAPI = window.electronAPI || null;

export const CaptureOverlay = () => {
    const [screenImage, setScreenImage] = useState(null);
    const [selection, setSelection] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (electronAPI) {
            const cleanup = electronAPI.onInitCaptureData((dataUrl) => {
                setScreenImage(dataUrl);
            });
            return cleanup;
        }
    }, []);


    useEffect(() => {
        if (screenImage && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Add dimmed overlay
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            };
            img.src = screenImage;
        }
    }, [screenImage]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setSelection({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const x = Math.min(e.clientX, dragStart.x);
        const y = Math.min(e.clientY, dragStart.y);
        const width = Math.abs(e.clientX - dragStart.x);
        const height = Math.abs(e.clientY - dragStart.y);
        setSelection({ x, y, width, height });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleCancel = () => {
        if (electronAPI) {
            electronAPI.closeCaptureWindow(null);
        }
    };

    const handleConfirm = async () => {
        if (!selection || !canvasRef.current || !screenImage) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = selection.width * dpr;
            canvas.height = selection.height * dpr;

            // Draw only the selected portion from the original image
            // Note: sources[0].thumbnail is already scaled to full screen resolution in main process
            ctx.drawImage(
                img,
                selection.x * (img.width / window.innerWidth),
                selection.y * (img.height / window.innerHeight),
                selection.width * (img.width / window.innerWidth),
                selection.height * (img.height / window.innerHeight),
                0, 0, canvas.width, canvas.height
            );

            const dataUrl = canvas.toDataURL('image/png');
            if (electronAPI) {
                electronAPI.closeCaptureWindow(dataUrl);
            }
        };
        img.src = screenImage;
    };

    if (!screenImage) return null;

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-[9999] cursor-crosshair select-none overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            <canvas ref={canvasRef} className="absolute inset-0" />

            {selection && (
                <div
                    className="absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.1)] pointer-events-none"
                    style={{
                        left: selection.x,
                        top: selection.y,
                        width: selection.width,
                        height: selection.height
                    }}
                >
                    {/* Size Tooltip */}
                    <div className="absolute -top-8 left-0 bg-primary text-white text-[10px] px-2 py-0.5 rounded font-mono">
                        {Math.round(selection.width)} × {Math.round(selection.height)}
                    </div>

                    {/* Toolbar */}
                    {!isDragging && selection.width > 20 && (
                        <div className="absolute -bottom-12 right-0 flex items-center gap-1 bg-surface/90 backdrop-blur-md p-1 rounded-lg border border-white/10 pointer-events-auto">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                                className="p-1.5 hover:bg-primary/20 text-primary rounded-md transition-colors"
                                title="Confirm"
                            >
                                <Check size={16} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                className="p-1.5 hover:bg-danger/20 text-danger rounded-md transition-colors"
                                title="Cancel"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Hint */}
            {!selection && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 text-white/80 text-sm tracking-widest uppercase">
                    Drag to select region
                </div>
            )}
        </div>
    );
};
