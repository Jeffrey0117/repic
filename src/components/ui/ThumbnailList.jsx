import { motion } from 'framer-motion';

export const ThumbnailList = ({ files, currentIndex, onSelect }) => {
    if (!files || files.length === 0) return null;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-28 left-0 right-0 h-16 flex items-center justify-center gap-2 px-4 z-10 pointer-events-none"
        >
            <div className="flex gap-2 overflow-x-auto px-4 py-2 pointer-events-auto max-w-2xl no-scrollbar">
                {files.map((file, idx) => {
                    const isSelected = idx === currentIndex;
                    // Since 'file' is absolute path, we need file:// prefix for src
                    const src = `file://${file}`;

                    return (
                        <button
                            key={file}
                            onClick={() => onSelect(idx)}
                            className={`
                            relative flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border-2 transition-all duration-200
                            ${isSelected ? 'border-primary ring-2 ring-primary/30 scale-110 z-10' : 'border-white/10 opacity-50 hover:opacity-100 hover:scale-105'}
                        `}
                        >
                            <img
                                src={src}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                alt="thumbnail"
                            />
                        </button>
                    );
                })}
            </div>
        </motion.div>
    );
};
