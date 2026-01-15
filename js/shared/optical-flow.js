/**
 * Lucas-Kanade Sparse Optical Flow
 * 
 * Tracks landmark points between frames using pyramid-based Lucas-Kanade algorithm.
 * Optimized for hand tracking with 21 MediaPipe landmarks.
 * 
 * @see https://en.wikipedia.org/wiki/Lucas%E2%80%93Kanade_method
 */

class OpticalFlow {
    /**
     * @param {number} windowSize - Size of the search window (default: 15)
     * @param {number} pyramidLevels - Number of pyramid levels (default: 3)
     * @param {number} maxIterations - Max iterations per point (default: 10)
     * @param {number} epsilon - Convergence threshold (default: 0.01)
     */
    constructor(windowSize = 15, pyramidLevels = 3, maxIterations = 10, epsilon = 0.01) {
        this.windowSize = windowSize;
        this.halfWindow = Math.floor(windowSize / 2);
        this.pyramidLevels = pyramidLevels;
        this.maxIterations = maxIterations;
        this.epsilon = epsilon;

        this.prevFrame = null;
        this.prevPyramid = null;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    /**
     * Convert video/image to grayscale ImageData
     * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source
     * @returns {ImageData}
     */
    getGrayscaleFrame(source) {
        const width = source.videoWidth || source.width;
        const height = source.videoHeight || source.height;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.ctx.drawImage(source, 0, 0, width, height);
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Convert to grayscale array (single channel)
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const idx = i * 4;
            // Luminance formula: 0.299*R + 0.587*G + 0.114*B
            gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }

        return { data: gray, width, height };
    }

    /**
     * Build image pyramid for multi-scale tracking
     * @param {Object} frame - Grayscale frame {data, width, height}
     * @returns {Array} Array of pyramid levels
     */
    buildPyramid(frame) {
        const pyramid = [frame];
        let current = frame;

        for (let level = 1; level < this.pyramidLevels; level++) {
            const newWidth = Math.floor(current.width / 2);
            const newHeight = Math.floor(current.height / 2);

            if (newWidth < 10 || newHeight < 10) break;

            const downsampled = new Float32Array(newWidth * newHeight);

            for (let y = 0; y < newHeight; y++) {
                for (let x = 0; x < newWidth; x++) {
                    const srcX = x * 2;
                    const srcY = y * 2;
                    // 2x2 average
                    const sum = this.getPixel(current, srcX, srcY) +
                        this.getPixel(current, srcX + 1, srcY) +
                        this.getPixel(current, srcX, srcY + 1) +
                        this.getPixel(current, srcX + 1, srcY + 1);
                    downsampled[y * newWidth + x] = sum / 4;
                }
            }

            current = { data: downsampled, width: newWidth, height: newHeight };
            pyramid.push(current);
        }

        return pyramid;
    }

    /**
     * Get pixel value with bounds checking
     */
    getPixel(frame, x, y) {
        x = Math.max(0, Math.min(frame.width - 1, Math.floor(x)));
        y = Math.max(0, Math.min(frame.height - 1, Math.floor(y)));
        return frame.data[y * frame.width + x];
    }

    /**
     * Get subpixel value using bilinear interpolation
     */
    getSubPixel(frame, x, y) {
        if (x < 0 || x >= frame.width - 1 || y < 0 || y >= frame.height - 1) {
            return this.getPixel(frame, x, y);
        }

        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const dx = x - x0;
        const dy = y - y0;

        const p00 = frame.data[y0 * frame.width + x0];
        const p10 = frame.data[y0 * frame.width + x0 + 1];
        const p01 = frame.data[(y0 + 1) * frame.width + x0];
        const p11 = frame.data[(y0 + 1) * frame.width + x0 + 1];

        return p00 * (1 - dx) * (1 - dy) +
            p10 * dx * (1 - dy) +
            p01 * (1 - dx) * dy +
            p11 * dx * dy;
    }

