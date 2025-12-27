import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { ImageCropper } from './features/editor/ImageCropper';
import { ThumbnailList } from './components/ui/ThumbnailList';
import { Button } from './components/ui/Button';
import { Crop, Trash2, Download, Camera, FolderOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { captureScreen } from './utils/capture';
import { useFileSystem } from './hooks/useFileSystem';
import { TopBar } from './components/ui/TopBar';

function App() {
  const { currentImage, nextImage, prevImage, loadFolder, files, selectImage, currentIndex, currentPath } = useFileSystem();

  // Local state for edits/UI
  const [localImage, setLocalImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Sync file system image with local view unless editing
  useEffect(() => {
    if (currentImage && !isEditing) {
      // Need to format as file:// URL for generic HTML img tag if it's absolute path
      // Electron handles local paths often, but file:// is safer
      setLocalImage(`file://${currentImage}`);
    } else if (!currentImage && localImage && !isEditing) {
      // If currentImage becomes null (e.g., folder cleared), clear localImage
      setLocalImage(null);
    }
  }, [currentImage, isEditing, localImage]);

  const handleImageUpload = (imgSrc) => {
    setLocalImage(imgSrc);
    setIsEditing(false);
  };

  const handleScreenshot = async () => {
    setIsCapturing(true);
    const screenshot = await captureScreen();
    if (screenshot) {
      setLocalImage(screenshot);
      setIsEditing(true); // Immediately enter crop mode for "Regional Capture" feel
    }
    setIsCapturing(false);
  };

  const handleOpenFile = () => {
    if (window.require) {
      document.getElementById('folder-upload-toolbar').click();
    } else {
      document.getElementById('file-upload-toolbar').click();
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
    <div className="h-screen w-screen bg-background overflow-hidden relative select-none">

      {/* Hidden Inputs */}
      <input
        type="file"
        id="file-upload-toolbar"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.path) {
              const path = window.require('path');
              const dir = path.dirname(file.path);
              loadFolder(dir);
            } else {
              const reader = new FileReader();
              reader.onload = (ev) => handleImageUpload(ev.target.result);
              reader.readAsDataURL(file);
            }
          }
        }}
      />

      {/* Folder Picker Input Habit */}
      <input
        type="file"
        id="folder-upload-toolbar"
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.path) {
              const path = window.require('path');
              const dir = path.dirname(file.path);
              loadFolder(dir);
            }
          }
        }}
      />

      {/* 1. Upload View (Empty State) */}
      <AnimatePresence>
        {!localImage && (
          <>
            <Dropzone onImageUpload={handleImageUpload} />

            {/* Screenshot Button (Bottom Center when empty) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-10 flex gap-4"
            >
              <Button
                variant="ghost"
                onClick={handleOpenFile}
                className="bg-surface/50 hover:bg-surface border border-white/10 text-white px-6 py-3 rounded-full shadow-lg backdrop-blur-md"
              >
                <FolderOpen className="mr-2" size={20} />
                Open Folder
              </Button>

              <Button
                variant="ghost"
                onClick={handleScreenshot}
                disabled={isCapturing}
                className="bg-surface/50 hover:bg-surface border border-white/10 text-white px-6 py-3 rounded-full shadow-lg backdrop-blur-md"
              >
                <Camera className="mr-2" size={20} />
                {isCapturing ? "Capturing..." : "Screenshot"}
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 2. Main Viewer & Editor */}
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
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-4 z-10"
          >
            <TopBar
              currentPath={currentPath}
              onOpenFolder={handleOpenFile}
            />
            <ImageViewer src={localImage} />

            {/* Gallery Navigation Arrows (Only if we have multiple files) */}
            {files.length > 1 && (
              <>
                <button onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4 z-50 rounded-full hover:bg-black/20 transition-colors">
                  <ChevronLeft size={40} />
                </button>
                <button onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4 z-50 rounded-full hover:bg-black/20 transition-colors">
                  <ChevronRight size={40} />
                </button>

                {/* Thumbnail List */}
                <ThumbnailList
                  files={files}
                  currentIndex={currentIndex}
                  onSelect={selectImage}
                />
              </>
            )}

            {/* Viewer Toolbar */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="absolute bottom-8 flex items-center gap-4 bg-surface/80 backdrop-blur-md p-2 rounded-full shadow-ios border border-white/10"
            >
              <Button
                variant="ghost"
                onClick={handleClear}
                className="w-10 h-10 p-0 rounded-full text-danger hover:bg-danger/10"
                title="Close Image"
              >
                <Trash2 size={20} />
              </Button>

              <div className="w-[1px] h-6 bg-white/20"></div>

              <Button
                variant="ghost"
                onClick={handleOpenFile}
                className="text-white hover:text-white/80"
                title="Open Folder"
              >
                <FolderOpen size={20} />
              </Button>

              <Button
                variant="ghost"
                onClick={handleScreenshot}
                icon={Camera}
                className="text-white hover:text-white/80"
                title="New Screenshot"
              />

              <Button
                variant="primary"
                onClick={() => setIsEditing(true)}
                icon={Crop}
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  const link = document.createElement('a');
                  link.download = `repic-${Date.now()}.png`;
                  link.href = localImage;
                  link.click();
                }}
                className="text-white hover:text-primary"
                icon={Download}
              >
                Save
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default App;
