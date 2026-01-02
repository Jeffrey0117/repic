import { drawAnnotation } from './drawingHelpers.js';

// Processes crop data from Cropper component
// crop: { x, y, width, height } in pixels
export default async function getCroppedImg(
    image,
    crop,
    rotate = 0,
    scale = 1,
    annotations = []
) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('No 2d context');
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const pixelRatio = 1;

    canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high';

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;

    const rotateRads = rotate * Math.PI / 180;
    const centerX = image.naturalWidth / 2;
    const centerY = image.naturalHeight / 2;

    ctx.save();

    // Move the crop origin to the canvas origin (0,0)
    ctx.translate(-cropX, -cropY);
    // Move the origin to the center of the original position
    ctx.translate(centerX, centerY);
    // Rotate around the origin
    ctx.rotate(rotateRads);
    // Scale the image
    ctx.scale(scale, scale);
    // Move the center of the image to the origin (0,0)
    ctx.translate(-centerX, -centerY);

    ctx.drawImage(
        image,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
    );

    // Render Annotations using shared drawing helpers
    annotations.forEach(ann => {
        // Convert UI coordinates to natural coordinates
        const scaledAnnotation = {
            ...ann,
            x: ann.x * scaleX,
            y: ann.y * scaleY,
            width: ann.width * scaleX,
            height: ann.height * scaleY
        };

        drawAnnotation(ctx, scaledAnnotation, {
            scale: scaleX,
            image: ann.type === 'blur' ? image : null
        });
    });

    ctx.restore();

    return new Promise((resolve) => {
        resolve(canvas.toDataURL('image/jpeg', 0.95)); // High quality jpeg
    });
}
