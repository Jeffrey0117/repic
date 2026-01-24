import { useState, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from './lib/motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { Sidebar } from './components/ui/Sidebar';
import { InfoPanel } from './components/ui/InfoPanel';
import { TopBar } from './components/ui/TopBar';
import { SaveToolbar } from './components/ui/SaveToolbar';
import { Toast } from './components/ui/Toast';
import { UploadHistoryPanel } from './components/ui/UploadHistoryPanel';
import { WebAlbumView } from './components/ui/WebAlbumView';
import { useFileSystem } from './hooks/useFileSystem';
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

  // Local state for edits/UI
  const [localImage, setLocalImage] = useState(null);
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

  // View mode: 'local' for file system view, 'album' for web album view
  const [viewMode, setViewMode] = useState('local');

  // Sync file system image with local view only when currentImage or cacheVersion changes
  useEffect(() => {
    if (currentImage) {
      setLocalImage(`file://${currentImage}?v=${cacheVersion}`);
      setIsEditing(false); // Reset editing when switching images
      setIsModified(false); // Reset modified state
    } else {
      setLocalImage(null);
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

  const handleOpenFile = async () => {
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      const dir = await electronAPI.selectDirectory();
      if (dir) {
        loadFolder(dir);
      }
    }
  };

  const handleCropComplete = (croppedImg) => {
    setLocalImage(croppedImg);
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

  const handleSave = () => {
    const link = document.createElement('a');
    link.download = `repic-${Date.now()}.png`;
    link.href = localImage;
    link.click();
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
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, nextImage, prevImage]);

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] text-white overflow-hidden flex flex-col select-none">

      {/* 1. Header Section */}
      <TopBar
        currentPath={currentPath}
        onOpenFolder={handleOpenFile}
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
        onClear={handleClear}
        onSave={handleSave}
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadHistoryCount={uploadHistory.length}
        onToggleUploadHistory={() => setShowUploadHistory(!showUploadHistory)}
        showInfoPanel={showInfoPanel}
        onToggleInfo={() => setShowInfoPanel(!showInfoPanel)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(viewMode === 'local' ? 'album' : 'local')}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        <AnimatePresence mode="wait">
          {viewMode === 'album' ? (
            <WebAlbumView key="album-view" />
          ) : (
            <motion.div
              key="local-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex overflow-hidden"
            >
              {/* Left: Thumbnail Explorer */}
              <Sidebar
                files={files}
                currentIndex={currentIndex}
                cacheVersion={cacheVersion}
                onSelect={selectImage}
              />

              {/* Center: Main Viewport */}
              <main className="flex-1 min-w-0 relative main-viewport-bg overflow-hidden transition-all duration-250">
                <AnimatePresence mode="wait">
                  {localImage && !isEditing ? (
                    <motion.div
                      key="viewer"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-10 bg-[#0f0f0f]"
                    >
                      <div className="w-full h-full p-4">
                        <ImageViewer src={localImage} />
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
                  ) : null}
                </AnimatePresence>

                {/* Image Cropper - inside main area */}
                <AnimatePresence>
                  {localImage && isEditing && (
                    <motion.div
                      key="editor"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20 bg-black"
                    >
                      <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-white/60 animate-pulse">Loading editor...</div></div>}>
                        <ImageCropper
                          imageSrc={localImage}
                          onCancel={() => setIsEditing(false)}
                          onComplete={handleCropComplete}
                          fileCount={files.length}
                          onApplyToAll={handleApplyToAll}
                        />
                      </Suspense>
                    </motion.div>
                  )}
                </AnimatePresence>
              </main>

              {/* Right: Info Panel - flex item with width transition */}
              <InfoPanel
                metadata={currentMetadata}
                isVisible={showInfoPanel && !isEditing}
              />
            </motion.div>
          )}
        </AnimatePresence>
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

    </div>
  );
}

export default App;
