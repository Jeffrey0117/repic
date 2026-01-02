import { motion } from '../../lib/motion';

export const Sidebar = ({ files, currentIndex, onSelect, cacheVersion = 0 }) => {
    return (
        <div className="w-[100px] h-full bg-surface/30 backdrop-blur-xl border-r border-white/5 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-2 space-y-3">
                {files.map((file, index) => {
                    const isActive = index === currentIndex;
                    const fileName = file.split(/[\\/]/).pop();

                    return (
                        <motion.div
                            key={`${file}-${cacheVersion}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onSelect(index)}
                            className={`relative cursor-pointer group flex flex-col items-center`}
                        >
                            <div className="text-[10px] text-white/40 truncate w-full mb-1 text-center group-hover:text-white/80 transition-colors">
                                {index + 1}
                            </div>

                            <div className={`
                w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200 shadow-lg
                ${isActive ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-transparent group-hover:border-white/30'}
              `}>
                                <img
                                    src={`file://${file}?v=${cacheVersion}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>

                            <div className={`mt-1 text-[8px] truncate w-full px-1 text-center ${isActive ? 'text-primary' : 'text-white/40'}`}>
                                {fileName}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
