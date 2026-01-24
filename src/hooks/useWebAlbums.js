import { useState, useEffect, useCallback } from 'react';

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

  // Save albums to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
    } catch (e) {
      console.error('[useWebAlbums] Failed to save to localStorage:', e);
    }
  }, [albums]);

  // Get current selected album
  const selectedAlbum = albums.find(a => a.id === selectedAlbumId) || null;

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

  // Select album
  const selectAlbum = useCallback((albumId) => {
    setSelectedAlbumId(albumId);
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
    removeImage
  };
};

export default useWebAlbums;
