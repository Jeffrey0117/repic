import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';

const STORAGE_KEY = 'repic-web-albums';

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Load albums from localStorage (for lazy initialization)
const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('[useWebAlbums] Failed to load from localStorage:', e);
    return [];
  }
};

/**
 * Hook for managing web albums with localStorage persistence
 */
export const useWebAlbums = () => {
  // Lazy initialization from localStorage - runs only once
  const [albums, setAlbums] = useState(() => loadFromStorage());
  const [selectedAlbumId, setSelectedAlbumId] = useState(() => {
    const stored = loadFromStorage();
    return stored.length > 0 ? stored[0].id : null;
  });

  // Save albums to localStorage whenever they change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
      } catch (e) {
        console.error('[useWebAlbums] Failed to save to localStorage:', e);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [albums]);

  // Get current selected album (memoized)
  const selectedAlbum = useMemo(() =>
    albums.find(a => a.id === selectedAlbumId) || null,
    [albums, selectedAlbumId]
  );

  // Create new album
  const createAlbum = useCallback((name) => {
    const newAlbum = {
      id: generateId(),
      name: name.trim() || `Album ${albums.length + 1}`,
      images: [],
      createdAt: Date.now()
    };
    setAlbums(prev => [...prev, newAlbum]);
    setSelectedAlbumId(newAlbum.id);
    return newAlbum;
  }, [albums.length]);

  // Rename album
  const renameAlbum = useCallback((albumId, newName) => {
    setAlbums(prev => prev.map(album =>
      album.id === albumId
        ? { ...album, name: newName.trim() }
        : album
    ));
  }, []);

  // Delete album
  const deleteAlbum = useCallback((albumId) => {
    setAlbums(prev => {
      const filtered = prev.filter(a => a.id !== albumId);
      // If deleted album was selected, select next available
      if (selectedAlbumId === albumId) {
        setSelectedAlbumId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  }, [selectedAlbumId]);

  // Add image to album
  const addImage = useCallback((albumId, url) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;

    const newImage = {
      id: generateId(),
      url: trimmedUrl,
      addedAt: Date.now()
    };

    setAlbums(prev => prev.map(album =>
      album.id === albumId
        ? { ...album, images: [...album.images, newImage] }
        : album
    ));

    return newImage;
  }, []);

  // Add multiple images to album
  const addImages = useCallback((albumId, urls) => {
    const validUrls = urls.filter(url => url.trim());
    if (validUrls.length === 0) return [];

    const newImages = validUrls.map(url => ({
      id: generateId(),
      url: url.trim(),
      addedAt: Date.now()
    }));

    setAlbums(prev => prev.map(album =>
      album.id === albumId
        ? { ...album, images: [...album.images, ...newImages] }
        : album
    ));

    return newImages;
  }, []);

  // Remove image from album
  const removeImage = useCallback((albumId, imageId) => {
    setAlbums(prev => prev.map(album =>
      album.id === albumId
        ? { ...album, images: album.images.filter(img => img.id !== imageId) }
        : album
    ));
  }, []);

  // Update image crop parameters (for virtual image cropping)
  const updateImageCrop = useCallback((albumId, imageId, crop) => {
    console.log('[updateImageCrop] albumId:', albumId, 'imageId:', imageId, 'crop:', crop);
    setAlbums(prev => {
      const newAlbums = prev.map(album =>
        album.id === albumId
          ? {
              ...album,
              images: album.images.map(img =>
                img.id === imageId
                  ? { ...img, crop }
                  : img
              )
            }
          : album
      );
      console.log('[updateImageCrop] Updated albums:', newAlbums);
      // Check if the image was found
      const targetAlbum = newAlbums.find(a => a.id === albumId);
      const targetImage = targetAlbum?.images.find(i => i.id === imageId);
      console.log('[updateImageCrop] Target image after update:', targetImage);
      return newAlbums;
    });
  }, []);

  // Clear image crop (reset to original)
  const clearImageCrop = useCallback((albumId, imageId) => {
    setAlbums(prev => prev.map(album =>
      album.id === albumId
        ? {
            ...album,
            images: album.images.map(img =>
              img.id === imageId
                ? { ...img, crop: undefined }
                : img
            )
          }
        : album
    ));
  }, []);

  // Select album (use startTransition for smoother UI)
  const selectAlbum = useCallback((albumId) => {
    startTransition(() => {
      setSelectedAlbumId(albumId);
    });
  }, []);

  // Reorder images in album (drag and drop)
  const reorderImages = useCallback((albumId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;

    setAlbums(prev => prev.map(album => {
      if (album.id !== albumId) return album;

      const images = [...album.images];
      const [removed] = images.splice(fromIndex, 1);
      images.splice(toIndex, 0, removed);

      return { ...album, images };
    }));
  }, []);

  // Export all albums to JSON
  const exportAlbums = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: Date.now(),
      albums
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repic-albums-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [albums]);

  // Import albums from JSON
  const importAlbums = useCallback((jsonData, mode = 'merge') => {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      if (!data.albums || !Array.isArray(data.albums)) {
        throw new Error('Invalid format');
      }

      if (mode === 'replace') {
        setAlbums(data.albums);
        setSelectedAlbumId(data.albums.length > 0 ? data.albums[0].id : null);
      } else {
        // Merge: add albums that don't exist by name
        setAlbums(prev => {
          const existingNames = new Set(prev.map(a => a.name));
          const newAlbums = data.albums.filter(a => !existingNames.has(a.name));
          return [...prev, ...newAlbums];
        });
      }
      return { success: true, count: data.albums.length };
    } catch (e) {
      console.error('[importAlbums] Error:', e);
      return { success: false, error: e.message };
    }
  }, []);

  return {
    albums,
    selectedAlbum,
    selectedAlbumId,
    selectAlbum,
    createAlbum,
    renameAlbum,
    deleteAlbum,
    addImage,
    addImages,
    removeImage,
    updateImageCrop,
    clearImageCrop,
    reorderImages,
    exportAlbums,
    importAlbums
  };
};

export default useWebAlbums;
