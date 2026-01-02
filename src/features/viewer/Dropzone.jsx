import { ImageIcon, FolderOpen } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import useI18n from '../../hooks/useI18n';

export const Dropzone = ({ onOpenFolder }) => {
    const { t } = useI18n();

    return (
        <div className="text-center p-10 border-2 border-dashed border-zinc-700 rounded-3xl bg-surface/50 max-w-md w-full mx-4">
            <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-zinc-800 rounded-full text-zinc-400">
                    <ImageIcon size={48} />
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-white">Repic</h2>
                    <p className="text-text-secondary text-sm">
                        {t('selectFolderHint')}
                    </p>
                </div>
            </div>

            <div className="mt-6">
                <Button
                    variant="primary"
                    icon={FolderOpen}
                    className="w-full justify-center"
                    onClick={onOpenFolder}
                >
                    {t('openFolder')}
                </Button>
            </div>
        </div>
    );
};
