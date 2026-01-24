import { useState } from 'react';
import { motion, AnimatePresence } from '../../lib/motion';
import { Trash2, ImageIcon } from '../../components/icons';
import { useTheme } from '../../contexts/ThemeContext';

export const AlbumImageGrid = ({ images, onRemoveImage, onImageClick }) => {
  const { theme } = useTheme();
  const [failedImages, setFailedImages] = useState(new Set());

  const handleImageError = (imageId) => {
    setFailedImages(prev => new Set(prev).add(imageId));
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      <AnimatePresence mode="popLayout">
        {images.map((image, index) => (
          <motion.div
            key={image.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`group relative aspect-square rounded-lg overflow-hidden cursor-pointer border transition-all ${
              theme === 'dark'
                ? 'bg-white/5 border-white/10 hover:border-primary/50'
                : 'bg-gray-100 border-gray-200 hover:border-primary/50'
            }`}
            onClick={() => onImageClick(index)}
          >
            {failedImages.has(image.id) ? (
              <div className={`w-full h-full flex flex-col items-center justify-center ${
                theme === 'dark' ? 'text-white/30' : 'text-gray-400'
              }`}>
                <ImageIcon size={32} />
                <span className="text-xs mt-1">Error</span>
              </div>
            ) : (
              <img
                src={image.url}
                alt=""
                className="w-full h-full object-cover"
                onError={() => handleImageError(image.id)}
                loading="lazy"
              />
            )}

            {/* Hover overlay with delete button */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ${
              theme === 'dark' ? 'bg-black/50' : 'bg-black/40'
            }`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveImage(image.id);
                }}
                className="p-2 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default AlbumImageGrid;
