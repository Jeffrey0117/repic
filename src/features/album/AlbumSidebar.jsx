import { useState } from 'react';
import { motion } from '../../lib/motion';
import { FolderOpen, Trash2, X, Check } from '../../components/icons';
import { useTheme } from '../../contexts/ThemeContext';
import useI18n from '../../hooks/useI18n';

export const AlbumSidebar = ({
  albums,
  selectedAlbumId,
  onSelectAlbum,
  onCreateAlbum,
  onRenameAlbum,
  onDeleteAlbum
}) => {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [isCreating, setIsCreating] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = () => {
    if (newAlbumName.trim()) {
      onCreateAlbum(newAlbumName.trim());
      setNewAlbumName('');
      setIsCreating(false);
    }
  };

  const handleStartEdit = (album) => {
    setEditingId(album.id);
    setEditingName(album.name);
  };

  const handleSaveEdit = () => {
    if (editingName.trim() && editingId) {
      onRenameAlbum(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter') {
      action();
    } else if (e.key === 'Escape') {
      if (isCreating) {
        setIsCreating(false);
        setNewAlbumName('');
      } else {
        handleCancelEdit();
      }
    }
  };

  return (
    <motion.aside
      initial={{ x: -250, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`w-[250px] h-full border-r flex flex-col ${
        theme === 'dark'
          ? 'bg-surface/50 border-white/5'
          : 'bg-gray-50 border-gray-200'
      }`}
    >
      {/* Header */}
      <div className={`p-4 border-b ${theme === 'dark' ? 'border-white/5' : 'border-gray-200'}`}>
        <h2 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>
          {t('webAlbums')}
        </h2>
      </div>

      {/* Album List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {albums.map(album => (
          <div
            key={album.id}
            onClick={() => onSelectAlbum(album.id)}
            className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
              selectedAlbumId === album.id
                ? 'bg-primary/20 border border-primary/30'
                : theme === 'dark'
                  ? 'hover:bg-white/5 border border-transparent'
                  : 'hover:bg-gray-100 border border-transparent'
            }`}
          >
            {editingId === album.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleSaveEdit)}
                  autoFocus
                  className={`flex-1 px-2 py-1 text-sm rounded ${
                    theme === 'dark'
                      ? 'bg-black/30 text-white border border-white/10'
                      : 'bg-white text-gray-800 border border-gray-300'
                  }`}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                  className="p-1 text-green-500 hover:bg-green-500/20 rounded"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                  className="p-1 text-red-500 hover:bg-red-500/20 rounded"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <FolderOpen size={16} className="text-primary" />
                  <span
                    className={`text-sm font-medium truncate ${
                      theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                    }`}
                    onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(album); }}
                  >
                    {album.name}
                  </span>
                </div>
                <div className={`text-xs mt-1 ${theme === 'dark' ? 'text-white/40' : 'text-gray-400'}`}>
                  {album.images.length} {t('images')}
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t('deleteAlbumConfirm'))) {
                      onDeleteAlbum(album.id);
                    }
                  }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    theme === 'dark'
                      ? 'hover:bg-red-500/20 text-red-400'
                      : 'hover:bg-red-100 text-red-500'
                  }`}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}

        {/* Create New Album */}
        {isCreating ? (
          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-white/5' : 'bg-gray-100'}`}>
            <input
              type="text"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleCreate)}
              placeholder={t('albumName')}
              autoFocus
              className={`w-full px-2 py-1.5 text-sm rounded ${
                theme === 'dark'
                  ? 'bg-black/30 text-white border border-white/10 placeholder:text-white/30'
                  : 'bg-white text-gray-800 border border-gray-300 placeholder:text-gray-400'
              }`}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCreate}
                disabled={!newAlbumName.trim()}
                className="flex-1 py-1.5 text-xs font-medium bg-primary text-white rounded hover:bg-primary/80 disabled:opacity-50"
              >
                {t('confirm')}
              </button>
              <button
                onClick={() => { setIsCreating(false); setNewAlbumName(''); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded ${
                  theme === 'dark'
                    ? 'bg-white/10 text-white/70 hover:bg-white/20'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className={`w-full p-3 rounded-lg border-2 border-dashed text-sm font-medium transition-all ${
              theme === 'dark'
                ? 'border-white/10 text-white/40 hover:border-primary/50 hover:text-primary'
                : 'border-gray-300 text-gray-400 hover:border-primary/50 hover:text-primary'
            }`}
          >
            + {t('newAlbum')}
          </button>
        )}
      </div>
    </motion.aside>
  );
};

export default AlbumSidebar;
