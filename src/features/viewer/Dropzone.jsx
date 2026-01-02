import { useState, useCallback } from 'react';
import { Upload, ImageIcon, FolderOpen } from '../../components/icons';
import { motion, AnimatePresence } from '../../lib/motion';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import useI18n from '../../hooks/useI18n';

export const Dropzone = ({ onImageUpload, onOpenFolder }) => {
    const { t } = useI18n();
    const [isDragActive, setIsDragActive] = useState(false);

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    onImageUpload(event.target.result);
                };
                reader.readAsDataURL(file);
            }
        }
    }, [onImageUpload]);

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    onImageUpload(event.target.result);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    return (
        <div
            className={cn(
                "fixed inset-0 flex items-center justify-center transition-colors duration-200",
                isDragActive ? "bg-primary/20 backdrop-blur-sm" : "bg-background"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center p-10 border-2 border-dashed border-zinc-700 rounded-3xl bg-surface/50 max-w-xl w-full mx-4"
                >
                    <div className="flex flex-col items-center gap-4 pointer-events-none">
                        <div className="p-4 bg-zinc-800 rounded-full text-zinc-400">
                            <ImageIcon size={48} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-xl font-semibold text-white">
                                {isDragActive ? "Drop to open" : "Quick View"}
                            </h2>
                            <p className="text-text-secondary">
                                Drag and drop an image here, or click to browse
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-3">
                        {onOpenFolder && (
                            <Button
                                variant="primary"
                                icon={FolderOpen}
                                className="pointer-events-auto w-full justify-center"
                                onClick={onOpenFolder}
                            >
                                {t('openFolder')}
                            </Button>
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id="file-upload"
                            onChange={handleFileInput}
                        />
                        <label htmlFor="file-upload">
                            <Button variant="secondary" icon={Upload} className="pointer-events-auto w-full justify-center">
                                {t('openImage')}
                            </Button>
                        </label>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
