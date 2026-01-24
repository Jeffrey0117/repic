import { useState, useEffect, useCallback } from 'react';
import { motion } from '../../lib/motion';

const SIDEBAR_WIDTH_KEY = 'sidebar-width';
const MIN_WIDTH = 80;
const MAX_WIDTH = 200;
const DEFAULT_WIDTH = 120;

export const Sidebar = ({ files, currentIndex, onSelect, cacheVersion = 0, mode = 'local' }) => {
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
                    const imgSrc = isWeb ? fileUrl : `file://${file}?v=${cacheVersion}`;

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
                            >
                                <img
                                    src={imgSrc}
                                    alt=""
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                />
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
