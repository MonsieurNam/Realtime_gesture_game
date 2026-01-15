/**
 * HybridTracker - Combines MediaPipe with Optical Flow for efficient tracking
 * 
 * Strategy:
 * - Keyframes: Run full MediaPipe detection (every N frames)
 * - Tracking frames: Use Lucas-Kanade Optical Flow (fast, low CPU)
 * - Auto-correction: Force keyframe when drift is detected
 */

class HybridTracker {
    /**
     * @param {Object} options
     * @param {number} options.keyframeInterval - Frames between MediaPipe runs (default: 5)
     * @param {number} options.maxDriftError - Error threshold to force keyframe (default: 0.05)
     * @param {number} options.minConfidence - Min MediaPipe confidence (default: 0.7)
     * @param {boolean} options.adaptiveInterval - Adjust interval based on movement (default: true)
     */
    constructor(options = {}) {
        this.keyframeInterval = options.keyframeInterval || 5;
        this.maxDriftError = options.maxDriftError || 0.05;
        this.minConfidence = options.minConfidence || 0.7;
        this.adaptiveInterval = options.adaptiveInterval !== false;

        // State
        this.frameCount = 0;
        this.lastKeyframeTime = 0;
        this.currentInterval = this.keyframeInterval;
        this.lastLandmarks = null;
        this.isTracking = false;
        this.trackingLost = false;

        // Optical Flow tracker
        this.opticalFlow = new OpticalFlow(11, 3, 10, 0.01);

        // Performance metrics
        this.metrics = {
            keyframeCount: 0,
            trackingFrameCount: 0,
            forcedKeyframes: 0,
            avgTrackingError: 0,
            lastProcessingTime: 0
        };

        // Callbacks
        this.onKeyframe = null;
        this.onTracking = null;
        this.onError = null;

        // Movement detection for adaptive interval
        this.movementHistory = [];
        this.movementThreshold = 0.02;
    }

    /**
     * Check if current frame should be a keyframe
     * @returns {boolean}
     */
    shouldRunKeyframe() {
        // First frame or tracking lost
        if (!this.lastLandmarks || this.trackingLost) {
            return true;
        }

        // Regular interval
        if (this.frameCount % this.currentInterval === 0) {
            return true;
        }

        return false;
    }

    /**
     * Process a frame - decides whether to use MediaPipe or Optical Flow
     * @param {HTMLVideoElement} videoElement
     * @param {Hands} mediaPipeHands - MediaPipe Hands instance
     * @param {Function} callback - Called with landmarks {points, isKeyframe, error}
     */
    async processFrame(videoElement, mediaPipeHands, callback) {
        const startTime = performance.now();
        this.frameCount++;

        if (this.shouldRunKeyframe()) {
            // KEYFRAME: Run full MediaPipe detection
            await this.runKeyframe(videoElement, mediaPipeHands, callback, startTime);
        } else {
            // TRACKING: Use Optical Flow
            this.runTracking(videoElement, callback, startTime);
        }
    }

    /**
     * Run MediaPipe detection (keyframe)
     */
    async runKeyframe(videoElement, mediaPipeHands, callback, startTime) {
        try {
            // Send to MediaPipe
            await mediaPipeHands.send({ image: videoElement });

            // Results will come via onResults callback
            // Store callback for when results arrive
            this._pendingCallback = callback;
            this._keyframeStartTime = startTime;

        } catch (error) {
            console.error('MediaPipe keyframe error:', error);
            if (this.onError) this.onError(error);

            // Fall back to tracking if we have previous landmarks
            if (this.lastLandmarks) {
                this.runTracking(videoElement, callback, startTime);
            }
        }
    }

