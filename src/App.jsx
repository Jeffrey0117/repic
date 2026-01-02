import { useState, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from './lib/motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { Sidebar } from './components/ui/Sidebar';
import { InfoPanel } from './components/ui/InfoPanel';
import { TopBar } from './components/ui/TopBar';
import { SaveToolbar } from './components/ui/SaveToolbar';
import { captureScreen } from './utils/capture';
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
  const [isCapturing, setIsCapturing] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [isModified, setIsModified] = useState(false);

  // Batch crop state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchCrop, setBatchCrop] = useState(null);

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

  const handleImageUpload = (imgSrc) => {
    setLocalImage(imgSrc);
    setIsEditing(false);
  };

  const handleScreenshot = async () => {
    setIsCapturing(true);
    const screenshot = await captureScreen();
    if (screenshot) {
      setLocalImage(screenshot);
      setIsEditing(true);
    }
    setIsCapturing(false);
  };

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
    if (!batchCrop) return;
    if (!electronAPI) return;

    let successCount = 0;
    let failCount = 0;

    // Include current image + selected images
    const allIndexes = [currentIndex, ...selectedIndexes];

    for (let i = 0; i < allIndexes.length; i++) {
      const filePath = files[allIndexes[i]];
      onProgress(i + 1);

      try {
        // Load image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = `file://${filePath}`;
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
    }

    // Refresh folder after batch complete
    if (currentPath) {
      loadFolder(currentPath);
    }
    setIsEditing(false);
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
        onScreenshot={handleScreenshot}
        onEdit={() => setIsEditing(true)}
        onClear={handleClear}
        onSave={handleSave}
        showInfoPanel={showInfoPanel}
        onToggleInfo={() => setShowInfoPanel(!showInfoPanel)}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Thumbnail Explorer */}
        <Sidebar
          files={files}
          currentIndex={currentIndex}
          cacheVersion={cacheVersion}
          onSelect={selectImage}
        />

        {/* Center: Main Viewport */}
        <main className="flex-1 relative flex items-center justify-center p-8 bg-black/40">
          <AnimatePresence mode="wait">
            {localImage && isEditing ? (
              <motion.div
                key="editor"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="absolute inset-0 z-20"
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
            ) : localImage ? (
              <motion.div
                key="viewer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex items-center justify-center"
              >
                <ImageViewer src={localImage} />
              </motion.div>
            ) : (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                className="w-full h-full flex flex-col items-center justify-center"
              >
                <Dropzone onImageUpload={handleImageUpload} onOpenFolder={handleOpenFile} />
                <div className="mt-8 text-sm tracking-widest uppercase animate-pulse">
                  {t("selectFolder")}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right: Info Panel */}
        <AnimatePresence>
          {showInfoPanel && (
            <InfoPanel metadata={currentMetadata} />
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

      {/* Capture Overlay */}
      {isCapturing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="text-xl font-light tracking-[0.5em] animate-pulse">{t("capturing")}</div>
        </div>
      )}

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
