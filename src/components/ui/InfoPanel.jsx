import { memo } from 'react';
import { motion } from '../../lib/motion';
import { Info, BarChart3, Database, Calendar } from '../icons';
import useI18n from '../../hooks/useI18n';

export const InfoPanel = memo(function InfoPanel({ metadata }) {
    const { t, language } = useI18n();

    const formatDate = (date) => {
        if (!date) return t('unknown');
        return new Date(date).toLocaleString(language === 'zh-TW' ? 'zh-TW' : 'en-US');
    };

    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="w-[280px] h-full bg-surface/30 backdrop-blur-xl border-l border-white/5 flex flex-col overflow-hidden p-6 shrink-0"
        >
            {metadata ? (
                <>
                    <div className="flex items-center gap-2 mb-8 border-b border-white/5 pb-4">
                        <Info size={18} className="text-primary" />
                        <h2 className="text-sm font-semibold text-white tracking-wider uppercase">{t('details')}</h2>
                    </div>

                    <div className="space-y-8 overflow-y-auto no-scrollbar pr-2">
                        {/* Info Rows */}
                        <InfoItem
                            icon={<BarChart3 size={16} />}
                            label={t('imageResolution')}
                            value={`${metadata.width} x ${metadata.height}`}
                        />

                        <InfoItem
                            icon={<Database size={16} />}
                            label={t('fileSize')}
                            value={formatSize(metadata.size)}
                        />

                        <InfoItem
                            icon={<Calendar size={16} />}
                            label={t('createdDate')}
                            value={formatDate(metadata.birthtime)}
                        />

                        <InfoItem
                            icon={<Calendar size={16} />}
                            label={t('modifiedDate')}
                            value={formatDate(metadata.mtime)}
                        />
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/5 text-[10px] text-white/20 text-center uppercase tracking-[0.2em]">
                        Repic Pro Engine
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-center h-full text-white/30 text-sm">
                    {t('noImageSelected') || 'No image selected'}
                </div>
            )}
        </motion.div>
    );
});

const InfoItem = memo(function InfoItem({ icon, label, value }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-primary font-medium text-[11px] uppercase tracking-wider">
                {icon}
                <span>{label}</span>
            </div>
            <div className="text-white text-sm font-light mt-1 pl-6 border-l border-primary/20">
                {value}
            </div>
        </div>
    );
});
