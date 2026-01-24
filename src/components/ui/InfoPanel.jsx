import { memo } from 'react';
import { Info, BarChart3, Database, Calendar, Globe, Album } from '../icons';
import useI18n from '../../hooks/useI18n';

// Panel width constant for consistency
const PANEL_WIDTH = 280;

// Transition duration in ms
const TRANSITION_DURATION = 250;

// Link icon
const Link = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

export const InfoPanel = memo(function InfoPanel({ metadata, isVisible = true, mode = 'local' }) {
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

    // Extract domain from URL
    const getDomain = (url) => {
        if (!url) return t('unknown');
        try {
            return new URL(url).hostname;
        } catch {
            return url.substring(0, 30) + '...';
        }
    };

    // CSS transition for smooth open/close - width based, not transform
    const panelStyle = {
        width: isVisible ? PANEL_WIDTH : 0,
        transition: `width ${TRANSITION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        overflow: 'hidden',
    };

    return (
        <aside
            style={panelStyle}
            className="h-full bg-surface/90 backdrop-blur-xl border-l border-white/5 shrink-0"
        >
            {/* Fixed width inner container prevents content squish */}
            <div className="flex flex-col h-full p-6" style={{ width: PANEL_WIDTH, minWidth: PANEL_WIDTH }}>
                {metadata ? (
                    <>
                        <div className="flex items-center gap-2 mb-8 border-b border-white/5 pb-4">
                            <Info size={18} className="text-primary" />
                            <h2 className="text-sm font-semibold text-white tracking-wider uppercase">{t('details')}</h2>
                        </div>

                        <div className="space-y-8 overflow-y-auto no-scrollbar pr-2 flex-1">
                            {mode === 'web' ? (
                                <>
                                    {/* Web image info */}
                                    <InfoItem
                                        icon={<Album size={16} />}
                                        label={t('albumNameLabel')}
                                        value={metadata.albumName || t('unknown')}
                                    />

                                    <InfoItem
                                        icon={<Globe size={16} />}
                                        label={t('imageSource')}
                                        value={getDomain(metadata.url)}
                                    />

                                    <InfoItem
                                        icon={<Link size={16} />}
                                        label={t('imageUrl')}
                                        value={
                                            <a
                                                href={metadata.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline break-all text-xs"
                                                title={metadata.url}
                                            >
                                                {metadata.url?.length > 50
                                                    ? metadata.url.substring(0, 50) + '...'
                                                    : metadata.url}
                                            </a>
                                        }
                                    />

                                    <InfoItem
                                        icon={<Calendar size={16} />}
                                        label={t('addedDate')}
                                        value={formatDate(metadata.addedAt)}
                                    />

                                    <InfoItem
                                        icon={<BarChart3 size={16} />}
                                        label={t('imageIndex')}
                                        value={`${metadata.index + 1} / ${metadata.total}`}
                                    />
                                </>
                            ) : (
                                <>
                                    {/* Local file info */}
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
                                </>
                            )}
                        </div>

                        <div className="pt-4 border-t border-white/5 text-[10px] text-white/20 text-center uppercase tracking-[0.2em]">
                            Repic Pro Engine
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-white/30 text-sm whitespace-nowrap">
                        {t('noImageSelected') || 'No image selected'}
                    </div>
                )}
            </div>
        </aside>
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
