import { motion } from 'framer-motion';

export const ImageViewer = ({ src }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full h-full relative flex items-center justify-center p-4"
        >
            <div className="relative group shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden border border-white/5">
                <img
                    src={src}
                    alt="View"
                    className="max-w-full max-h-[calc(100vh-160px)] object-contain block transition-transform duration-500 group-hover:scale-[1.01]"
                />

                {/* Unsaved indicator */}
                {src.startsWith('data:') && (
                    <div className="absolute top-4 right-4 bg-primary/80 backdrop-blur-md text-[10px] text-white px-2 py-1 rounded-full uppercase tracking-widest font-bold shadow-lg">
                        Unsaved Crop
                    </div>
                )}

                {/* Subtle shine overlay */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            </div>
        </motion.div>
    );
};
