import { motion } from '../../lib/motion';
import { AlbumSidebar } from '../../features/album/AlbumSidebar';
import { AlbumContent } from '../../features/album/AlbumContent';
import { useWebAlbums } from '../../hooks/useWebAlbums';

export const WebAlbumView = () => {
  const {
    albums,
    selectedAlbum,
    selectedAlbumId,
    selectAlbum,
    createAlbum,
    renameAlbum,
    deleteAlbum,
    addImage,
    removeImage
  } = useWebAlbums();

  const handleAddImage = (url) => {
    if (selectedAlbumId) {
      addImage(selectedAlbumId, url);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex overflow-hidden"
    >
      <AlbumSidebar
        albums={albums}
        selectedAlbumId={selectedAlbumId}
        onSelectAlbum={selectAlbum}
        onCreateAlbum={createAlbum}
        onRenameAlbum={renameAlbum}
        onDeleteAlbum={deleteAlbum}
      />
      <AlbumContent
        album={selectedAlbum}
        onAddImage={handleAddImage}
        onRemoveImage={removeImage}
      />
    </motion.div>
  );
};

export default WebAlbumView;
