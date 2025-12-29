// Adapted for react-image-crop output
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

    // Render Annotations
    annotations.forEach(ann => {
        ctx.strokeStyle = '#0066FF';
        ctx.lineWidth = 3 * scaleX; // Adjust stroke for natural resolution
        ctx.lineCap = 'round';

        // Convert UI coordinates to natural coordinates
        const x = ann.x * scaleX;
        const y = ann.y * scaleY;
        const w = ann.width * scaleX;
        const h = ann.height * scaleY;

        switch (ann.type) {
            case 'rect':
                ctx.strokeRect(x, y, w, h);
                break;
            case 'circle':
                ctx.beginPath();
                ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'arrow':
                const headlen = 15 * scaleX;
                const tox = x + w;
                const toy = y + h;
                const dx = tox - x;
                const dy = toy - y;
                const angle = Math.atan2(dy, dx);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(tox, toy);
                ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(tox, toy);
                ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
                break;
            case 'blur':
                // Simple blur implementation: draw a blurred version of the clipped area
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.clip();
                ctx.filter = 'blur(10px)';
                ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
                ctx.restore();
                break;
        }
    });

    ctx.restore();

    return new Promise((resolve) => {
        resolve(canvas.toDataURL('image/jpeg', 0.95)); // High quality jpeg
    });
}
