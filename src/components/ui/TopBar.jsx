import { motion } from '../../lib/motion';
import {
    FolderOpen,
    RotateCcw,
    Scissors,
    Trash2,
    Download,
    Upload,
    Info,
    Globe,
    Sun,
    Moon,
    Layers,
    Album
} from '../icons';
import { Button } from './Button';
import useI18n from '../../hooks/useI18n';
import { useTheme } from '../../contexts/ThemeContext';

// Check if electronAPI is available (injected via preload script)
const electronAPI = window.electronAPI || null;

export const TopBar = ({ currentPath, onOpenFolder, isEditing, onToggleEdit, onClear, onSave, onUpload, isUploading, uploadHistoryCount, onToggleUploadHistory, showInfoPanel, onToggleInfo, viewMode, onToggleViewMode }) => {
    const { t, language, setLanguage } = useI18n();
    const { theme, toggleTheme } = useTheme();

    // Get folder name using electronAPI or fallback
    const getFolderName = () => {
        if (!currentPath) return t('openFolder');
        if (electronAPI && electronAPI.path) {
            return electronAPI.path.basename(currentPath);
        }
        // Fallback to simple string parsing
        return currentPath.split(/[\\/]/).pop() || currentPath;
    };

    const folderName = getFolderName();

    const nextLang = language === 'en' ? 'zh-TW' : 'en';
    const langDisplay = language === 'en' ? 'EN' : '中';

    return (
        <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`h-14 w-full backdrop-blur-xl border-b flex items-center justify-between px-6 z-30 ${
                theme === 'dark'
                    ? 'bg-surface/30 border-white/5'
                    : 'bg-white/80 border-black/10'
            }`}
        >
            {/* Left: Folder Info */}
            <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all border ${
                    theme === 'dark'
                        ? 'bg-white/5 hover:bg-white/10 border-white/5'
                        : 'bg-black/5 hover:bg-black/10 border-black/10'
                }`}
                onClick={onOpenFolder}
            >
                <FolderOpen size={16} className="text-primary" />
                <span className={`text-xs font-medium max-w-[200px] truncate ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>{folderName}</span>
            </div>

            {/* Center: Main Tools */}
            <div className={`flex items-center rounded-xl p-1 border ${theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-black/5 border-black/10'}`}>
                <ToolButton icon={Album} title={t('webAlbum')} onClick={onToggleViewMode} active={viewMode === 'album'} theme={theme} />
                <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
                <ToolButton icon={RotateCcw} title={t('refresh')} onClick={() => window.location.reload()} theme={theme} />
                <ToolButton icon={Scissors} title={t('editArea')} onClick={onToggleEdit} active={isEditing} disabled={viewMode === 'album'} theme={theme} />
                <ToolButton icon={Upload} title={t('upload')} onClick={onUpload} disabled={isUploading || viewMode === 'album'} loading={isUploading} theme={theme} />
                <ToolButton icon={Layers} title={t('uploadHistory')} onClick={onToggleUploadHistory} badge={uploadHistoryCount} theme={theme} />
                <ToolButton icon={Trash2} title={t('delete')} className="text-danger" onClick={onClear} disabled={viewMode === 'album'} theme={theme} />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    className={`h-9 w-9 p-0 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`}
                    onClick={toggleTheme}
                    title={theme === 'dark' ? t('lightMode') : t('darkMode')}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </Button>
                <Button
                    variant="ghost"
                    className={`h-9 px-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 flex gap-2 ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`}
                    onClick={() => setLanguage(nextLang)}
                    title={t('changeLanguage')}
                >
                    <Globe size={18} />
                    <span className="text-xs font-bold">{langDisplay}</span>
                </Button>
                <Button
                    variant="ghost"
                    className={`h-9 w-9 p-0 rounded-lg transition-all ${showInfoPanel ? 'bg-primary/20 text-primary' : `hover:bg-black/10 dark:hover:bg-white/5 ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`}`}
                    onClick={onToggleInfo}
                    title={t('toggleInfo')}
                >
                    <Info size={18} />
                </Button>
                <Button variant="ghost" className={`h-9 w-9 p-0 rounded-lg hover:bg-black/10 dark:hover:bg-white/5 ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`} onClick={onSave}>
                    <Download size={18} className="hover:text-primary transition-colors" />
                </Button>
            </div>
        </motion.div>
    );
};

const ToolButton = ({ icon: Icon, title, onClick, className = "", active = false, disabled = false, loading = false, badge = 0, theme = 'dark' }) => (
    <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        className={`p-2.5 rounded-lg transition-all relative ${
            disabled
                ? 'opacity-50 cursor-not-allowed'
                : active
                    ? 'bg-primary/20 text-primary'
                    : theme === 'dark'
                        ? 'hover:bg-white/10 text-white/60 hover:text-white'
                        : 'hover:bg-black/10 text-gray-500 hover:text-gray-800'
        } ${className}`}
    >
        <Icon size={22} className={loading ? 'animate-pulse' : ''} />
        {badge > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {badge > 9 ? '9+' : badge}
            </span>
        )}
    </button>
);
