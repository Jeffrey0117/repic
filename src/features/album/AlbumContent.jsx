import { useState } from 'react';
import { motion } from '../../lib/motion';
import { AlbumImageGrid } from './AlbumImageGrid';
import { ImageLightbox } from './ImageLightbox';
import { useTheme } from '../../contexts/ThemeContext';
import useI18n from '../../hooks/useI18n';

export const AlbumContent = ({ album, onAddImage, onRemoveImage }) => {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [urlInput, setUrlInput] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    // Support multiple URLs (newline or comma separated)
    const urls = urlInput
      .split(/[\n,]/)
      .map(url => url.trim())
      .filter(url => url.length > 0);

    urls.forEach(url => {
      onAddImage(url);
    });

    setUrlInput('');
  };

  const handlePaste = (e) => {
    // Check if pasting text that looks like URLs
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      // If it's a direct URL paste and input is empty, auto-submit
      const urls = pastedText.split(/[\n,]/).map(url => url.trim()).filter(Boolean);
      if (urls.length > 0 && urls.every(url => url.startsWith('http'))) {
        e.preventDefault();
        urls.forEach(url => onAddImage(url));
      }
    }
  };

  if (!album) {
    return (
      <div className={`flex-1 flex items-center justify-center ${
        theme === 'dark' ? 'text-white/30' : 'text-gray-400'
      }`}>
        <div className="text-center">
          <p className="text-lg">{t('selectOrCreateAlbum')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Image Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {album.images.length === 0 ? (
          <div className={`h-full flex items-center justify-center ${
            theme === 'dark' ? 'text-white/30' : 'text-gray-400'
          }`}>
            <div className="text-center">
              <p className="text-lg mb-2">{t('emptyAlbum')}</p>
              <p className="text-sm">{t('pasteUrlHint')}</p>
            </div>
          </div>
        ) : (
          <AlbumImageGrid
            images={album.images}
            onRemoveImage={(imageId) => onRemoveImage(album.id, imageId)}
            onImageClick={(index) => setLightboxIndex(index)}
          />
        )}
      </div>

      {/* URL Input */}
      <div className={`p-4 border-t ${theme === 'dark' ? 'border-white/5' : 'border-gray-200'}`}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={t('pasteImageUrl')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              theme === 'dark'
                ? 'bg-white/5 text-white border border-white/10 placeholder:text-white/30 focus:border-primary/50'
                : 'bg-gray-100 text-gray-800 border border-gray-200 placeholder:text-gray-400 focus:border-primary/50'
            } focus:outline-none`}
          />
          <button
            type="submit"
            disabled={!urlInput.trim()}
            className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('addImage')}
          </button>
        </form>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        images={album.images}
        currentIndex={lightboxIndex}
        isOpen={lightboxIndex >= 0}
        onClose={() => setLightboxIndex(-1)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
};

export default AlbumContent;
