import React, { useRef, useEffect, useState } from 'react';

export const AnnotationLayer = ({ activeTool, onDrawEnd, imageRef }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [annotations, setAnnotations] = useState([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || !imageRef.current) return;

        // Sync canvas size with image size
        const resizeCanvas = () => {
            canvas.width = imageRef.current.clientWidth;
            canvas.height = imageRef.current.clientHeight;
            redraw();
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [imageRef.current]);

    const redraw = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        annotations.forEach(ann => drawAnnotation(ctx, ann));
    };

    const drawAnnotation = (ctx, ann) => {
        ctx.strokeStyle = '#0066FF';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        switch (ann.type) {
            case 'rect':
                ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                break;
            case 'circle':
                ctx.beginPath();
                ctx.ellipse(ann.x + ann.width / 2, ann.y + ann.height / 2, Math.abs(ann.width / 2), Math.abs(ann.height / 2), 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'arrow':
                drawArrow(ctx, ann.x, ann.y, ann.x + ann.width, ann.y + ann.height);
                break;
            case 'blur':
                // For MVP, we just draw a semi-transparent box for blur representation
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
                break;
        }
    };

    const drawArrow = (ctx, fromx, fromy, tox, toy) => {
        const headlen = 15;
        const dx = tox - fromx;
        const dy = toy - fromy;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(fromx, fromy);
        ctx.lineTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(tox, toy);
        ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    };

    const handleMouseDown = (e) => {
        if (!activeTool) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPos({ x, y });
        setIsDrawing(true);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing || !activeTool) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        redraw();
        const ctx = canvasRef.current.getContext('2d');
        drawAnnotation(ctx, {
            type: activeTool,
            x: startPos.x,
            y: startPos.y,
            width: x - startPos.x,
            height: y - startPos.y
        });
    };

    const handleMouseUp = (e) => {
        if (!isDrawing || !activeTool) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newAnn = {
            type: activeTool,
            x: startPos.x,
            y: startPos.y,
            width: x - startPos.x,
            height: y - startPos.y
        };

        setAnnotations([...annotations, newAnn]);
        setIsDrawing(false);
        if (onDrawEnd) onDrawEnd([...annotations, newAnn]);
    };

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        />
    );
};
