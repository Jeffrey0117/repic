import { useState, useEffect, lazy, Suspense, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from './lib/motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { Sidebar } from './components/ui/Sidebar';
import { InfoPanel } from './components/ui/InfoPanel';
import { TopBar } from './components/ui/TopBar';
import { SaveToolbar } from './components/ui/SaveToolbar';
import { Toast } from './components/ui/Toast';
import { UploadHistoryPanel } from './components/ui/UploadHistoryPanel';
import { ExportVirtualDialog } from './components/ui/ExportVirtualDialog';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { AboutDialog } from './components/ui/AboutDialog';
import { ContextMenu } from './components/ui/ContextMenu';
import { Copy, Download, FolderOutput, Trash2, Pencil } from './components/icons';
import { prepareSingleExport } from './utils/repicFile';
import { AlbumSidebar } from './features/album/AlbumSidebar';
import { useFileSystem } from './hooks/useFileSystem';
import { useWebAlbums } from './hooks/useWebAlbums';
import { useConfirmDialog } from './hooks/useConfirmDialog';
import useI18n from './hooks/useI18n';
import { loadImage, PRIORITY_HIGH } from './utils/imageLoader';

// Lazy load heavy components
const ImageEditor = lazy(() => import('./features/editor/ImageEditor').then(m => ({ default: m.ImageEditor })));
const BatchCropModal = lazy(() => import('./components/ui/BatchCropModal').then(m => ({ default: m.BatchCropModal })));

// Dynamic getter for electronAPI (injected via preload script)
const getElectronAPI = () => window.electronAPI || null;

function App() {
  const { t } = useI18n();
  const {
    currentImage,
    nextImage,
    prevImage,
    loadFolder,
    loadFile,
    files,
    selectImage,
    currentIndex,
    currentPath,
    currentMetadata,
    cacheVersion,
    setCacheVersion
  } = useFileSystem();

  // Web album hook
  const {
    albums,
    selectedAlbum,
    selectedAlbumId,
    selectAlbum,
    createAlbum,
    renameAlbum,
    deleteAlbum,
    addImage: addAlbumImage,
    addImages: addAlbumImages,
    removeImage: removeAlbumImage,
    updateImageCrop,
    reorderImages,
    exportAlbums,
    importAlbums
  } = useWebAlbums();

  // Album image navigation state
  const [albumImageIndex, setAlbumImageIndex] = useState(0);

  // Local state for edits/UI
  const [localImage, setLocalImage] = useState(null);
  const [localCrop, setLocalCrop] = useState(null);
  const [localAnnotations, setLocalAnnotations] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [isModified, setIsModified] = useState(false);

  // Batch crop state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchCrop, setBatchCrop] = useState(null);

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: '' });

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [showUploadHistory, setShowUploadHistory] = useState(false);

  // Copy to clipboard state
  const [isCopying, setIsCopying] = useState(false);

  // View mode: 'local' for file system view, 'album' for web album view
  const [viewMode, setViewMode] = useState('local');

  // Album sidebar collapsed state
  const [albumSidebarCollapsed, setAlbumSidebarCollapsed] = useState(false);

  // Thumbnail sidebar position: 'left' or 'bottom'
  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('repic-sidebar-position') || 'left';
  });

  // Drag-drop state for album mode
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const isInternalDrag = useRef(false);

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Multi-select state for album mode
  const [selectedImageIds, setSelectedImageIds] = useState(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Custom confirm dialog
  const [confirm, confirmDialogProps] = useConfirmDialog();

  // About dialog state
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, target: null });

  // Album rename state (triggered from context menu)
  const [renamingAlbumId, setRenamingAlbumId] = useState(null);

  // Sync file system image with local view only when currentImage or cacheVersion changes
  useEffect(() => {
    if (currentImage) {
      // Check if it's a .repic virtual image file
      if (currentImage.toLowerCase().endsWith('.repic')) {
        const electronAPI = getElectronAPI();
        if (electronAPI) {
          const result = electronAPI.readFile(currentImage);
          if (result && typeof result === 'object' && result.url) {
            setLocalImage(result.url);
            setLocalCrop(result.crop || null);
            setLocalAnnotations(result.annotations || null);
          } else {
            setLocalImage(null);
            setLocalCrop(null);
            setLocalAnnotations(null);
          }
        }
      } else {
        setLocalImage(`file://${currentImage}?v=${cacheVersion}`);
        setLocalCrop(null);
        setLocalAnnotations(null);
      }
      setIsEditing(false); // Reset editing when switching images
      setIsModified(false); // Reset modified state
    } else {
      setLocalImage(null);
      setLocalCrop(null);
      setLocalAnnotations(null);
      setIsModified(false);
    }
  }, [currentImage, cacheVersion]); // Also depend on cacheVersion for refresh after save

  // Listen for file open events (from file association / command line)
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (electronAPI?.onOpenFile) {
      electronAPI.onOpenFile((filePath) => {
        loadFile(filePath);
      });
    }
  }, [loadFile]);

  // Virtual image state (for opening .repic files directly)
  const [virtualImageData, setVirtualImageData] = useState(null);
  const [virtualSiblings, setVirtualSiblings] = useState([]);
  const [virtualIndex, setVirtualIndex] = useState(0);

  // Listen for virtual image open events (.repic files)
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (electronAPI?.onOpenVirtualImage) {
      electronAPI.onOpenVirtualImage((data) => {
        console.log('[App] Received virtual image:', data);

        // Smart jump: Check if source album exists
        const sourceAlbumId = data.source?.albumId || data.albumId;
        const sourceImageId = data.source?.imageId || data.imageId;

        if (sourceAlbumId) {
          // Check if album exists in our albums list
          const targetAlbum = albums.find(a => a.id === sourceAlbumId);
          if (targetAlbum) {
            console.log('[App] Found source album, jumping to:', targetAlbum.name);
            // Switch to album mode
            selectAlbum(sourceAlbumId);
            setViewMode('album');
            // Find the image index in the album
            const imgIndex = targetAlbum.images.findIndex(img => img.id === sourceImageId);
            if (imgIndex >= 0) {
              setAlbumImageIndex(imgIndex);
            }
            return;
          }
        }

        // Album not found or no albumId - use virtual mode
        setVirtualImageData(data);
        setVirtualSiblings(data.siblingFiles || []);
        const idx = (data.siblingFiles || []).findIndex(f => f === data.filePath);
        setVirtualIndex(idx >= 0 ? idx : 0);
        setViewMode('virtual');
      });
    }
  }, [albums, selectAlbum]);

  // Virtual image navigation
  const navigateVirtual = useCallback(async (newIndex) => {
    if (newIndex < 0 || newIndex >= virtualSiblings.length) return;
    const electronAPI = getElectronAPI();
    if (!electronAPI) return;

    const filePath = virtualSiblings[newIndex];
    const result = await electronAPI.readRepicFile(filePath);
    if (result.success && result.data) {
      setVirtualImageData({
        ...result.data,
        filePath,
        folderPath: electronAPI.path.dirname(filePath)
      });
      setVirtualIndex(newIndex);
    }
  }, [virtualSiblings]);

  const nextVirtualImage = useCallback(() => {
    navigateVirtual(virtualIndex + 1);
  }, [navigateVirtual, virtualIndex]);

  const prevVirtualImage = useCallback(() => {
    navigateVirtual(virtualIndex - 1);
  }, [navigateVirtual, virtualIndex]);

  const handleOpenFile = async () => {
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      const dir = await electronAPI.selectDirectory();
      if (dir) {
        loadFolder(dir);
      }
    }
  };

  // Refresh current view without changing folder
  const handleRefresh = useCallback(() => {
    if (viewMode === 'local' && currentPath) {
      loadFolder(currentPath, true);
    }
  }, [viewMode, currentPath, loadFolder]);

  // Track internal drag start (from sidebar thumbnails or image viewer)
  useEffect(() => {
    const handleDragStart = (e) => {
      // If drag started from within our app, mark it as internal
      if (e.target.closest('[data-app-root]')) {
        isInternalDrag.current = true;
      }
    };
    const handleDragEnd = () => {
      isInternalDrag.current = false;
    };
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  // Handle drag-drop for album mode (accept images from web browsers)
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    // Only show overlay for external drags (not from within the app)
    if (viewMode === 'album' && selectedAlbumId && !isInternalDrag.current) {
      setIsDragOver(true);
    }
  }, [viewMode, selectedAlbumId]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  // Check if URL looks like a direct image URL
  const looksLikeImageUrl = useCallback((url) => {
    if (!url) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const urlPath = url.split('?')[0].toLowerCase();
    return imageExtensions.some(ext => urlPath.endsWith(ext));
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    isInternalDrag.current = false;
    setIsDragOver(false);

    if (viewMode !== 'album' || !selectedAlbumId) return;

    // Try to extract image URL from the drop event
    const dataTransfer = e.dataTransfer;
    let imageUrl = null;
    let isFromHtmlImg = false;

    // Method 1: Check for text/uri-list (direct URL)
    const uriList = dataTransfer.getData('text/uri-list');
    if (uriList) {
      const urls = uriList.split('\n').filter(u => u.trim() && !u.startsWith('#'));
      if (urls.length > 0) {
        imageUrl = urls[0].trim();
      }
    }

    // Method 2: Check for text/html and extract img src
    if (!imageUrl) {
      const html = dataTransfer.getData('text/html');
      if (html) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match) {
          imageUrl = match[1];
          isFromHtmlImg = true;
        }
      }
    }

    // Method 3: Check for plain text URL
    if (!imageUrl) {
      const text = dataTransfer.getData('text/plain');
      if (text && text.trim().startsWith('http')) {
        imageUrl = text.trim();
      }
    }

    if (!imageUrl || !imageUrl.startsWith('http')) return;

    // Check if it's a direct image URL or a webpage
    const isDirectImage = isFromHtmlImg || looksLikeImageUrl(imageUrl);

    if (isDirectImage) {
      // Direct image - add immediately
      loadImage(imageUrl, PRIORITY_HIGH).catch(() => {});
      addAlbumImage(selectedAlbumId, imageUrl);
      setAlbumImageIndex(selectedAlbum?.images?.length || 0);
      setToast({ visible: true, message: t('imageAdded') || 'Image added!' });
    } else {
      // Webpage URL - try to scrape images
      const electronAPI = getElectronAPI();
      if (electronAPI?.scrapeImages) {
        setToast({ visible: true, message: t('scraping') || '正在抓取圖片...' });
        const result = await electronAPI.scrapeImages(imageUrl);
        if (result.success && result.images?.length > 0) {
          const newIndex = selectedAlbum?.images?.length || 0;
          addAlbumImages(selectedAlbumId, result.images);
          setAlbumImageIndex(newIndex);
          setToast({ visible: true, message: t('imagesAdded', { count: result.images.length }) || `已加入 ${result.images.length} 張圖片` });
        } else if (result.error) {
          // Scraping failed with error
          setToast({ visible: true, message: t('scrapeFailed') || `抓取失敗: ${result.error}` });
        } else {
          // No images found on the page
          setToast({ visible: true, message: t('noImagesFound') || '此網頁沒有找到圖片' });
        }
      } else {
        // No Electron API - show error for webpage URLs
        setToast({ visible: true, message: t('webpageNotSupported') || '不支援網頁拖放（請拖放圖片）' });
      }
    }
  }, [viewMode, selectedAlbumId, addAlbumImage, addAlbumImages, selectedAlbum?.images?.length, t, looksLikeImageUrl]);

  const handleCropComplete = async (result) => {
    // Check if this is a virtual image edit (returns edit params instead of image)
    if (result && typeof result === 'object' && (result.type === 'crop-params' || result.type === 'edit-params')) {
      // Virtual image edit in album mode - save to localStorage
      if (viewMode === 'album' && selectedAlbumId && albumImages[safeAlbumIndex]) {
        const imageId = albumImages[safeAlbumIndex].id;
        updateImageCrop(selectedAlbumId, imageId, result.crop, result.annotations);
        setToast({ visible: true, message: t('cropSaved') });
      }
      // Virtual image edit in local mode (.repic file) - save to file
      else if (viewMode === 'local' && currentImage?.toLowerCase().endsWith('.repic')) {
        const electronAPI = getElectronAPI();
        if (electronAPI) {
          // Read current .repic data
          const currentData = electronAPI.readFile(currentImage);
          if (currentData && currentData.url) {
            // Update with new crop and annotations
            const updatedData = {
              v: 2,
              type: 'virtual-image',
              url: currentData.url,
              name: currentData.name,
              source: currentData.source,
              crop: result.crop,
              annotations: result.annotations?.length > 0 ? result.annotations : undefined,
              createdAt: currentData.createdAt || Date.now()
            };
            // Write back to file
            const writeResult = await electronAPI.writeRepicFile(currentImage, updatedData);
            if (writeResult.success) {
              setLocalCrop(result.crop);
              setLocalAnnotations(result.annotations || null);
              setCacheVersion(prev => prev + 1); // Refresh sidebar thumbnails
              setToast({ visible: true, message: t('cropSaved') });
            } else {
              console.error('[handleCropComplete] Failed to save edit:', writeResult.error);
              setToast({ visible: true, message: t('saveFailed') });
            }
          }
        }
      }
      setIsEditing(false);
      return;
    }

    // Normal crop - replace local image with cropped version
    setLocalImage(result);
    setIsEditing(false);
    setIsModified(true); // Mark as modified after crop
    // Toast will show after save, not after crop
  };

  const handleSaveReplace = async () => {
    const electronAPI = getElectronAPI();
    console.log('[handleSaveReplace] currentImage:', currentImage);
    console.log('[handleSaveReplace] localImage starts with data:', localImage?.startsWith('data:'));

    if (!currentImage || !localImage.startsWith('data:')) {
      console.log('[handleSaveReplace] Early return - missing data');
      return;
    }
    if (!electronAPI) {
      console.log('[handleSaveReplace] Early return - no electronAPI');
      return;
    }

    console.log('[handleSaveReplace] Calling saveFile...');
    const result = await electronAPI.saveFile(currentImage, localImage);
    console.log('[handleSaveReplace] Result:', result);

    if (result.success) {
      // Reload the image with cache-busting timestamp
      const originalPath = currentImage;
      const timestamp = Date.now();
      setLocalImage(`file://${originalPath}?t=${timestamp}`);
      setIsModified(false);
      setToast({ visible: true, message: t('saveSuccess') });

      // Refresh folder to update sidebar thumbnails (preserve current position)
      if (currentPath) {
        loadFolder(currentPath, true);
      }
    } else {
      alert(t("failedToSave", { error: result.error }));
    }
  };

  const handleSaveAs = async () => {
    const electronAPI = getElectronAPI();
    if (!localImage.startsWith('data:')) return;
    if (!electronAPI) return;

    let defaultName = `repic-${Date.now()}.png`;
    if (currentImage) {
      const ext = electronAPI.path.extname(currentImage);
      const base = electronAPI.path.basename(currentImage, ext);
      defaultName = `${base}-cropped${ext}`;
    }

    const defaultPath = currentPath ? electronAPI.path.join(currentPath, defaultName) : defaultName;

    const { canceled, filePath } = await electronAPI.showSaveDialog(defaultPath);

    if (!canceled && filePath) {
      const result = await electronAPI.saveFile(filePath, localImage);

      if (result.success) {
        setIsModified(false);
        setToast({ visible: true, message: t('saveSuccess') });
        if (currentPath) loadFolder(currentPath); // Refresh folder if applicable
      } else {
        alert(t("failedToSave", { error: result.error }));
      }
    }
  };

  const handleDiscard = async () => {
    const confirmed = await confirm(t("discardChanges"), {
      title: t('confirmDiscard'),
      confirmText: t('discard'),
      cancelText: t('cancel'),
      danger: true
    });
    if (confirmed) {
      if (currentImage) {
        setLocalImage(`file://${currentImage}`);
      } else {
        setLocalImage(null);
      }
      setIsModified(false);
    }
  };

  // Batch crop handlers
  const handleApplyToAll = (crop) => {
    setBatchCrop(crop);
    setShowBatchModal(true);
  };

  const handleBatchCropConfirm = async (selectedIndexes, outputMode, customDir, onProgress) => {
    const electronAPI = getElectronAPI();
    if (!batchCrop) {
      console.error('[handleBatchCropConfirm] No batchCrop defined');
      return;
    }
    if (!electronAPI) {
      console.error('[handleBatchCropConfirm] No electronAPI');
      return;
    }

    console.log('[handleBatchCropConfirm] Starting batch crop', {
      batchCrop,
      selectedIndexes,
      outputMode,
      currentIndex
    });

    let successCount = 0;
    let failCount = 0;

    // Include current image + selected images
    const allIndexes = [currentIndex, ...selectedIndexes];

    for (let i = 0; i < allIndexes.length; i++) {
      const filePath = files[allIndexes[i]];
      console.log(`[handleBatchCropConfirm] Processing ${i + 1}/${allIndexes.length}: ${filePath}`);
      onProgress(i + 1);

      try {
        // Load image using electronAPI.readFile for reliable file:// access
        const dataUrl = electronAPI.readFile(filePath);
        if (!dataUrl) {
          throw new Error('Failed to read file');
        }

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = dataUrl;
        });

        // Create canvas and crop
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate pixel crop from percentage
        const cropX = (batchCrop.x / 100) * img.naturalWidth;
        const cropY = (batchCrop.y / 100) * img.naturalHeight;
        const cropWidth = (batchCrop.width / 100) * img.naturalWidth;
        const cropHeight = (batchCrop.height / 100) * img.naturalHeight;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        ctx.drawImage(
          img,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, cropWidth, cropHeight
        );

        const base64Data = canvas.toDataURL('image/png');

        console.log('Sending batch-crop-save:', { filePath, outputMode, customDir });
        const result = await electronAPI.batchCropSave({
          filePath,
          base64Data,
          outputMode,
          originalPath: filePath,
          customDir
        });
        console.log('batch-crop-save result:', result);

        if (result && result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Failed to save ${filePath}:`, result?.error || 'Unknown error');
        }
      } catch (e) {
        failCount++;
        console.error(`Failed to crop ${filePath}:`, e.message, e);
      }
    }

    // Show result feedback
    if (failCount > 0) {
      alert(t('completedMessage', { success: successCount, failed: failCount }));
    } else {
      setToast({ visible: true, message: t('batchSuccess', { count: successCount }) });
    }

    // Refresh folder after batch complete
    if (currentPath) {
      loadFolder(currentPath, true); // preserve index, refresh cache
    }

    // Update current image display
    if (currentImage) {
      setLocalImage(`file://${currentImage}?t=${Date.now()}`);
    }

    setIsEditing(false);
    setIsModified(false);
  };

  const handleClear = async () => {
    const confirmed = await confirm(t("closeImage"), {
      title: t('confirmClose'),
      confirmText: t('close'),
      cancelText: t('cancel')
    });
    if (confirmed) {
      setLocalImage(null);
      setIsEditing(false);
    }
  };

  // Toggle image selection for multi-select mode
  const toggleImageSelection = useCallback((imageId) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  }, []);

  // Batch delete selected images
  const handleBatchDelete = useCallback(async () => {
    if (selectedImageIds.size === 0 || !selectedAlbumId) return;

    const confirmed = await confirm(t('deleteSelectedConfirm', { count: selectedImageIds.size }), {
      title: t('confirmDelete'),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      danger: true
    });
    if (confirmed) {
      // Delete all selected images
      selectedImageIds.forEach(imageId => {
        removeAlbumImage(selectedAlbumId, imageId);
      });
      // Clear selection and exit multi-select mode
      setSelectedImageIds(new Set());
      setIsMultiSelectMode(false);
      // Reset index if needed
      setAlbumImageIndex(0);
    }
  }, [selectedImageIds, selectedAlbumId, removeAlbumImage, t, confirm]);

  // Exit multi-select mode
  const exitMultiSelectMode = useCallback(() => {
    setSelectedImageIds(new Set());
    setIsMultiSelectMode(false);
  }, []);

  // Batch download selected images
  const handleBatchDownload = useCallback(async () => {
    if (selectedImageIds.size === 0 || !selectedAlbum) return;

    const electronAPI = getElectronAPI();
    if (!electronAPI) return;

    // Select folder to save
    const folder = await electronAPI.selectDirectory();
    if (!folder) return;

    const selectedImages = selectedAlbum.images.filter(img => selectedImageIds.has(img.id));
    let successCount = 0;
    let failCount = 0;

    setToast({ visible: true, message: t('processing') });

    for (let i = 0; i < selectedImages.length; i++) {
      const img = selectedImages[i];
      try {
        // Fetch image
        const response = await fetch(img.url);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();

        // Convert to base64
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Generate filename
        const urlFilename = img.url.split('/').pop()?.split('?')[0] || `image-${i + 1}`;
        const ext = blob.type.split('/')[1] || 'png';
        const filename = urlFilename.includes('.') ? urlFilename : `${urlFilename}.${ext}`;
        const filePath = electronAPI.path.join(folder, filename);

        // Save file
        const result = await electronAPI.saveFile(filePath, base64);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error('[BatchDownload] Failed:', img.url, err);
        failCount++;
      }
    }

    // Show result
    if (failCount > 0) {
      setToast({ visible: true, message: t('completedMessage', { success: successCount, failed: failCount }) });
    } else {
      setToast({ visible: true, message: t('downloadSuccess') + ` (${successCount})` });
    }

    // Exit multi-select
    setSelectedImageIds(new Set());
    setIsMultiSelectMode(false);
  }, [selectedImageIds, selectedAlbum, t]);

  // Batch upload selected images to cloud
  const handleBatchUpload = useCallback(async () => {
    if (selectedImageIds.size === 0 || !selectedAlbum) return;

    const selectedImages = selectedAlbum.images.filter(img => selectedImageIds.has(img.id));
    const uploadedUrls = [];
    let failCount = 0;

    setToast({ visible: true, message: t('uploading') });

    for (const img of selectedImages) {
      try {
        // Fetch image
        const response = await fetch(img.url);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();

        // Upload to urusai.cc
        const formData = new FormData();
        const filename = img.url.split('/').pop()?.split('?')[0] || `image-${Date.now()}.png`;
        formData.append('file', blob, filename);

        const uploadRes = await fetch('https://api.urusai.cc/v1/upload', {
          method: 'POST',
          body: formData
        });
        const result = await uploadRes.json();

        if (result.status === 'success' && result.data) {
          const imageUrl = result.data.url_direct || result.data.url_preview;
          uploadedUrls.push(imageUrl);
        } else {
          failCount++;
        }
      } catch (err) {
        console.error('[BatchUpload] Failed:', img.url, err);
        failCount++;
      }
    }

    // Copy all URLs to clipboard
    if (uploadedUrls.length > 0) {
      const urlText = uploadedUrls.join('\n');
      try {
        await navigator.clipboard.writeText(urlText);
        setToast({ visible: true, message: `${t('uploadSuccess')} (${uploadedUrls.length})` });
      } catch {
        prompt('上傳成功！複製網址：', urlText);
      }
    }

    if (failCount > 0) {
      setToast({ visible: true, message: t('completedMessage', { success: uploadedUrls.length, failed: failCount }) });
    }

    // Exit multi-select
    setSelectedImageIds(new Set());
    setIsMultiSelectMode(false);
  }, [selectedImageIds, selectedAlbum, t]);

  // Single image export to .repic
  const handleExportSingle = useCallback(async (image, album = null) => {
    const electronAPI = getElectronAPI();
    if (!electronAPI) return;

    const { filename, data } = prepareSingleExport(
      image,
      album?.id || null,
      album?.name || null
    );

    // Show save dialog
    const { canceled, filePath } = await electronAPI.showSaveDialog(filename);
    if (canceled || !filePath) return;

    try {
      const result = await electronAPI.writeRepicFile(filePath, data);
      if (result.success) {
        setToast({ visible: true, message: t('exportSuccess', { count: 1 }) });
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      console.error('[handleExportSingle] Error:', e);
      setToast({ visible: true, message: t('exportFailed', { error: e.message }) });
    }
  }, [t]);

  // Handle image context menu
  const handleImageContextMenu = useCallback((e, image, album = null) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      target: { type: 'image', image, album }
    });
  }, []);

  // Handle album context menu
  const handleAlbumContextMenu = useCallback((e, album) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      target: { type: 'album', album }
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, target: null });
  }, []);

  const handleSave = async () => {
    // For album mode: download web image to local
    if (viewMode === 'album' && selectedAlbum && selectedAlbum.images[albumImageIndex]) {
      const imageUrl = selectedAlbum.images[albumImageIndex].url;
      const electronAPI = getElectronAPI();

      try {
        // Fetch image as blob
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Failed to fetch image');
        const blob = await response.blob();

        // Convert to base64
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Get filename from URL
        const urlFilename = imageUrl.split('/').pop()?.split('?')[0] || `image-${Date.now()}`;
        const ext = blob.type.split('/')[1] || 'png';
        const defaultName = urlFilename.includes('.') ? urlFilename : `${urlFilename}.${ext}`;

        if (electronAPI) {
          // Electron: use save dialog
          const { canceled, filePath } = await electronAPI.showSaveDialog(defaultName);
          if (!canceled && filePath) {
            const result = await electronAPI.saveFile(filePath, base64);
            if (result.success) {
              setToast({ visible: true, message: t('downloadSuccess') });
            } else {
              throw new Error(result.error);
            }
          }
        } else {
          // Fallback: browser download
          const link = document.createElement('a');
          link.download = defaultName;
          link.href = base64;
          link.click();
          setToast({ visible: true, message: t('downloadSuccess') });
        }
      } catch (error) {
        console.error('[handleSave] Download error:', error);
        setToast({ visible: true, message: t('downloadFailed', { error: error.message }) });
      }
      return;
    }

    // For local mode: existing behavior
    const link = document.createElement('a');
    link.download = `repic-${Date.now()}.png`;
    link.href = localImage;
    link.click();
  };

  // Album navigation (memoized for performance)
  const albumImages = useMemo(() => selectedAlbum?.images || [], [selectedAlbum?.images]);
  // Ensure index is within bounds (important when switching albums)
  const safeAlbumIndex = useMemo(() =>
    albumImages.length > 0 ? Math.min(albumImageIndex, albumImages.length - 1) : 0,
    [albumImages.length, albumImageIndex]
  );
  const currentAlbumImage = useMemo(() =>
    albumImages.length > 0 ? (albumImages[safeAlbumIndex]?.url || null) : null,
    [albumImages, safeAlbumIndex]
  );

  const nextAlbumImage = useCallback(() => {
    if (albumImageIndex < albumImages.length - 1) {
      setAlbumImageIndex(albumImageIndex + 1);
    }
  }, [albumImageIndex, albumImages.length]);

  const prevAlbumImage = useCallback(() => {
    if (albumImageIndex > 0) {
      setAlbumImageIndex(albumImageIndex - 1);
    }
  }, [albumImageIndex]);

  // Reset album image index when album changes
  useEffect(() => {
    setAlbumImageIndex(0);
  }, [selectedAlbumId]);

  // Preload adjacent album images for smoother navigation
  useEffect(() => {
    if (viewMode !== 'album' || albumImages.length === 0) return;

    const preloadRange = 3;
    const toPreload = [];

    for (let i = 1; i <= preloadRange; i++) {
      if (safeAlbumIndex + i < albumImages.length) {
        toPreload.push(albumImages[safeAlbumIndex + i]?.url);
      }
      if (safeAlbumIndex - i >= 0) {
        toPreload.push(albumImages[safeAlbumIndex - i]?.url);
      }
    }

    toPreload.filter(Boolean).forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, [viewMode, safeAlbumIndex, albumImages]);

  // Copy image to clipboard
  const handleCopy = async () => {
    // Determine current image source and crop params
    let imageSrc = null;
    let cropParams = null;
    if (viewMode === 'album' && currentAlbumImage) {
      imageSrc = currentAlbumImage;
      cropParams = albumImages[safeAlbumIndex]?.crop;
    } else if (viewMode === 'virtual' && virtualImageData?.url) {
      imageSrc = virtualImageData.url;
      cropParams = virtualImageData.crop;
    } else if (localImage) {
      imageSrc = localImage;
      cropParams = localCrop;
    }

    if (!imageSrc) {
      setToast({ visible: true, message: t('noImageToCopy') });
      return;
    }

    setIsCopying(true);

    try {
      let blob;

      if (imageSrc.startsWith('data:')) {
        // Base64 data URL
        const response = await fetch(imageSrc);
        blob = await response.blob();
      } else if (imageSrc.startsWith('file://')) {
        // Local file - read via electronAPI
        const electronAPI = getElectronAPI();
        if (electronAPI) {
          const cleanPath = imageSrc.replace('file://', '').split('?')[0];
          const dataUrl = electronAPI.readFile(cleanPath);
          if (dataUrl) {
            const response = await fetch(dataUrl);
            blob = await response.blob();
          }
        }
      } else if (imageSrc.startsWith('http')) {
        // Web image - fetch directly
        const response = await fetch(imageSrc);
        blob = await response.blob();
      }

      if (!blob) {
        throw new Error('Failed to load image');
      }

      // Convert to PNG for clipboard compatibility
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });

      // Apply crop if exists
      if (cropParams) {
        const cropX = (cropParams.x / 100) * img.naturalWidth;
        const cropY = (cropParams.y / 100) * img.naturalHeight;
        const cropW = (cropParams.width / 100) * img.naturalWidth;
        const cropH = (cropParams.height / 100) * img.naturalHeight;
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      } else {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
      }

      URL.revokeObjectURL(img.src);

      // Copy to clipboard
      canvas.toBlob(async (pngBlob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
          ]);
          setToast({ visible: true, message: t('copySuccess') });
        } catch (clipboardError) {
          console.error('[handleCopy] Clipboard error:', clipboardError);
          setToast({ visible: true, message: t('copyFailed') });
        }
      }, 'image/png');

    } catch (error) {
      console.error('[handleCopy] Error:', error);
      setToast({ visible: true, message: t('copyFailed', { error: error.message }) });
    } finally {
      setIsCopying(false);
    }
  };

  const handleUpload = async () => {
    if (!localImage) {
      setToast({ visible: true, message: t('noImageToUpload') });
      return;
    }

    setIsUploading(true);
    console.log('[handleUpload] Starting upload, localImage:', localImage.substring(0, 50));

    try {
      // Convert image to blob
      let blob;
      if (localImage.startsWith('data:')) {
        // Base64 data URL
        console.log('[handleUpload] Converting data URL to blob');
        const response = await fetch(localImage);
        blob = await response.blob();
      } else if (localImage.startsWith('file://')) {
        // Local file - need to read via electronAPI
        const electronAPI = getElectronAPI();
        if (electronAPI) {
          const cleanPath = localImage.replace('file://', '').split('?')[0];
          console.log('[handleUpload] Reading file:', cleanPath);
          const dataUrl = electronAPI.readFile(cleanPath);
          if (dataUrl) {
            const response = await fetch(dataUrl);
            blob = await response.blob();
          }
        }
      }

      if (!blob) {
        throw new Error('Failed to read image');
      }

      console.log('[handleUpload] Blob created, size:', blob.size, 'type:', blob.type);

      // Convert WebP to PNG for better social media compatibility
      let uploadBlob = blob;
      if (blob.type === 'image/webp') {
        console.log('[handleUpload] Converting WebP to PNG...');
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        uploadBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        console.log('[handleUpload] Converted to PNG, size:', uploadBlob.size);
      }

      // Create form data
      const formData = new FormData();
      const ext = uploadBlob.type === 'image/png' ? 'png' : (uploadBlob.type.split('/')[1] || 'png');
      const filename = `repic-${Date.now()}.${ext}`;
      formData.append('file', uploadBlob, filename);

      console.log('[handleUpload] Uploading to urusai.cc...');

      // Upload to urusai.cc
      const response = await fetch('https://api.urusai.cc/v1/upload', {
        method: 'POST',
        body: formData
      });

      console.log('[handleUpload] Response status:', response.status);
      const responseText = await response.text();
      console.log('[handleUpload] Response text:', responseText);

      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid response: ${responseText.substring(0, 100)}`);
      }

      console.log('[handleUpload] Parsed result:', result);

      // urusai.cc 回傳格式: { status, message, data: { id, url_preview, url_direct, ... } }
      if (result.status === 'success' && result.data) {
        // 優先使用 url_direct，其次 url_preview
        const imageUrl = result.data.url_direct || result.data.url_preview || `https://i.urusai.cc/${result.data.id}`;

        // 儲存到上傳歷史
        const newUpload = {
          id: result.data.id,
          url: imageUrl,
          timestamp: Date.now(),
          filename: result.data.filename || `repic-${Date.now()}`
        };
        setUploadHistory(prev => [newUpload, ...prev].slice(0, 50)); // 最多保留 50 筆

        // 嘗試複製到剪貼簿，失敗則用 prompt
        try {
          await navigator.clipboard.writeText(imageUrl);
          setToast({ visible: true, message: t('uploadSuccess') });
        } catch {
          // Clipboard API 失敗，用 prompt 讓用戶手動複製
          prompt(t('uploadSuccessManualCopy'), imageUrl);
        }

        console.log('[handleUpload] Success! URL:', imageUrl);
      } else if (result.error || (result.status && result.status !== 'success')) {
        throw new Error(result.error || result.message || 'Upload failed');
      } else {
        throw new Error('No data in response');
      }
    } catch (error) {
      console.error('[handleUpload] Error:', error);
      setToast({ visible: true, message: t('uploadFailed', { error: error.message }) });
    } finally {
      setIsUploading(false);
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditing) return;
      if (viewMode === 'virtual') {
        if (e.key === 'ArrowRight') nextVirtualImage();
        if (e.key === 'ArrowLeft') prevVirtualImage();
        if (e.key === 'Escape') {
          setViewMode('local');
          setVirtualImageData(null);
        }
      } else if (viewMode === 'album') {
        if (e.key === 'ArrowRight') nextAlbumImage();
        if (e.key === 'ArrowLeft') prevAlbumImage();
      } else {
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'ArrowLeft') prevImage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, viewMode, nextImage, prevImage, nextAlbumImage, prevAlbumImage, nextVirtualImage, prevVirtualImage]);

  // Paste from clipboard (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = async (e) => {
      // Skip if editing or if focus is on an input
      if (isEditing) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // Check for image blob
      const imageItem = Array.from(clipboardData.items).find(
        item => item.type.startsWith('image/')
      );

      if (imageItem) {
        e.preventDefault();
        const blob = imageItem.getAsFile();
        if (!blob) return;

        // Convert to base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result;

          if (viewMode === 'album' && selectedAlbumId) {
            // Album mode: upload and add URL
            try {
              const formData = new FormData();
              formData.append('file', blob, `paste-${Date.now()}.png`);
              const response = await fetch('https://api.urusai.cc/v1/upload', {
                method: 'POST',
                body: formData
              });
              const result = await response.json();
              if (result.status === 'success' && result.data) {
                const imageUrl = result.data.url_direct || result.data.url_preview;
                addAlbumImage(selectedAlbumId, imageUrl);
                // Jump to newly added image
                setAlbumImageIndex(selectedAlbum?.images?.length || 0);
                setToast({ visible: true, message: t('imageAdded') });
              }
            } catch (err) {
              console.error('[Paste] Upload failed:', err);
              setToast({ visible: true, message: t('uploadFailed', { error: err.message }) });
            }
          } else {
            // Local mode: set as current image (unsaved)
            setLocalImage(base64);
            setIsModified(true);
            setToast({ visible: true, message: t('imageAdded') });
          }
        };
        reader.readAsDataURL(blob);
        return;
      }

      // Check for URL text
      const text = clipboardData.getData('text/plain');
      if (text && text.trim().startsWith('http')) {
        const urls = text.split(/[\n,]/).map(u => u.trim()).filter(u => u.startsWith('http'));
        if (urls.length > 0 && viewMode === 'album' && selectedAlbumId) {
          e.preventDefault();
          // Jump to first newly added image position
          const newIndex = selectedAlbum?.images?.length || 0;
          // Add all URLs in single batch (triggers one state update, thumbnails load lazily)
          addAlbumImages(selectedAlbumId, urls);
          setAlbumImageIndex(newIndex);
          // Show count if multiple URLs
          const msg = urls.length > 1
            ? (t('imagesAdded', { count: urls.length }) || `已加入 ${urls.length} 張圖片`)
            : t('imageAdded');
          setToast({ visible: true, message: msg });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isEditing, viewMode, selectedAlbumId, addAlbumImage, addAlbumImages, selectedAlbum?.images?.length, t]);

  return (
    <div
      data-app-root="true"
      className="h-screen w-screen bg-[#0A0A0A] text-white overflow-hidden flex flex-col select-none relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Global Drag Overlay - uses CSS transitions for instant response */}
      <div
        className={`absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none transition-opacity duration-150 ${
          isDragOver && viewMode === 'album' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className={`flex flex-col items-center gap-4 transition-transform duration-150 ${isDragOver ? 'scale-100' : 'scale-95'}`}>
          <div className={`w-24 h-24 rounded-2xl border-4 border-dashed border-primary flex items-center justify-center ${isDragOver ? 'animate-pulse' : ''}`}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold drop-shadow-md" style={{ color: '#ffffff' }}>放開以新增圖片</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>拖曳圖片或網址到此處</p>
          </div>
        </div>
      </div>

      {/* 1. Header Section */}
      <TopBar
        currentPath={currentPath}
        onOpenFolder={handleOpenFile}
        showInfoPanel={showInfoPanel}
        onToggleInfo={() => setShowInfoPanel(!showInfoPanel)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(viewMode === 'local' ? 'album' : 'local')}
        selectedAlbum={selectedAlbum}
        onAddAlbumImage={(url) => {
          if (selectedAlbumId) {
            loadImage(url, PRIORITY_HIGH).catch(() => {});
            addAlbumImage(selectedAlbumId, url);
            setAlbumImageIndex(albumImages.length);
          }
        }}
        albumSidebarCollapsed={albumSidebarCollapsed}
        onToggleAlbumSidebar={() => setAlbumSidebarCollapsed(!albumSidebarCollapsed)}
        sidebarPosition={sidebarPosition}
        onToggleSidebarPosition={() => {
          const newPos = sidebarPosition === 'left' ? 'bottom' : 'left';
          setSidebarPosition(newPos);
          localStorage.setItem('repic-sidebar-position', newPos);
        }}
        onAbout={() => setShowAboutDialog(true)}
        // Toolbar props
        onRefresh={handleRefresh}
        onToggleEdit={() => setIsEditing(!isEditing)}
        isEditing={isEditing}
        onCopy={handleCopy}
        isCopying={isCopying}
        onUpload={handleUpload}
        isUploading={isUploading}
        onToggleUploadHistory={() => setShowUploadHistory(!showUploadHistory)}
        uploadHistoryCount={uploadHistory.length}
        onExportVirtual={() => setShowExportDialog(true)}
        onDelete={async () => {
          if (isMultiSelectMode && selectedImageIds?.size > 0) {
            handleBatchDelete();
          } else if (viewMode === 'album' && selectedAlbumId && albumImages[safeAlbumIndex]) {
            const imageToDelete = albumImages[safeAlbumIndex];
            const confirmed = await confirm(t('deleteImageConfirm'), {
              title: t('confirmDelete'),
              confirmText: t('delete'),
              cancelText: t('cancel'),
              danger: true
            });
            if (confirmed) {
              removeAlbumImage(selectedAlbumId, imageToDelete.id);
              setSelectedImageIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(imageToDelete.id);
                return newSet;
              });
              if (safeAlbumIndex >= albumImages.length - 1 && safeAlbumIndex > 0) {
                setAlbumImageIndex(prev => prev - 1);
              }
            }
          } else {
            handleClear();
          }
        }}
        onSave={handleSave}
        hasImage={!!(localImage || currentAlbumImage || virtualImageData?.url)}
        isMultiSelectMode={viewMode === 'album' && isMultiSelectMode}
        selectedImageIds={selectedImageIds}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-row transition-all duration-300">
        {/* Album Sidebar - always full height on the left */}
        {viewMode === 'album' && (
          <AlbumSidebar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            onSelectAlbum={selectAlbum}
            onCreateAlbum={createAlbum}
            onRenameAlbum={renameAlbum}
            onDeleteAlbum={async (albumId) => {
              const album = albums.find(a => a.id === albumId);
              if (!album) return;
              const confirmed = await confirm(t('deleteAlbumConfirm'), {
                title: t('confirmDelete'),
                confirmText: t('delete'),
                cancelText: t('cancel'),
                danger: true
              });
              if (confirmed) {
                deleteAlbum(albumId);
              }
            }}
            onExportAlbums={exportAlbums}
            onImportAlbums={(json) => {
              const result = importAlbums(json);
              if (result.success) {
                setToast({ visible: true, message: `匯入成功 (${result.count} 個相簿)` });
              } else {
                setToast({ visible: true, message: `匯入失敗: ${result.error}` });
              }
            }}
            onContextMenu={handleAlbumContextMenu}
            isVisible={!albumSidebarCollapsed}
            renamingAlbumId={renamingAlbumId}
            onClearRenaming={() => setRenamingAlbumId(null)}
          />
        )}

        {/* Right content area: changes layout based on sidebar position */}
        <div className={`flex-1 flex min-w-0 overflow-hidden ${sidebarPosition === 'bottom' ? 'flex-col' : 'flex-row'}`}>
          {/* Inner row: (Sidebar if left) + main + InfoPanel */}
          <div className="flex flex-row flex-1 min-h-0 min-w-0 overflow-hidden">
            {/* Left Sidebar: Thumbnail Explorer - only when position is left */}
            {sidebarPosition === 'left' && ((viewMode === 'album' && albumImages.length > 0) || (viewMode !== 'album' && files.length > 0)) && (
              <Sidebar
                files={viewMode === 'album' ? albumImages : files}
                currentIndex={viewMode === 'album' ? safeAlbumIndex : currentIndex}
                cacheVersion={cacheVersion}
                onSelect={viewMode === 'album' ? setAlbumImageIndex : selectImage}
                mode={viewMode === 'album' ? 'web' : 'local'}
                isMultiSelectMode={viewMode === 'album' && isMultiSelectMode}
                selectedIds={selectedImageIds}
                onToggleSelect={toggleImageSelection}
                onEnterMultiSelect={() => setIsMultiSelectMode(true)}
                onExitMultiSelect={exitMultiSelectMode}
                onDeleteSelected={handleBatchDelete}
                onDownloadSelected={handleBatchDownload}
                onUploadSelected={handleBatchUpload}
                onReorder={viewMode === 'album' ? (from, to) => reorderImages(selectedAlbumId, from, to) : undefined}
                onContextMenu={viewMode === 'album' ? (e, image) => handleImageContextMenu(e, image, selectedAlbum) : undefined}
                position={sidebarPosition}
              />
            )}

        {/* Center: Main Viewport */}
        <main
          className="flex-1 min-w-0 min-h-0 relative main-viewport-bg overflow-hidden transition-all duration-300"
        >
          <AnimatePresence>
            {viewMode === 'virtual' ? (
              // Virtual image mode (opened from .repic file)
              virtualImageData ? (
                <motion.div
                  key="virtual-viewer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-[#0f0f0f]"
                >
                  <div className="w-full h-full p-4">
                    <ImageViewer src={virtualImageData.url} crop={virtualImageData.crop} annotations={virtualImageData.annotations} />
                  </div>
                  {/* Navigation info */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-lg text-white/80 text-sm">
                    {virtualImageData.name || 'Virtual Image'} ({virtualIndex + 1}/{virtualSiblings.length})
                  </div>
                  {/* Close button */}
                  <button
                    onClick={() => { setViewMode('local'); setVirtualImageData(null); }}
                    className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg"
                  >
                    ESC
                  </button>
                </motion.div>
              ) : null
            ) : viewMode === 'album' ? (
              // Album mode
              currentAlbumImage ? (
                <motion.div
                  key="album-viewer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-[#0f0f0f]"
                  onContextMenu={(e) => handleImageContextMenu(e, albumImages[safeAlbumIndex], selectedAlbum)}
                >
                  <div className="w-full h-full p-4">
                    <ImageViewer src={currentAlbumImage} crop={albumImages[safeAlbumIndex]?.crop} annotations={albumImages[safeAlbumIndex]?.annotations} />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="album-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center"
                >
                  <div className="flex flex-col items-center max-w-md px-8">
                    {/* Icon */}
                    <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    </div>

                    <p className="text-xl font-medium text-white/60">{selectedAlbum ? t('emptyAlbum') : t('selectOrCreateAlbum')}</p>

                    {selectedAlbum && (
                      <>
                        <p className="text-sm mt-2 text-white/40">{t('pasteUrlHint')}</p>
                        <div className="mt-6 w-full">
                          <input
                            type="text"
                            placeholder={t('pasteImageUrl')}
                            className="w-full px-4 py-3 text-sm rounded-xl bg-white/5 text-white border border-white/10 placeholder:text-white/30 focus:border-primary/50 focus:outline-none backdrop-blur-sm"
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (text) {
                                const urls = text.split(/[\n,]/).map(u => u.trim()).filter(Boolean);
                                if (urls.length > 0 && urls.every(url => url.startsWith('http'))) {
                                  e.preventDefault();
                                  const newIndex = albumImages.length;
                                  if (selectedAlbumId) addAlbumImages(selectedAlbumId, urls);
                                  setAlbumImageIndex(newIndex);
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target.value.trim()) {
                                const urls = e.target.value.split(/[\n,]/).map(u => u.trim()).filter(Boolean);
                                const newIndex = albumImages.length;
                                if (selectedAlbumId) addAlbumImages(selectedAlbumId, urls);
                                setAlbumImageIndex(newIndex);
                                e.target.value = '';
                              }
                            }}
                          />
                          <p className="text-xs text-white/30 mt-2 text-center">{t('pasteOrEnter')}</p>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )
            ) : (
              // Local mode
              localImage && !isEditing ? (
                <motion.div
                  key="viewer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-[#0f0f0f]"
                >
                  <div className="w-full h-full p-4">
                    <ImageViewer src={localImage} crop={localCrop} annotations={localAnnotations} />
                  </div>
                </motion.div>
              ) : !localImage ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-4 flex flex-col items-center justify-center"
                >
                  <Dropzone onOpenFolder={handleOpenFile} />
                </motion.div>
              ) : null
            )}
          </AnimatePresence>

        </main>

        {/* Right: Info Panel - flex item with width transition */}
        <InfoPanel
          metadata={viewMode === 'album'
            ? (currentAlbumImage ? {
                albumName: selectedAlbum?.name,
                url: currentAlbumImage,
                addedAt: albumImages[safeAlbumIndex]?.addedAt,
                index: safeAlbumIndex,
                total: albumImages.length
              } : null)
            : (currentMetadata ? { ...currentMetadata, filePath: currentImage } : null)
          }
          isVisible={showInfoPanel && !isEditing}
          mode={viewMode === 'album' ? 'web' : 'local'}
        />
        </div>

        {/* Bottom Sidebar: Thumbnail Explorer - only when position is bottom */}
        {sidebarPosition === 'bottom' && ((viewMode === 'album' && albumImages.length > 0) || (viewMode !== 'album' && files.length > 0)) && (
          <Sidebar
            files={viewMode === 'album' ? albumImages : files}
            currentIndex={viewMode === 'album' ? safeAlbumIndex : currentIndex}
            cacheVersion={cacheVersion}
            onSelect={viewMode === 'album' ? setAlbumImageIndex : selectImage}
            mode={viewMode === 'album' ? 'web' : 'local'}
            isMultiSelectMode={viewMode === 'album' && isMultiSelectMode}
            selectedIds={selectedImageIds}
            onToggleSelect={toggleImageSelection}
            onEnterMultiSelect={() => setIsMultiSelectMode(true)}
            onExitMultiSelect={exitMultiSelectMode}
            onDeleteSelected={handleBatchDelete}
            onDownloadSelected={handleBatchDownload}
            onUploadSelected={handleBatchUpload}
            onReorder={viewMode === 'album' ? (from, to) => reorderImages(selectedAlbumId, from, to) : undefined}
            onContextMenu={viewMode === 'album' ? (e, image) => handleImageContextMenu(e, image, selectedAlbum) : undefined}
            position={sidebarPosition}
          />
        )}
        </div>
      </div>

      {/* Post-Crop Save Toolbar */}
      <AnimatePresence>
        {isModified && (
          <SaveToolbar
            isLocalFile={!!currentImage}
            onSaveReplace={handleSaveReplace}
            onSaveAs={handleSaveAs}
            onDiscard={handleDiscard}
          />
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        <Toast
          message={toast.message}
          isVisible={toast.visible}
          onHide={() => setToast({ visible: false, message: '' })}
        />
      </AnimatePresence>

      {/* Upload History Panel */}
      <UploadHistoryPanel
        isVisible={showUploadHistory}
        history={uploadHistory}
        onClose={() => setShowUploadHistory(false)}
        onClear={() => setUploadHistory([])}
      />

      {/* Batch Crop Modal */}
      <Suspense fallback={null}>
        <BatchCropModal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          files={files}
          currentIndex={currentIndex}
          crop={batchCrop}
          onConfirm={handleBatchCropConfirm}
        />
      </Suspense>

      {/* Export Virtual Images Dialog */}
      <ExportVirtualDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        album={selectedAlbum}
        onExportComplete={(count) => {
          setToast({ visible: true, message: t('exportSuccess', { count }) });
        }}
      />

      {/* Custom Confirm Dialog */}
      <ConfirmDialog {...confirmDialogProps} />

      {/* About Dialog */}
      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />

      {/* Image Editor - Full screen overlay (outside of main layout) */}
      <AnimatePresence>
        {isEditing && (localImage || currentAlbumImage) && (
          <motion.div
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black"
          >
            <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-white/60 animate-pulse">Loading editor...</div></div>}>
              <ImageEditor
                imageSrc={viewMode === 'album' ? currentAlbumImage : localImage}
                onCancel={() => setIsEditing(false)}
                onComplete={handleCropComplete}
                fileCount={viewMode === 'album' ? albumImages.length : files.length}
                onApplyToAll={viewMode === 'local' && !currentImage?.toLowerCase().endsWith('.repic') ? handleApplyToAll : undefined}
                isVirtual={viewMode === 'album' || (viewMode === 'local' && currentImage?.toLowerCase().endsWith('.repic'))}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        items={
          contextMenu.target?.type === 'image' ? [
            {
              label: t('copyToClipboard'),
              icon: Copy,
              onClick: () => handleCopy()
            },
            {
              label: t('download'),
              icon: Download,
              onClick: () => handleSave()
            },
            { type: 'separator' },
            {
              label: t('exportVirtual'),
              icon: FolderOutput,
              onClick: () => {
                const target = contextMenu.target;
                if (target?.image) {
                  handleExportSingle(target.image, target.album);
                }
              }
            },
            { type: 'separator' },
            {
              label: t('delete'),
              icon: Trash2,
              danger: true,
              onClick: async () => {
                const target = contextMenu.target;
                if (viewMode === 'album' && selectedAlbumId && target?.image) {
                  const confirmed = await confirm(t('deleteImageConfirm'), {
                    title: t('confirmDelete'),
                    confirmText: t('delete'),
                    cancelText: t('cancel'),
                    danger: true
                  });
                  if (confirmed) {
                    removeAlbumImage(selectedAlbumId, target.image.id);
                  }
                }
              }
            }
          ]
          : contextMenu.target?.type === 'album' ? [
            {
              label: t('rename'),
              icon: Pencil,
              onClick: () => {
                const album = contextMenu.target?.album;
                if (album) {
                  // Trigger rename mode in AlbumSidebar
                  // We'll use a ref or state to communicate this
                  setRenamingAlbumId(album.id);
                }
              }
            },
            {
              label: t('exportVirtual'),
              icon: FolderOutput,
              onClick: () => {
                const album = contextMenu.target?.album;
                if (album) {
                  selectAlbum(album.id);
                  setShowExportDialog(true);
                }
              }
            },
            { type: 'separator' },
            {
              label: t('delete'),
              icon: Trash2,
              danger: true,
              onClick: async () => {
                const album = contextMenu.target?.album;
                if (album) {
                  const confirmed = await confirm(t('deleteAlbumConfirm'), {
                    title: t('confirmDelete'),
                    confirmText: t('delete'),
                    cancelText: t('cancel'),
                    danger: true
                  });
                  if (confirmed) {
                    deleteAlbum(album.id);
                  }
                }
              }
            }
          ]
          : []
        }
      />

    </div>
  );
}

export default App;
