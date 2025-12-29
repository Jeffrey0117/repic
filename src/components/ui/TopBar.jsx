import { motion } from 'framer-motion';
import {
    FolderOpen,
    RotateCcw,
    Copy,
    Scissors,
    Trash2,
    Search,
    LayoutGrid,
    Settings,
    Maximize,
    Download,
    Camera,
    Info
} from 'lucide-react';
import { Button } from './Button';

export const TopBar = ({ currentPath, onOpenFolder, onScreenshot, onEdit, onClear, onSave, showInfoPanel, onToggleInfo }) => {
    const folderName = currentPath
        ? (window.require ? window.require('path').basename(currentPath) : currentPath)
        : "Open Folder";

    return (
        <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="h-14 w-full bg-surface/30 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 z-30"
        >
            {/* Left: Folder Info */}
            <div
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-all border border-white/5"
                onClick={onOpenFolder}
            >
                <FolderOpen size={16} className="text-primary" />
                <span className="text-xs font-medium text-white/80 max-w-[200px] truncate">{folderName}</span>
            </div>

            {/* Center: Main Tools */}
            <div className="flex items-center bg-black/20 rounded-xl p-1 border border-white/5">
                <ToolButton icon={RotateCcw} title="Refresh/Reset" onClick={() => window.location.reload()} />
                <ToolButton icon={Copy} title="Copy" onClick={() => { }} />
                <ToolButton icon={Scissors} title="Edit Area" onClick={onEdit} />
                <ToolButton icon={Trash2} title="Delete" className="text-danger" onClick={onClear} />
                <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
                <ToolButton icon={Search} title="Zoom/Search" />
                <ToolButton icon={LayoutGrid} title="Gallery View" />
                <ToolButton icon={Settings} title="Settings" />
                <ToolButton icon={Camera} title="Screenshot" onClick={onScreenshot} />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    className={`h-9 w-9 p-0 rounded-lg transition-all ${showInfoPanel ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-white/70'}`}
                    onClick={onToggleInfo}
                    title="Toggle Info Panel"
                >
                    <Info size={18} />
                </Button>
                <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg hover:bg-white/5" onClick={onSave}>
                    <Download size={18} className="text-white/70 hover:text-primary transition-colors" />
                </Button>
                <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg hover:bg-white/5">
                    <Maximize size={18} className="text-white/70" />
                </Button>
            </div>
        </motion.div>
    );
};

const ToolButton = ({ icon: Icon, title, onClick, className = "" }) => (
    <button
        onClick={onClick}
        title={title}
        className={`p-2 hover:bg-white/10 rounded-lg transition-all text-white/60 hover:text-white ${className}`}
    >
        <Icon size={18} />
    </button>
);
