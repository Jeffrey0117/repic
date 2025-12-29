import { motion } from 'framer-motion';
import { Save, Download, X, Check } from 'lucide-react';
import { Button } from './Button';

export const SaveToolbar = ({ onSaveReplace, onSaveAs, onDiscard, isLocalFile }) => {
    return (
        <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 bg-surface/80 backdrop-blur-2xl px-6 py-3 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
            <div className="flex items-center gap-2 pr-4 border-r border-white/10 mr-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/90">Modified</span>
            </div>

            <div className="flex items-center gap-2">
                {isLocalFile && (
                    <Button
                        variant="primary"
                        className="flex items-center gap-2 px-4 h-10 rounded-xl"
                        onClick={onSaveReplace}
                    >
                        <Check size={16} />
                        <span>Replace Original</span>
                    </Button>
                )}

                <Button
                    variant="secondary"
                    className="flex items-center gap-2 px-4 h-10 rounded-xl bg-white/5 border-white/5 hover:border-primary/50"
                    onClick={onSaveAs}
                >
                    <Download size={16} />
                    <span>Save as New</span>
                </Button>

                <Button
                    variant="ghost"
                    className="flex items-center gap-2 px-4 h-10 rounded-xl text-white/40 hover:text-danger hover:bg-danger/10"
                    onClick={onDiscard}
                >
                    <X size={16} />
                    <span>Discard</span>
                </Button>
            </div>
        </motion.div>
    );
};
