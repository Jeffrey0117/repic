import { useRef } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, ArrowLeft } from 'lucide-react';
import { Button } from './Button';

export const TopBar = ({ currentPath, onOpenFolder, onBack }) => {
    // We display the folder name, and maybe full path on hover?
    // Using window.require to get path module safely if needed, but we have the string path.
    const folderName = currentPath
        ? (window.require ? window.require('path').basename(currentPath) : currentPath)
        : "No Folder Selected";

    return (
        <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 z-30"
        >
            <div className="flex items-center gap-4">
                {/* Logo or App Name could go here */}
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Repic
                </h1>
            </div>

            <div className="flex items-center gap-4">
                <div
                    className="flex items-center gap-2 px-4 py-2 bg-black/20 rounded-full border border-white/5 text-sm text-gray-300 hover:text-white cursor-pointer transition-colors max-w-lg truncate"
                    title={currentPath}
                    onClick={onOpenFolder}
                >
                    <FolderOpen size={16} className="text-primary" />
                    <span className="truncate">{folderName}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Right side items if needed, maybe settings? */}
            </div>
        </motion.div>
    );
};