    /**
     * Compute spatial gradients (Sobel)
     */
    computeGradients(frame) {
        const { width, height, data } = frame;
        const Ix = new Float32Array(width * height);
        const Iy = new Float32Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;

                // Sobel X: [-1 0 1; -2 0 2; -1 0 1]
                Ix[idx] = (
                    -data[(y - 1) * width + (x - 1)] + data[(y - 1) * width + (x + 1)] +
                    -2 * data[y * width + (x - 1)] + 2 * data[y * width + (x + 1)] +
                    -data[(y + 1) * width + (x - 1)] + data[(y + 1) * width + (x + 1)]
                ) / 8;

                // Sobel Y: [-1 -2 -1; 0 0 0; 1 2 1]
                Iy[idx] = (
                    -data[(y - 1) * width + (x - 1)] - 2 * data[(y - 1) * width + x] - data[(y - 1) * width + (x + 1)] +
                    data[(y + 1) * width + (x - 1)] + 2 * data[(y + 1) * width + x] + data[(y + 1) * width + (x + 1)]
                ) / 8;
            }
        }

        return { Ix, Iy };
    }

    /**
     * Track a single point using Lucas-Kanade
     * @param {Object} prevFrame - Previous frame at pyramid level
     * @param {Object} currFrame - Current frame at pyramid level
     * @param {Object} gradients - Precomputed gradients
     * @param {number} px - Point x coordinate
     * @param {number} py - Point y coordinate
     * @returns {Object} {x, y, error} - New position and tracking error
     */
    trackPoint(prevFrame, currFrame, gradients, px, py) {
        const { Ix, Iy } = gradients;
        const { width, height } = prevFrame;
        const hw = this.halfWindow;

        let ux = 0, uy = 0;

        for (let iter = 0; iter < this.maxIterations; iter++) {
            let sumIxIx = 0, sumIyIy = 0, sumIxIy = 0;
            let sumIxIt = 0, sumIyIt = 0;

            const newX = px + ux;
            const newY = py + uy;

            // Accumulate over window
            for (let wy = -hw; wy <= hw; wy++) {
                for (let wx = -hw; wx <= hw; wx++) {
                    const x0 = Math.round(px + wx);
                    const y0 = Math.round(py + wy);

                    if (x0 < 1 || x0 >= width - 1 || y0 < 1 || y0 >= height - 1) continue;

                    const idx = y0 * width + x0;
                    const ix = Ix[idx];
                    const iy = Iy[idx];

                    const i0 = this.getSubPixel(prevFrame, x0, y0);
                    const i1 = this.getSubPixel(currFrame, newX + wx, newY + wy);
                    const it = i1 - i0;

                    sumIxIx += ix * ix;
                    sumIyIy += iy * iy;
                    sumIxIy += ix * iy;
                    sumIxIt += ix * it;
                    sumIyIt += iy * it;
                }
            }

            // Solve 2x2 system: A * [u; v] = b
            const det = sumIxIx * sumIyIy - sumIxIy * sumIxIy;

            if (Math.abs(det) < 1e-6) {
                // Singular matrix - can't track
                return { x: px, y: py, error: Infinity };
            }

            const du = (sumIyIy * (-sumIxIt) - sumIxIy * (-sumIyIt)) / det;
            const dv = (sumIxIx * (-sumIyIt) - sumIxIy * (-sumIxIt)) / det;

            ux += du;
            uy += dv;

            // Check convergence
            if (Math.abs(du) < this.epsilon && Math.abs(dv) < this.epsilon) {
                break;
            }
        }

        // Compute tracking error (SSD in window)
        let error = 0;
        let count = 0;
        for (let wy = -hw; wy <= hw; wy++) {
            for (let wx = -hw; wx <= hw; wx++) {
                const i0 = this.getSubPixel(prevFrame, px + wx, py + wy);
                const i1 = this.getSubPixel(currFrame, px + ux + wx, py + uy + wy);
                error += (i1 - i0) ** 2;
                count++;
            }
        }
        error = Math.sqrt(error / count);

        return { x: px + ux, y: py + uy, error };
    }

    /**
     * Track multiple points from previous frame to current frame
     * @param {HTMLVideoElement} source - Video source
     * @param {Array} points - Array of {x, y} normalized coordinates (0-1)
     * @returns {Object} {points: Array, errors: Array, avgError: number}
     */
    track(source, points) {
        const frame = this.getGrayscaleFrame(source);
        const pyramid = this.buildPyramid(frame);

        if (!this.prevPyramid) {
            this.prevPyramid = pyramid;
            return { points: points.slice(), errors: points.map(() => 0), avgError: 0 };
        }

        const { width, height } = frame;
        const trackedPoints = [];
        const errors = [];

        for (const point of points) {
            // Convert normalized to pixel coordinates
            let px = point.x * width;
            let py = point.y * height;

            // Coarse-to-fine tracking through pyramid
            for (let level = this.pyramidLevels - 1; level >= 0; level--) {
                if (level >= pyramid.length || level >= this.prevPyramid.length) continue;

                const scale = Math.pow(2, level);
                const levelPx = px / scale;
                const levelPy = py / scale;

                const prevLevel = this.prevPyramid[level];
                const currLevel = pyramid[level];
                const gradients = this.computeGradients(prevLevel);

                const result = this.trackPoint(prevLevel, currLevel, gradients, levelPx, levelPy);

                // Update position for next level
                px = result.x * scale;
                py = result.y * scale;

                if (level === 0) {
                    errors.push(result.error);
                }
            }

            // Convert back to normalized coordinates
            trackedPoints.push({
                x: Math.max(0, Math.min(1, px / width)),
                y: Math.max(0, Math.min(1, py / height))
            });
        }

        this.prevPyramid = pyramid;

        const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

        return { points: trackedPoints, errors, avgError };
    }

    /**
     * Reset tracker state (call when switching to MediaPipe keyframe)
     */
    reset() {
        this.prevPyramid = null;
    }

    /**
     * Set new reference frame from MediaPipe detection
     * @param {HTMLVideoElement} source
     */
    setKeyframe(source) {
        const frame = this.getGrayscaleFrame(source);
        this.prevPyramid = this.buildPyramid(frame);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OpticalFlow };
}
