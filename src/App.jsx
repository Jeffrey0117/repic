import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dropzone } from './features/viewer/Dropzone';
import { ImageViewer } from './features/viewer/ImageViewer';
import { ImageCropper } from './features/editor/ImageCropper';
import { Button } from './components/ui/Button';
import { Crop, X, Trash2, Download, Camera, FolderOpen } from 'lucide-react';
import { captureScreen } from './utils/capture';

function App() {
  const [image, setImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleImageUpload = (imgSrc) => {
    setImage(imgSrc);
    setIsEditing(false);
  };

  const handleScreenshot = async () => {
    setIsCapturing(true);
    const screenshot = await captureScreen();
    if (screenshot) {
      setImage(screenshot);
      setIsEditing(true); // Immediately enter crop mode for "Regional Capture" feel
    }
    setIsCapturing(false);
  };

  const handleOpenFile = () => {
    document.getElementById('file-upload-toolbar').click();
  };

  const handleCropComplete = (croppedImg) => {
    setImage(croppedImg);
    setIsEditing(false);
  };

  const handleClear = () => {
    if (confirm("Close image?")) {
      setImage(null);
      setIsEditing(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-background overflow-hidden relative select-none">

      {/* Hidden Global File Input for Toolbar */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        id="file-upload-toolbar"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => handleImageUpload(ev.target.result);
            reader.readAsDataURL(e.target.files[0]);
          }
        }}
      />

      {/* 1. Upload View */}
      <AnimatePresence>
        {!image && (
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
                Open File
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
        {image && isEditing ? (
          <motion.div
            key="editor"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-20"
          >
            <ImageCropper
              imageSrc={image}
              onCancel={() => setIsEditing(false)}
              onComplete={handleCropComplete}
            />
          </motion.div>
        ) : image ? (
          <motion.div
            key="viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-4 z-10"
          >
            <ImageViewer src={image} />

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
                title="Open Image"
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
                  link.href = image;
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
