import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOutput, Replace, Loader2, Check, FolderOpen } from 'lucide-react';
import { Button } from './Button';
import useI18n from '../../hooks/useI18n';

export const BatchCropModal = ({
    isOpen,
    onClose,
    files = [],
    currentIndex = 0,
    crop,
    onConfirm
}) => {
    const { t } = useI18n();
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [outputMode, setOutputMode] = useState('replace');
    const [customDir, setCustomDir] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    // Reset selection when modal opens, exclude current image
    useEffect(() => {
        if (isOpen) {
            setSelectedFiles(new Set());
            setIsProcessing(false);
            setCustomDir(null);
            setOutputMode('replace');
        }
    }, [isOpen]);

    const handleSelectDirectory = async () => {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        const dir = await ipcRenderer.invoke('select-directory');
        if (dir) {
            setCustomDir(dir);
            setOutputMode('custom');
        }
    };

    const toggleFile = (index) => {
        const newSet = new Set(selectedFiles);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedFiles(newSet);
    };

    const selectAll = () => {
        const allIndexes = files.map((_, i) => i).filter(i => i !== currentIndex);
        setSelectedFiles(new Set(allIndexes));
    };

    const selectNone = () => {
        setSelectedFiles(new Set());
    };

    const handleConfirm = async () => {
        setIsProcessing(true);
        const selectedArray = Array.from(selectedFiles);
        // +1 for current image
        const totalWithCurrent = selectedArray.length + 1;
        setProgress({ current: 0, total: totalWithCurrent });

        try {
            await onConfirm(selectedArray, outputMode, customDir, (current) => {
                setProgress({ current, total: totalWithCurrent });
            });
        } finally {
            setIsProcessing(false);
            onClose();
        }
    };

    if (!isOpen) return null;

    const path = window.require ? window.require('path') : null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">
                            Apply Crop to Selected
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X size={20} className="text-white/60" />
                        </button>
                    </div>

                    {/* Crop Info */}
                    <div className="bg-white/5 rounded-xl p-3 mb-4 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-white/40">{t("cropRegion")}</div>
                            <div className="text-sm font-medium text-white">
                                {Math.round(crop?.width || 0)}% × {Math.round(crop?.height || 0)}%
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-white/40">{t("selected")}</div>
                            <div className="text-sm font-bold text-primary">
                                {selectedFiles.size} {t('images')}
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    {!isProcessing && (
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={selectAll}
                                className="text-xs px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                            >
                                Select All
                            </button>
                            <button
                                onClick={selectNone}
                                className="text-xs px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                            >
                                Clear
                            </button>
                        </div>
                    )}

                    {/* Image Grid */}
                    {!isProcessing && (
                        <div className="flex-1 overflow-y-auto mb-4 min-h-0">
                            <div className="grid grid-cols-4 gap-2">
                                {files.map((filePath, index) => {
                                    const isCurrentImage = index === currentIndex;
                                    const isSelected = selectedFiles.has(index);
                                    const fileName = path ? path.basename(filePath) : filePath;

                                    return (
                                        <button
                                            key={filePath}
                                            onClick={() => !isCurrentImage && toggleFile(index)}
                                            disabled={isCurrentImage}
                                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                                isCurrentImage
                                                    ? 'border-amber-500/50 opacity-50 cursor-not-allowed'
                                                    : isSelected
                                                    ? 'border-primary ring-2 ring-primary/30'
                                                    : 'border-transparent hover:border-white/20'
                                            }`}
                                        >
                                            <img
                                                src={`file://${filePath}`}
                                                alt={fileName}
                                                className="w-full h-full object-cover"
                                            />

                                            {/* Current Image Badge */}
                                            {isCurrentImage && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                    <span className="text-[10px] text-amber-400 font-medium px-2 py-0.5 bg-amber-500/20 rounded">
                                                        Current
                                                    </span>
                                                </div>
                                            )}

                                            {/* Selected Checkmark */}
                                            {isSelected && (
                                                <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                                    <Check size={12} className="text-white" />
                                                </div>
                                            )}

                                            {/* Filename */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                                <div className="text-[9px] text-white/80 truncate">
                                                    {fileName}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Output Mode Selection */}
                    {!isProcessing && selectedFiles.size > 0 && (
                        <div className="space-y-2 mb-4">
                            <div className="flex gap-3">
                                <label
                                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                                        outputMode === 'replace'
                                            ? 'border-primary bg-primary/10'
                                            : 'border-white/10 hover:border-white/20'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="outputMode"
                                        value="replace"
                                        checked={outputMode === 'replace'}
                                        onChange={() => setOutputMode('replace')}
                                        className="sr-only"
                                    />
                                    <Replace size={16} className={outputMode === 'replace' ? 'text-primary' : 'text-white/40'} />
                                    <span className="text-sm text-white">{t('replaceOriginal')}</span>
                                </label>

                                <label
                                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                                        outputMode === 'folder'
                                            ? 'border-primary bg-primary/10'
                                            : 'border-white/10 hover:border-white/20'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="outputMode"
                                        value="folder"
                                        checked={outputMode === 'folder'}
                                        onChange={() => setOutputMode('folder')}
                                        className="sr-only"
                                    />
                                    <FolderOutput size={16} className={outputMode === 'folder' ? 'text-primary' : 'text-white/40'} />
                                    <span className="text-sm text-white">{t('croppedFolder')}</span>
                                </label>
                            </div>

                            {/* Custom Directory Option */}
                            <button
                                onClick={handleSelectDirectory}
                                className={`w-full flex items-center gap-2 p-3 rounded-xl border transition-all ${
                                    outputMode === 'custom'
                                        ? 'border-primary bg-primary/10'
                                        : 'border-white/10 hover:border-white/20'
                                }`}
                            >
                                <FolderOpen size={16} className={outputMode === 'custom' ? 'text-primary' : 'text-white/40'} />
                                <span className="text-sm text-white">
                                    {customDir ? t('saveTo', { folder: path?.basename(customDir) }) : t('selectDirectory')}
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Progress */}
                    {isProcessing && (
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Loader2 size={16} className="text-primary animate-spin" />
                                <span className="text-sm text-white">
                                    {t('processing')} {progress.current} / {progress.total}
                                </span>
                            </div>
                            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-primary"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            disabled={isProcessing}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirm}
                            disabled={isProcessing || selectedFiles.size === 0}
                            className="flex-1"
                        >
                            {isProcessing ? t('processing') : t('cropImages', { count: selectedFiles.size })}
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
