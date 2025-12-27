import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { ImageCropper } from './features/editor/ImageCropper';
import { Sidebar } from './components/ui/Sidebar';
import { InfoPanel } from './components/ui/InfoPanel';
import { TopBar } from './components/ui/TopBar';
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

  // Sync file system image with local view only when currentImage actually changes
  useEffect(() => {
    if (currentImage) {
      setLocalImage(`file://${currentImage}`);
      setIsEditing(false); // Reset editing when switching images
    } else {
      setLocalImage(null);
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
        <InfoPanel metadata={currentMetadata} />

      </div>

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
