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
        renderOnAddRemove: false, // Performance: manual rendering
        selection: false // Disable box selection
    });

    const state = {
        images: [],
        lines: [],
        canvasHeight: 1080,
        borderRadius: 20,
        globalSize: 650,
        overrideSize: false,
        lineThickness: 0,
        lineColor: '#888888',
        lineLayer: 'below',
        zoom: 0.5,
        swapMode: false,
        selectedForSwap: null,
        enableShadow: true,
        shadowBlur: 40,
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        madMaxMode: false,
        uploadedFileHashes: new Set()
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
        updatePreview();
        canvas.requestRenderAll();
    }

    function updatePreview() {
        const previewOuter = document.getElementById('canvas-preview-outer');
        if (state.images.length === 0) {
            previewOuter.style.display = 'none';
            return;
        }
        previewOuter.style.display = 'block';

        const previewCanvas = document.getElementById('preview-canvas');
        const ctx = previewCanvas.getContext('2d');
        const totalWidth = calculateTotalWidth();

        // Set internal resolution
        previewCanvas.width = totalWidth / 10;
        previewCanvas.height = state.canvasHeight / 10;

        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.fillStyle = canvas.backgroundColor || '#ffffff';
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

        state.images.forEach(img => {
            ctx.save();
            ctx.translate(img.left / 10, img.top / 10);
            ctx.scale(img.scaleX / 10, img.scaleY / 10);
            // Draw a simple placeholder for performance
            ctx.fillStyle = '#888888';
            ctx.globalAlpha = 0.5;
            ctx.fillRect(0, 0, img.width, img.height);
            ctx.restore();
        });

        updatePreviewViewport();
    }

    function updatePreviewViewport() {
        const container = document.getElementById('canvas-container');
        const viewport = document.getElementById('preview-viewport');
        const totalWidth = calculateTotalWidth() * state.zoom;

        if (totalWidth === 0) return;

        const visibleWidth = container.clientWidth;
        const scrollLeft = container.scrollLeft;

        const widthPercent = (visibleWidth / totalWidth) * 100;
        const leftPercent = (scrollLeft / totalWidth) * 100;

        viewport.style.width = `${Math.min(100, widthPercent)}%`;
        viewport.style.left = `${Math.min(100, leftPercent)}%`;
    }

    function findBestPosition(imgWidth, imgHeight, scale) {
        const h = imgHeight * scale;
        const lastImg = state.images[state.images.length - 1];
        const secondLastImg = state.images[state.images.length - 2];

        // Vertical margin: 10%
        const margin = state.canvasHeight * 0.10;
        const minTop = -margin;
        const maxTop = state.canvasHeight - h + margin;

        // If it's the first image, start at 100px padding
        if (!lastImg) {
            return {
                left: 100,
                top: minTop + Math.random() * (maxTop - minTop)
            };
        }

        // Horizontal step: 250px-400px
        // In MadMax mode, we use a much smaller step to fit ~7 images per 1080px
        let step = 250 + Math.random() * 150;

        if (state.madMaxMode) {
            step = 120 + Math.random() * 60; // Average 150px step -> ~7 images per 1080px
        }

        // Vertical placement: Stricter pattern prevention
        let newTop;
        let attempts = 0;
        // Loosen vertical distance for MadMax to allow more density
        const minVerticalDist = state.madMaxMode ? 50 : 200;

        do {
            newTop = minTop + Math.random() * (maxTop - minTop);
            attempts++;

            const distToLast = Math.abs(newTop - lastImg.top);

            let isZigZag = false;
            if (secondLastImg && !state.madMaxMode) {
                const lastDir = lastImg.top - secondLastImg.top;
                const currentDir = newTop - lastImg.top;
                if ((lastDir > 0 && currentDir < 0) || (lastDir < 0 && currentDir > 0)) {
                    if (Math.abs(Math.abs(lastDir) - Math.abs(currentDir)) < 100) {
                        isZigZag = true;
                    }
                }
            }

            if (distToLast > minVerticalDist && !isZigZag) break;
        } while (attempts < 15);

        return {
            left: lastImg.left + step,
            top: newTop
        };
    } function applyImageStyles(img) {
        const borderRadius = state.borderRadius;
        const rect = new fabric.Rect({
            width: img.width,
            height: img.height,
            rx: borderRadius / img.scaleX,
            ry: borderRadius / img.scaleY,
            left: -img.width / 2,
            top: -img.height / 2
        });

        const shadow = state.enableShadow ? new fabric.Shadow({
            color: state.shadowColor + Math.round(state.shadowOpacity * 255).toString(16).padStart(2, '0'),
            blur: state.shadowBlur,
            offsetX: 0,
            offsetY: 0
        }) : null;

        img.set({
            clipPath: rect,
            shadow: shadow,
            stroke: null,
            strokeWidth: 0
        });
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    async function getFileHash(file) {
        // Simple hash based on name, size and last modified
        return `${file.name}-${file.size}-${file.lastModified}`;
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
        // Reduced margin: only 5% of canvas height to keep images mostly inside
        const overflowLimit = state.canvasHeight * 0.05;
        const minTop = -overflowLimit;
        const maxTop = state.canvasHeight - (obj.height * obj.scaleY) + overflowLimit;

        // Vertical constraint
        if (obj.top < minTop) obj.top = minTop;
        if (obj.top > maxTop) obj.top = maxTop;

        // Horizontal constraint (100px padding on the left)
        if (obj.left < 100) obj.left = 100;
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
                // Increased scroll speed (multiplier: 2.5)
                canvasContainer.scrollLeft += e.deltaY * 2.5;
                updatePreviewViewport();
                e.preventDefault();
            }
        }, { passive: false });

        canvasContainer.addEventListener('scroll', updatePreviewViewport);
    }

    // Preview Click/Drag to Scroll
    const previewContainer = document.getElementById('canvas-preview-container');
    if (previewContainer) {
        const handlePreviewInteraction = (e) => {
            const rect = previewContainer.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            if (clientX === undefined) return;

            const x = clientX - rect.left;
            const totalWidth = calculateTotalWidth() * state.zoom;
            const visibleWidth = canvasContainer.clientWidth;

            // Calculate the percentage of the click relative to the track
            // We want the thumb to be centered on the mouse, but constrained
            const thumbWidth = (visibleWidth / totalWidth) * rect.width;
            const scrollPercent = (x - thumbWidth / 2) / (rect.width - thumbWidth);

            canvasContainer.scrollLeft = scrollPercent * (totalWidth - visibleWidth);
            updatePreviewViewport();
        };

        previewContainer.addEventListener('mousedown', (e) => {
            state.isPreviewDragging = true;
            handlePreviewInteraction(e);
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (state.isPreviewDragging) {
                handlePreviewInteraction(e);
            }
        });

        window.addEventListener('mouseup', () => {
            state.isPreviewDragging = false;
        });

        // Touch support
        previewContainer.addEventListener('touchstart', (e) => {
            state.isPreviewDragging = true;
            handlePreviewInteraction(e);
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (state.isPreviewDragging) {
                handlePreviewInteraction(e);
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('touchend', () => {
            state.isPreviewDragging = false;
        });
    }

    // Image Upload
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            const imageDataList = [];
            let duplicateCount = 0;

            for (const file of files) {
                const hash = await getFileHash(file);
                if (state.uploadedFileHashes.has(hash)) {
                    duplicateCount++;
                    continue;
                }
                state.uploadedFileHashes.add(hash);

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

            if (duplicateCount > 0) {
                showToast(`${duplicateCount}개의 중복된 이미지가 제외되었습니다.`);
            }

            if (imageDataList.length === 0) return;

            imageDataList.sort((a, b) => a.timestamp - b.timestamp);

            for (let i = 0; i < imageDataList.length; i++) {
                const data = imageDataList[i];

                fabric.Image.fromURL(data.src, (img) => {
                    const scale = state.globalSize / Math.max(img.width, img.height);
                    const pos = findBestPosition(img.width, img.height, scale);

                    img.set({
                        left: pos.left,
                        top: pos.top,
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
            }
            canvas.requestRenderAll();
        });
    }

    // Border Thickness 제거됨 (Shadow로 대체)
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

    // MadMax Mode
    const madMaxToggle = document.getElementById('madmax-mode');
    if (madMaxToggle) {
        madMaxToggle.addEventListener('change', (e) => {
            state.madMaxMode = e.target.checked;

            // Apply to existing images if override is on
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
    }    // Override Size
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

    // Shadow Settings
    const enableShadowInput = document.getElementById('enable-shadow');
    if (enableShadowInput) {
        enableShadowInput.addEventListener('change', (e) => {
            state.enableShadow = e.target.checked;
            state.images.forEach(img => applyImageStyles(img));
            canvas.requestRenderAll();
        });
    }

    const shadowBlurInput = document.getElementById('shadow-blur');
    const shadowBlurVal = document.getElementById('shadow-blur-val');
    if (shadowBlurInput) {
        shadowBlurInput.addEventListener('input', (e) => {
            state.shadowBlur = parseInt(e.target.value);
            if (shadowBlurVal) shadowBlurVal.textContent = state.shadowBlur;
            state.images.forEach(img => applyImageStyles(img));
            canvas.requestRenderAll();
        });
    }

    const shadowColorInput = document.getElementById('shadow-color');
    if (shadowColorInput) {
        shadowColorInput.addEventListener('input', (e) => {
            state.shadowColor = e.target.value;
            state.images.forEach(img => applyImageStyles(img));
            canvas.requestRenderAll();
        });
    }

    const shadowOpacityInput = document.getElementById('shadow-opacity');
    const shadowOpacityVal = document.getElementById('shadow-opacity-val');
    if (shadowOpacityInput) {
        shadowOpacityInput.addEventListener('input', (e) => {
            state.shadowOpacity = parseFloat(e.target.value);
            if (shadowOpacityVal) shadowOpacityVal.textContent = state.shadowOpacity;
            state.images.forEach(img => applyImageStyles(img));
            canvas.requestRenderAll();
        });
    }

    // Shuffle
    document.getElementById('shuffle-btn').addEventListener('click', () => {
        const totalWidth = calculateTotalWidth();
        state.images.forEach(img => {
            const newLeft = 100 + Math.random() * (totalWidth - 200 - (img.width * img.scaleX));
            const margin = state.canvasHeight * 0.10; // Updated to 10% to match findBestPosition
            const newTop = -margin + Math.random() * (state.canvasHeight + margin * 2 - (img.height * img.scaleY));

            img.set({
                left: Math.max(100, newLeft),
                top: newTop
            });
            constrainObject(img);
            img.setCoords();
        });

        updateCanvasWidth();
        updateLines();
        updatePreview();
        canvas.requestRenderAll();
    });    // Swap Mode
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
                    state.selectedForSwap.set('stroke', null);
                    state.selectedForSwap.set('strokeWidth', 0);
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
            clickedImg.set('stroke', null);
            clickedImg.set('strokeWidth', 0);
            state.selectedForSwap = null;
            canvas.requestRenderAll();
        } else {
            const tempLeft = clickedImg.left;
            const tempTop = clickedImg.top;
            clickedImg.set({ left: state.selectedForSwap.left, top: state.selectedForSwap.top });
            state.selectedForSwap.set({ left: tempLeft, top: tempTop });
            clickedImg.setCoords();
            state.selectedForSwap.setCoords();
            state.selectedForSwap.set('stroke', null);
            state.selectedForSwap.set('strokeWidth', 0);
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
        updatePreview();
    });

    canvas.on('object:scaling', (options) => {
        applyImageStyles(options.target);
        updateLines();
        updatePreview();
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

    // Tutorial Logic
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    const closeTutorialBtn = document.getElementById('close-tutorial');

    if (tutorialOverlay && closeTutorialBtn) {
        const hasSeenTutorial = localStorage.getItem('perpetuity-tutorial-seen');

        if (!hasSeenTutorial) {
            setTimeout(() => {
                tutorialOverlay.classList.add('show');
            }, 500);
        }

        closeTutorialBtn.addEventListener('click', () => {
            tutorialOverlay.classList.remove('show');
            localStorage.setItem('perpetuity-tutorial-seen', 'true');
        });
    }
});
