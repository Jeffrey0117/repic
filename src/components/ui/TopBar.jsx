import { motion } from '../../lib/motion';
import {
    FolderOpen,
    RotateCcw,
    Scissors,
    Trash2,
    Download,
    Info,
    Globe,
    Sun,
    Moon
} from '../icons';
import { Button } from './Button';
import useI18n from '../../hooks/useI18n';
import { useTheme } from '../../contexts/ThemeContext';

// Check if electronAPI is available (injected via preload script)
const electronAPI = window.electronAPI || null;

export const TopBar = ({ currentPath, onOpenFolder, isEditing, onToggleEdit, onClear, onSave, showInfoPanel, onToggleInfo }) => {
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
                <ToolButton icon={RotateCcw} title={t('refresh')} onClick={() => window.location.reload()} />
                <ToolButton icon={Scissors} title={t('editArea')} onClick={onToggleEdit} active={isEditing} />
                <ToolButton icon={Trash2} title={t('delete')} className="text-danger" onClick={onClear} />
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

const ToolButton = ({ icon: Icon, title, onClick, className = "", active = false }) => (
    <button
        onClick={onClick}
        title={title}
        className={`p-2.5 rounded-lg transition-all ${active ? 'bg-primary/20 text-primary' : 'hover:bg-white/10 text-white/60 hover:text-white'} ${className}`}
    >
        <Icon size={22} />
    </button>
);
