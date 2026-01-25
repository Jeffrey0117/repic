import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
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
import { AlbumSidebar } from './features/album/AlbumSidebar';
import { useFileSystem } from './hooks/useFileSystem';
import { useWebAlbums } from './hooks/useWebAlbums';
import useI18n from './hooks/useI18n';

// Lazy load heavy components
const ImageCropper = lazy(() => import('./features/editor/ImageCropper').then(m => ({ default: m.ImageCropper })));
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
    cacheVersion
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
    removeImage: removeAlbumImage,
    updateImageCrop
  } = useWebAlbums();

  // Album image navigation state
  const [albumImageIndex, setAlbumImageIndex] = useState(0);

  // Local state for edits/UI
  const [localImage, setLocalImage] = useState(null);
  const [localCrop, setLocalCrop] = useState(null);
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

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Sync file system image with local view only when currentImage or cacheVersion changes
  useEffect(() => {
    if (currentImage) {
      // Check if it's a .repic virtual image file
      if (currentImage.toLowerCase().endsWith('.repic')) {
        const electronAPI = getElectronAPI();
        if (electronAPI) {
          const result = electronAPI.readFile(currentImage);
          console.log('[App] Reading .repic file:', currentImage);
          console.log('[App] Result:', result);
          if (result && typeof result === 'object' && result.url) {
            console.log('[App] Setting localImage:', result.url);
            console.log('[App] Setting localCrop:', result.crop);
            setLocalImage(result.url);
            setLocalCrop(result.crop || null);
          } else {
            console.log('[App] No valid URL in result');
            setLocalImage(null);
            setLocalCrop(null);
          }
        }
      } else {
        setLocalImage(`file://${currentImage}?v=${cacheVersion}`);
        setLocalCrop(null);
      }
      setIsEditing(false); // Reset editing when switching images
      setIsModified(false); // Reset modified state
    } else {
      setLocalImage(null);
      setLocalCrop(null);
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
        setVirtualImageData(data);
        setVirtualSiblings(data.siblingFiles || []);
        // Find current index in siblings
        const idx = (data.siblingFiles || []).findIndex(f => f === data.filePath);
        setVirtualIndex(idx >= 0 ? idx : 0);
        // Switch to a special virtual mode (use 'virtual' view mode)
        setViewMode('virtual');
      });
    }
  }, []);

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

  const handleCropComplete = async (result) => {
    // Check if this is a virtual image crop (returns crop params instead of image)
    if (result && typeof result === 'object' && result.type === 'crop-params') {
      // Virtual image crop in album mode - save to localStorage
      if (viewMode === 'album' && selectedAlbumId && albumImages[safeAlbumIndex]) {
        const imageId = albumImages[safeAlbumIndex].id;
        updateImageCrop(selectedAlbumId, imageId, result.crop);
        setToast({ visible: true, message: t('cropSaved') });
      }
      // Virtual image crop in local mode (.repic file) - save crop to file
      else if (viewMode === 'local' && currentImage?.toLowerCase().endsWith('.repic')) {
        const electronAPI = getElectronAPI();
        if (electronAPI) {
          // Read current .repic data
          const currentData = electronAPI.readFile(currentImage);
          if (currentData && currentData.url) {
            // Update with new crop
            const updatedData = {
              v: 1,
              type: 'virtual-image',
              url: currentData.url,
              name: currentData.name,
              albumId: currentData.albumId,
              imageId: currentData.imageId,
              crop: result.crop,
              createdAt: Date.now()
            };
            // Write back to file
            const writeResult = await electronAPI.writeRepicFile(currentImage, updatedData);
            if (writeResult.success) {
              setLocalCrop(result.crop);
              setCacheVersion(prev => prev + 1); // Refresh sidebar thumbnails
              setToast({ visible: true, message: t('cropSaved') });
            } else {
              console.error('[handleCropComplete] Failed to save crop:', writeResult.error);
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

  const handleDiscard = () => {
    if (confirm(t("discardChanges"))) {
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

  const handleClear = () => {
    if (confirm(t("closeImage"))) {
      setLocalImage(null);
      setIsEditing(false);
    }
  };

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

  // Album navigation
  const albumImages = selectedAlbum?.images || [];
  // Ensure index is within bounds (important when switching albums)
  const safeAlbumIndex = albumImages.length > 0 ? Math.min(albumImageIndex, albumImages.length - 1) : 0;
  const currentAlbumImage = albumImages.length > 0 ? (albumImages[safeAlbumIndex]?.url || null) : null;

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

      // Create form data
      const formData = new FormData();
      const filename = `repic-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
      formData.append('file', blob, filename);

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

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] text-white overflow-hidden flex flex-col select-none">

      {/* 1. Header Section */}
      <TopBar
        currentPath={currentPath}
        onOpenFolder={handleOpenFile}
        onRefresh={handleRefresh}
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
        onClear={handleClear}
        onSave={handleSave}
        onCopy={handleCopy}
        isCopying={isCopying}
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadHistoryCount={uploadHistory.length}
        onToggleUploadHistory={() => setShowUploadHistory(!showUploadHistory)}
        showInfoPanel={showInfoPanel}
        onToggleInfo={() => setShowInfoPanel(!showInfoPanel)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(viewMode === 'local' ? 'album' : 'local')}
        selectedAlbum={selectedAlbum}
        onAddAlbumImage={(url) => selectedAlbumId && addAlbumImage(selectedAlbumId, url)}
        albumSidebarCollapsed={albumSidebarCollapsed}
        onToggleAlbumSidebar={() => setAlbumSidebarCollapsed(!albumSidebarCollapsed)}
        onExportVirtual={() => setShowExportDialog(true)}
        hasImage={!!(localImage || currentAlbumImage || virtualImageData?.url)}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Album Sidebar - only in album mode */}
        {viewMode === 'album' && (
          <AlbumSidebar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            onSelectAlbum={selectAlbum}
            onCreateAlbum={createAlbum}
            onRenameAlbum={renameAlbum}
            onDeleteAlbum={deleteAlbum}
            isVisible={!albumSidebarCollapsed}
          />
        )}

        {/* Left: Thumbnail Explorer - hide when no images */}
        {((viewMode === 'album' && albumImages.length > 0) || (viewMode !== 'album' && files.length > 0)) && (
          <Sidebar
            files={viewMode === 'album' ? albumImages : files}
            currentIndex={viewMode === 'album' ? safeAlbumIndex : currentIndex}
            cacheVersion={cacheVersion}
            onSelect={viewMode === 'album' ? setAlbumImageIndex : selectImage}
            mode={viewMode === 'album' ? 'web' : 'local'}
          />
        )}

        {/* Center: Main Viewport */}
        <main className="flex-1 min-w-0 relative main-viewport-bg overflow-hidden transition-all duration-250">
          <AnimatePresence mode="wait">
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
                    <ImageViewer src={virtualImageData.url} />
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
                >
                  <div className="w-full h-full p-4">
                    <ImageViewer src={currentAlbumImage} crop={albumImages[safeAlbumIndex]?.crop} />
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
                                  urls.forEach(url => selectedAlbumId && addAlbumImage(selectedAlbumId, url));
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target.value.trim()) {
                                const urls = e.target.value.split(/[\n,]/).map(u => u.trim()).filter(Boolean);
                                urls.forEach(url => selectedAlbumId && addAlbumImage(selectedAlbumId, url));
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
                    <ImageViewer src={localImage} crop={localCrop} />
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

          {/* Image Cropper - inside main area */}
          <AnimatePresence>
            {isEditing && (localImage || currentAlbumImage) && (
              <motion.div
                key="editor"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 bg-black"
              >
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-white/60 animate-pulse">Loading editor...</div></div>}>
                  <ImageCropper
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
            : currentMetadata
          }
          isVisible={showInfoPanel && !isEditing}
          mode={viewMode === 'album' ? 'web' : 'local'}
        />
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

    </div>
  );
}

export default App;
