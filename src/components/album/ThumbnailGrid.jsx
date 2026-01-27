import { LazyImage } from '../ui/LazyImage';

/**
 * ThumbnailGrid - Grid view for album images
 *
 * @param {Array} images - Album images array
 * @param {number} currentIndex - Currently selected image index
 * @param {Function} onSelectImage - Callback when image is clicked (index)
 * @param {string} size - Grid size: 'small' | 'medium' | 'large'
 * @param {boolean} isMultiSelectMode - Multi-select mode
 * @param {Set} selectedImageIds - Selected image IDs
 * @param {Function} onToggleSelect - Toggle image selection
 */
export const ThumbnailGrid = ({
  images,
  currentIndex,
  onSelectImage,
  size = 'medium',
  isMultiSelectMode = false,
  selectedImageIds = new Set(),
  onToggleSelect
}) => {
  // Grid sizes (in pixels)
  const sizes = {
    small: 128,
    medium: 192,
    large: 256
  };
  const thumbSize = sizes[size];

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden p-4 bg-[#0A0A0A]">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`
        }}
      >
        {images.map((image, index) => {
          const isSelected = selectedImageIds.has(image.id);
          const isCurrent = index === currentIndex;

          return (
            <div
              key={image.id}
              className={`
                relative group cursor-pointer rounded-lg overflow-hidden
                transition-all duration-200
                ${isCurrent ? 'ring-2 ring-primary scale-105' : 'hover:scale-105'}
                ${isSelected ? 'ring-2 ring-blue-500' : ''}
              `}
              style={{
                aspectRatio: '1',
                height: `${thumbSize}px`
              }}
              onClick={(e) => {
                if (isMultiSelectMode) {
                  e.preventDefault();
                  onToggleSelect?.(image.id);
                } else {
                  onSelectImage(index);
                }
              }}
            >
              {/* Thumbnail */}
              <LazyImage
                src={image.url || image.src}
                alt={image.name || `Image ${index + 1}`}
                className="w-full h-full"
                useThumbnail
                showSpinner={true}
              />

              {/* Multi-select checkbox */}
              {isMultiSelectMode && (
                <div className="absolute top-2 right-2 z-10">
                  <div
                    className={`
                      w-6 h-6 rounded border-2 flex items-center justify-center
                      transition-colors duration-200
                      ${isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-black/50 border-white/30 group-hover:border-white/60'
                      }
                    `}
                  >
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              )}

              {/* Image name overlay (on hover) */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <p className="text-xs text-white/90 truncate">
                  {image.name || `${index + 1}.jpg`}
                </p>
              </div>

              {/* Current indicator badge */}
              {isCurrent && !isMultiSelectMode && (
                <div className="absolute top-2 left-2 bg-primary px-2 py-0.5 rounded text-xs font-medium">
                  Current
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {images.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-white/40">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <p className="text-lg">No images in this album</p>
        </div>
      )}
    </div>
  );
};
