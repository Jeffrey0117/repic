import { useState, useRef, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '../../components/ui/Button';
import { Slider } from '../../components/ui/Slider';
import getCroppedImg from './utils/canvasUtils';

// Helper to center the crop initially
function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    )
}

export const ImageCropper = ({ imageSrc, onCancel, onComplete }) => {
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState(null);
    const [scale, setScale] = useState(1);
    const [rotate, setRotate] = useState(0);
    const imgRef = useRef(null);

    const onImageLoad = (e) => {
        const { width, height } = e.currentTarget;
        // Default to free aspect properly centered
        const initialCrop = centerCrop(
            {
                unit: '%',
                width: 80,
                height: 80,
                x: 10,
                y: 10
            },
            width,
            height
        );
        setCrop(initialCrop);
    };

    const handleSave = async () => {
        if (completedCrop && imgRef.current) {
            try {
                const croppedImage = await getCroppedImg(
                    imgRef.current,
                    completedCrop,
                    rotate,
                    scale
                );
                onComplete(croppedImage);
            } catch (e) {
                console.error(e);
            }
        } else {
            // If no crop interaction, just return original (or handle error)
            onComplete(imageSrc);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-black select-none">

            {/* Cropper Container */}
            <div className="relative flex-1 bg-black w-full h-full flex items-center justify-center overflow-hidden p-4">
                <div className="max-w-full max-h-full flex items-center justify-center">
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        className="shadow-2xl"
                    >
                        <img
                            ref={imgRef}
                            src={imageSrc}
                            alt="Crop me"
                            onLoad={onImageLoad}
                            style={{
                                maxHeight: '80vh',
                                maxWidth: '100%',
                                display: 'block'
                            }}
                        />
                    </ReactCrop>
                </div>
            </div>

            {/* Controls Toolbar */}
            <div className="bg-surface/90 backdrop-blur-md pb-safe-area-bottom px-8 py-4 space-y-4 shadow-glass w-full border-t border-white/10 z-20">

                <div className="flex justify-between items-center max-w-lg mx-auto w-full pt-2">
                    <Button variant="text" onClick={onCancel} className="text-white/70 hover:text-white">
                        Cancel
                    </Button>
                    <span className="text-sm font-semibold text-white tracking-wide">Adjust</span>
                    <Button variant="text" onClick={handleSave} className="text-primary hover:text-blue-400 font-bold">
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
};
