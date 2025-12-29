document.addEventListener('DOMContentLoaded', () => {
    // Performance Optimization: Enable object caching globally
    fabric.Object.prototype.objectCaching = true;
    fabric.Object.prototype.noScaleCache = false;
    fabric.Object.prototype.transparentCorners = false;

    const canvas = new fabric.Canvas('main-canvas', {
        width: 1080,
        height: 1080,
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
        renderOnAddRemove: false // Performance: manual rendering
    });

    const state = {
        images: [],
        lines: [],
        canvasHeight: 1080,
        borderRadius: 20, // Updated to 20px
        borderThickness: 0,
        borderColor: '#000000',
        globalSize: 600, // Updated to 600
        overrideSize: false,
        lineThickness: 2,
        lineColor: '#888888',
        lineLayer: 'below',
        zoom: 0.5,
        swapMode: false,
        selectedForSwap: null
    };

    // --- Helper Functions ---

    function calculateTotalWidth() {
        if (state.images.length === 0) return 1080;
        let maxX = 1080;
        state.images.forEach(img => {
            const rightEdge = img.left + (img.width * img.scaleX);
            if (rightEdge > maxX) maxX = rightEdge;
        });
        return maxX + 100;
    }

    function applyZoom(zoom) {
        canvas.setZoom(zoom);
        const canvasWidth = calculateTotalWidth() * zoom;
        const canvasHeight = state.canvasHeight * zoom;
        canvas.setWidth(canvasWidth);
        canvas.setHeight(canvasHeight);

        const zoomVal = document.getElementById('zoom-val');
        if (zoomVal) {
            zoomVal.textContent = `${Math.round(zoom * 100)}%`;
        }

        const vpt = canvas.viewportTransform;
        vpt[4] = 0;
        vpt[5] = 0;

        canvas.requestRenderAll();
    }

    function updateCanvasWidth() {
        applyZoom(state.zoom);
        canvas.requestRenderAll();
    }

    function applyImageStyles(img) {
        const borderRadius = state.borderRadius;
        const rect = new fabric.Rect({
            width: img.width,
            height: img.height,
            rx: borderRadius / img.scaleX,
            ry: borderRadius / img.scaleY,
            left: -img.width / 2,
            top: -img.height / 2
        });
        img.set({
            clipPath: rect,
            stroke: state.borderColor,
            strokeWidth: state.borderThickness / img.scaleX,
            strokeUniform: true
        });
    }

    async function optimizeImage(dataUrl, maxWidth = 2000) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const offCanvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                offCanvas.width = width;
                offCanvas.height = height;
                const ctx = offCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(offCanvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = dataUrl;
        });
    }

    function updateLines() {
        state.lines.forEach(line => canvas.remove(line));
        state.lines = [];
        if (state.images.length < 2) return;

        for (let i = 0; i < state.images.length - 1; i++) {
            const p1 = state.images[i].getCenterPoint();
            const p2 = state.images[i + 1].getCenterPoint();
            const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
                stroke: state.lineColor,
                strokeWidth: state.lineThickness,
                selectable: false,
                evented: false,
                objectCaching: false
            });
            if (state.lineLayer === 'below') {
                canvas.add(line);
                line.sendToBack();
            } else {
                canvas.add(line);
                line.bringToFront();
            }
            state.lines.push(line);
        }
        canvas.requestRenderAll();
    }

    function constrainObject(obj) {
        const overflowLimit = state.canvasHeight * 0.03;
        const minTop = -overflowLimit;
        const maxTop = state.canvasHeight - (obj.height * obj.scaleY) + overflowLimit;

        // Vertical constraint
        if (obj.top < minTop) obj.top = minTop;
        if (obj.top > maxTop) obj.top = maxTop;

        // Horizontal constraint (cannot go left of 0)
        if (obj.left < 0) obj.left = 0;
    }

    // --- Event Listeners ---

    // Initial Zoom
    applyZoom(state.zoom);

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
        });
    }

    // Mobile Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Zoom Slider
    const zoomControl = document.getElementById('zoom-control');
    if (zoomControl) {
        zoomControl.addEventListener('input', (e) => {
            state.zoom = parseFloat(e.target.value);
            applyZoom(state.zoom);
        });
    }

    // Canvas Height
    const heightSelect = document.getElementById('canvas-height');
    if (heightSelect) {
        heightSelect.addEventListener('change', (e) => {
            state.canvasHeight = parseInt(e.target.value);
            applyZoom(state.zoom);
            canvas.requestRenderAll();
        });
    }

    // Background Color
    const bgColorInput = document.getElementById('bg-color');
    if (bgColorInput) {
        bgColorInput.addEventListener('input', (e) => {
            canvas.setBackgroundColor(e.target.value, canvas.requestRenderAll.bind(canvas));
        });
    }

    // Horizontal Scroll with Wheel
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
        canvasContainer.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                canvasContainer.scrollLeft += e.deltaY;
                e.preventDefault();
            }
        }, { passive: false });
    }

    // Image Upload
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            const imageDataList = [];

            for (const file of files) {
                const data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async (f) => {
                        const optimizedSrc = await optimizeImage(f.target.result);
                        const imgObj = new Image();
                        imgObj.onload = () => {
                            EXIF.getData(imgObj, function () {
                                const dateStr = EXIF.getTag(this, "DateTimeOriginal");
                                const timestamp = dateStr ? new Date(dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1/$2/$3")).getTime() : file.lastModified;
                                resolve({ src: optimizedSrc, timestamp });
                            });
                        };
                        imgObj.src = optimizedSrc;
                    };
                    reader.readAsDataURL(file);
                });
                imageDataList.push(data);
            }

            imageDataList.sort((a, b) => a.timestamp - b.timestamp);

            let currentX = 0;
            if (state.images.length > 0) {
                let maxX = 0;
                state.images.forEach(img => {
                    const rightEdge = img.left + (img.width * img.scaleX);
                    if (rightEdge > maxX) maxX = rightEdge;
                });
                currentX = maxX + 200 + Math.random() * 200;
            }

            for (let i = 0; i < imageDataList.length; i++) {
                const data = imageDataList[i];
                const targetX = currentX;

                fabric.Image.fromURL(data.src, (img) => {
                    const scale = state.globalSize / Math.max(img.width, img.height);
                    const randomLeft = targetX;
                    const overflowLimit = state.canvasHeight * 0.03;
                    const minTop = -overflowLimit;
                    const maxTop = state.canvasHeight - (img.height * scale) + overflowLimit;
                    const randomTop = minTop + Math.random() * (maxTop - minTop);

                    img.set({
                        left: randomLeft,
                        top: randomTop,
                        scaleX: scale,
                        scaleY: scale,
                        cornerStyle: 'circle',
                        cornerColor: '#0084ff',
                        cornerStrokeColor: '#ffffff',
                        transparentCorners: false,
                        borderColor: '#0084ff',
                        padding: 5,
                        objectCaching: true,
                        lockRotation: true
                    });

                    img.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
                    applyImageStyles(img);
                    canvas.add(img);
                    state.images.push(img);
                    updateCanvasWidth();
                    updateLines();
                });

                currentX += 200 + Math.random() * 200;
            }
            canvas.requestRenderAll();
        });
    }

    // Border Thickness
    const borderThicknessInput = document.getElementById('border-thickness');
    const borderThicknessVal = document.getElementById('border-thickness-val');
    borderThicknessInput.addEventListener('input', (e) => {
        state.borderThickness = parseInt(e.target.value);
        if (borderThicknessVal) borderThicknessVal.textContent = state.borderThickness;
        state.images.forEach(img => applyImageStyles(img));
        canvas.requestRenderAll();
    });

    // Border Color
    document.getElementById('border-color').addEventListener('input', (e) => {
        state.borderColor = e.target.value;
        state.images.forEach(img => applyImageStyles(img));
        canvas.requestRenderAll();
    });

    // Global Size
    const globalSizeInput = document.getElementById('global-size');
    const globalSizeVal = document.getElementById('global-size-val');
    globalSizeInput.addEventListener('input', (e) => {
        state.globalSize = parseInt(e.target.value);
        if (globalSizeVal) globalSizeVal.textContent = state.globalSize;
        if (state.overrideSize) {
            state.images.forEach(img => {
                const scale = state.globalSize / Math.max(img.width, img.height);
                img.set({ scaleX: scale, scaleY: scale });
                applyImageStyles(img);
            });
            updateLines();
            canvas.requestRenderAll();
        }
    });

    // Override Size
    document.getElementById('override-size').addEventListener('change', (e) => {
        state.overrideSize = e.target.checked;
    });

    // Line Settings
    const lineThicknessInput = document.getElementById('line-thickness');
    const lineThicknessVal = document.getElementById('line-thickness-val');
    lineThicknessInput.addEventListener('input', (e) => {
        state.lineThickness = parseInt(e.target.value);
        if (lineThicknessVal) lineThicknessVal.textContent = state.lineThickness;
        updateLines();
    });
    document.getElementById('line-color').addEventListener('input', (e) => {
        state.lineColor = e.target.value;
        updateLines();
    });
    document.getElementById('line-layer').addEventListener('change', (e) => {
        state.lineLayer = e.target.value;
        updateLines();
    });

    // Shuffle
    document.getElementById('shuffle-btn').addEventListener('click', () => {
        const totalWidth = calculateTotalWidth();
        state.images.forEach(img => {
            const newLeft = Math.random() * (totalWidth - (img.width * img.scaleX));
            img.set({
                left: Math.max(0, newLeft),
                top: Math.random() * (state.canvasHeight - (img.height * img.scaleY))
            });
            constrainObject(img);
            img.setCoords();
        });
        updateCanvasWidth();
        updateLines();
        canvas.requestRenderAll();
    });

    // Swap Mode
    const swapBtn = document.getElementById('swap-mode-btn');
    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            state.swapMode = !state.swapMode;
            state.selectedForSwap = null;
            swapBtn.classList.toggle('active', state.swapMode);
            state.images.forEach(img => img.set('selectable', !state.swapMode));
            canvas.discardActiveObject().requestRenderAll();
        });
    }

    // Canvas Events
    canvas.on('mouse:down', (options) => {
        if (!state.swapMode || !options.target || options.target.type !== 'image') {
            if (state.swapMode && (!options.target || options.target.type !== 'image')) {
                if (state.selectedForSwap) {
                    state.selectedForSwap.set('stroke', state.borderColor);
                    state.selectedForSwap.set('strokeWidth', state.borderThickness / state.selectedForSwap.scaleX);
                    state.selectedForSwap = null;
                    canvas.requestRenderAll();
                }
            }
            return;
        }
        const clickedImg = options.target;
        if (!state.selectedForSwap) {
            state.selectedForSwap = clickedImg;
            clickedImg.set('stroke', '#ff0000');
            clickedImg.set('strokeWidth', 5 / clickedImg.scaleX);
            canvas.requestRenderAll();
        } else if (state.selectedForSwap === clickedImg) {
            clickedImg.set('stroke', state.borderColor);
            clickedImg.set('strokeWidth', state.borderThickness / clickedImg.scaleX);
            state.selectedForSwap = null;
            canvas.requestRenderAll();
        } else {
            const tempLeft = clickedImg.left;
            const tempTop = clickedImg.top;
            clickedImg.set({ left: state.selectedForSwap.left, top: state.selectedForSwap.top });
            state.selectedForSwap.set({ left: tempLeft, top: tempTop });
            clickedImg.setCoords();
            state.selectedForSwap.setCoords();
            state.selectedForSwap.set('stroke', state.borderColor);
            state.selectedForSwap.set('strokeWidth', state.borderThickness / state.selectedForSwap.scaleX);
            state.selectedForSwap = null;
            updateLines();
            canvas.requestRenderAll();
        }
    });

    canvas.on('object:moving', (options) => {
        const obj = options.target;
        if (obj.type !== 'image') return;
        constrainObject(obj);
        updateCanvasWidth();
        updateLines();
    });

    canvas.on('object:scaling', (options) => {
        applyImageStyles(options.target);
        updateLines();
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', () => {
        const ratio = document.getElementById('slice-ratio').value;
        const [rw, rh] = ratio.split(':').map(Number);
        const sliceWidth = (state.canvasHeight * rw) / rh;
        const totalWidth = calculateTotalWidth();
        const numSlices = Math.ceil(totalWidth / sliceWidth);
        const originalZoom = canvas.getZoom();
        canvas.setZoom(1);
        for (let i = 0; i < numSlices; i++) {
            const left = i * sliceWidth;
            const dataURL = canvas.toDataURL({
                format: 'png',
                left: left,
                top: 0,
                width: sliceWidth,
                height: state.canvasHeight,
                multiplier: 1
            });
            const link = document.createElement('a');
            link.download = `perpetuity_slice_${i + 1}.png`;
            link.href = dataURL;
            link.click();
        }
        canvas.setZoom(originalZoom);
        canvas.requestRenderAll();
    });
});