    /**
     * Handle MediaPipe results (called from onResults)
     * @param {Object} results - MediaPipe results
     */
    handleMediaPipeResults(results) {
        const callback = this._pendingCallback;
        const startTime = this._keyframeStartTime || performance.now();

        if (!callback) return;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // Convert to simple {x, y} format
            const points = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z || 0 }));

            // Store for tracking
            this.lastLandmarks = points;
            this.trackingLost = false;
            this.isTracking = true;

            // Reset optical flow with new keyframe
            this.opticalFlow.setKeyframe(this._currentVideo);

            // Update metrics
            this.metrics.keyframeCount++;
            this.lastKeyframeTime = performance.now();

            // Detect movement for adaptive interval
            this.updateMovementHistory(points);
            this.adjustInterval();

            const processingTime = performance.now() - startTime;
            this.metrics.lastProcessingTime = processingTime;

            callback({
                points: landmarks, // Return original MediaPipe format
                isKeyframe: true,
                error: 0,
                processingTime,
                method: 'mediapipe'
            });

            if (this.onKeyframe) this.onKeyframe(points);

        } else {
            // No hand detected
            this.trackingLost = true;
            this.lastLandmarks = null;
            this.opticalFlow.reset();

            callback({
                points: null,
                isKeyframe: true,
                error: 1,
                processingTime: performance.now() - startTime,
                method: 'mediapipe'
            });
        }

        this._pendingCallback = null;
    }

    /**
     * Run Optical Flow tracking
     */
    runTracking(videoElement, callback, startTime) {
        if (!this.lastLandmarks) {
            callback({
                points: null,
                isKeyframe: false,
                error: 1,
                processingTime: 0,
                method: 'none'
            });
            return;
        }

        this._currentVideo = videoElement;

        // Track landmarks using optical flow
        const result = this.opticalFlow.track(videoElement, this.lastLandmarks);

        // Check for drift
        if (result.avgError > this.maxDriftError) {
            // Drift detected - force keyframe next frame
            this.trackingLost = true;
            this.metrics.forcedKeyframes++;

            if (this.onError) {
                this.onError({ type: 'drift', error: result.avgError });
            }
        }

        // Update landmarks with tracked positions
        this.lastLandmarks = result.points;

        // Update metrics
        this.metrics.trackingFrameCount++;
        this.metrics.avgTrackingError =
            (this.metrics.avgTrackingError * (this.metrics.trackingFrameCount - 1) + result.avgError) /
            this.metrics.trackingFrameCount;

        const processingTime = performance.now() - startTime;
        this.metrics.lastProcessingTime = processingTime;

        // Convert to MediaPipe-like format
        const mediaPipeFormat = result.points.map((p, i) => ({
            x: p.x,
            y: p.y,
            z: this.lastLandmarks[i]?.z || 0
        }));

        callback({
            points: mediaPipeFormat,
            isKeyframe: false,
            error: result.avgError,
            processingTime,
            method: 'optical-flow'
        });

        if (this.onTracking) this.onTracking(result);
    }

    /**
     * Track movement history for adaptive interval
     */
    updateMovementHistory(points) {
        if (this.movementHistory.length > 0) {
            const lastPoints = this.movementHistory[this.movementHistory.length - 1];
            let totalMovement = 0;

            for (let i = 0; i < Math.min(points.length, lastPoints.length); i++) {
                const dx = points[i].x - lastPoints[i].x;
                const dy = points[i].y - lastPoints[i].y;
                totalMovement += Math.sqrt(dx * dx + dy * dy);
            }

            this.lastMovement = totalMovement / points.length;
        }

        this.movementHistory.push(points.map(p => ({ x: p.x, y: p.y })));

        // Keep only last 10 frames
        if (this.movementHistory.length > 10) {
            this.movementHistory.shift();
        }
    }

    /**
     * Adjust keyframe interval based on movement
     */
    adjustInterval() {
        if (!this.adaptiveInterval) return;

        if (this.lastMovement > this.movementThreshold * 2) {
            // Fast movement - more keyframes
            this.currentInterval = Math.max(3, this.keyframeInterval - 2);
        } else if (this.lastMovement < this.movementThreshold * 0.5) {
            // Slow movement - fewer keyframes
            this.currentInterval = Math.min(8, this.keyframeInterval + 2);
        } else {
            // Normal - default interval
            this.currentInterval = this.keyframeInterval;
        }
    }

    /**
     * Force next frame to be a keyframe
     */
    forceKeyframe() {
        this.trackingLost = true;
    }

    /**
     * Reset tracker state
     */
    reset() {
        this.frameCount = 0;
        this.lastLandmarks = null;
        this.isTracking = false;
        this.trackingLost = false;
        this.opticalFlow.reset();
        this.movementHistory = [];
        this.currentInterval = this.keyframeInterval;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        const total = this.metrics.keyframeCount + this.metrics.trackingFrameCount;
        return {
            ...this.metrics,
            totalFrames: total,
            keyframeRatio: total > 0 ? this.metrics.keyframeCount / total : 0,
            trackingRatio: total > 0 ? this.metrics.trackingFrameCount / total : 0,
            currentInterval: this.currentInterval
        };
    }

    /**
     * Get efficiency stats (for display)
     */
    getEfficiencyStats() {
        const metrics = this.getMetrics();
        return {
            cpuSavings: `${Math.round(metrics.trackingRatio * 100)}%`,
            keyframes: metrics.keyframeCount,
            trackingFrames: metrics.trackingFrameCount,
            avgError: metrics.avgTrackingError.toFixed(4),
            forcedKeyframes: metrics.forcedKeyframes
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HybridTracker };
}
