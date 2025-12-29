import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { ImageCropper } from './features/editor/ImageCropper';
import { Sidebar } from './components/ui/Sidebar';
import { InfoPanel } from './components/ui/InfoPanel';
import { TopBar } from './components/ui/TopBar';
import { SaveToolbar } from './components/ui/SaveToolbar';
import { captureScreen } from './utils/capture';
import { useFileSystem } from './hooks/useFileSystem';

function App() {
  const {
    currentImage,
    nextImage,
    prevImage,
    loadFolder,
    files,
    selectImage,
    currentIndex,
    currentPath,
    currentMetadata
  } = useFileSystem();

  // Local state for edits/UI
  const [localImage, setLocalImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [isModified, setIsModified] = useState(false);

  // Sync file system image with local view only when currentImage actually changes
  useEffect(() => {
    if (currentImage) {
      setLocalImage(`file://${currentImage}`);
      setIsEditing(false); // Reset editing when switching images
      setIsModified(false); // Reset modified state
    } else {
      setLocalImage(null);
      setIsModified(false);
    }
  }, [currentImage]); // Only depend on currentImage change

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
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const dir = await ipcRenderer.invoke('select-directory');
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
    if (!currentImage || !localImage.startsWith('data:')) return;

    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('save-file', {
      filePath: currentImage,
      base64Data: localImage
    });

    if (result.success) {
      // Reload the image to update viewer/sidebar
      const originalPath = currentImage;
      setLocalImage(`file://${originalPath}?t=${Date.now()}`);
      setIsModified(false);
    } else {
      alert("Failed to save: " + result.error);
    }
  };

  const handleSaveAs = async () => {
    if (!localImage.startsWith('data:')) return;

    const { ipcRenderer } = window.require('electron');
    const path = window.require('path');

    let defaultName = `repic-${Date.now()}.png`;
    if (currentImage) {
      const ext = path.extname(currentImage);
      const base = path.basename(currentImage, ext);
      defaultName = `${base}-cropped${ext}`;
    }

    const defaultPath = currentPath ? path.join(currentPath, defaultName) : defaultName;

    const { canceled, filePath } = await ipcRenderer.invoke('show-save-dialog', defaultPath);

    if (!canceled && filePath) {
      const result = await ipcRenderer.invoke('save-file', {
        filePath,
        base64Data: localImage
      });

      if (result.success) {
        setIsModified(false);
        if (currentPath) loadFolder(currentPath); // Refresh folder if applicable
      } else {
        alert("Failed to save: " + result.error);
      }
    }
  };

  const handleDiscard = () => {
    if (confirm("Discard changes?")) {
      if (currentImage) {
        setLocalImage(`file://${currentImage}`);
      } else {
        setLocalImage(null);
      }
      setIsModified(false);
    }
  };

  const handleClear = () => {
    if (confirm("Close image?")) {
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
                <ImageCropper
                  imageSrc={localImage}
                  onCancel={() => setIsEditing(false)}
                  onComplete={handleCropComplete}
                />
              </motion.div>
            ) : localImage ? (
              <motion.div
                key="viewer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full flex items-center justify-center"
              >
                <ImageViewer src={localImage} />
              </motion.div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                <Dropzone onImageUpload={handleImageUpload} />
                <div className="mt-8 text-sm tracking-widest uppercase animate-pulse">
                  Select a folder to begin
                </div>
              </div>
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
          <div className="text-xl font-light tracking-[0.5em] animate-pulse">CAPTURING...</div>
        </div>
      )}

    </div>
  );
}

export default App;
