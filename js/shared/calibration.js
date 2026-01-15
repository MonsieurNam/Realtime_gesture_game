/**
 * CalibrationManager - Personalized Gesture Calibration System
 * 
 * Collects user-specific measurements to optimize gesture recognition:
 * - Hand size (scale factor)
 * - Pinch threshold (personalized)
 * - Steering range (max tilt angle)
 * 
 * Uses localStorage to persist calibration data.
 */

class CalibrationManager {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'gestureCalibration';
        this.onProgress = options.onProgress || (() => { });
        this.onComplete = options.onComplete || (() => { });
        this.onStep = options.onStep || (() => { });

        // Default calibration values
        this.defaults = {
            handScale: 1.0,
            pinchThreshold: 0.06,
            maxSteeringAngle: 0.3,
            calibrated: false,
            timestamp: null
        };

        // Measurement buffers
        this.measurements = {
            handSizes: [],
            pinchDistances: [],
            steeringAngles: []
        };

        // Calibration state
        this.currentStep = 0;
        this.steps = ['relax', 'pinch', 'steer'];
        this.stepDuration = 3000; // 3 seconds per step
        this.isCalibrating = false;

        // Load saved calibration
        this.calibration = this.load();
    }

    /**
     * Start calibration wizard
     * @returns {Promise} Resolves with calibration data
     */
    async start() {
        this.isCalibrating = true;
        this.currentStep = 0;
        this.measurements = { handSizes: [], pinchDistances: [], steeringAngles: [] };

        try {
            // Step 1: Relaxed hand - measure hand size
            await this.runStep('relax', 'Thả lỏng tay trước camera', (landmarks) => {
                const handSize = this.measureHandSize(landmarks);
                if (handSize > 0) this.measurements.handSizes.push(handSize);
            });

            // Step 2: Pinch - measure pinch threshold
            await this.runStep('pinch', 'Nắm ngón cái và trỏ lại', (landmarks) => {
                const pinchDist = this.measurePinchDistance(landmarks);
                if (pinchDist > 0) this.measurements.pinchDistances.push(pinchDist);
            });

            // Step 3: Steer - measure max steering angle
            await this.runStep('steer', 'Nghiêng tay trái/phải hết cỡ', (landmarks) => {
                const angle = this.measureSteeringAngle(landmarks);
                this.measurements.steeringAngles.push(Math.abs(angle));
            });

            // Calculate final calibration
            const result = this.calculateCalibration();
            this.calibration = result;
            this.save(result);

            this.isCalibrating = false;
            this.onComplete(result);

            return result;

        } catch (error) {
            this.isCalibrating = false;
            throw error;
        }
    }

    /**
     * Run a single calibration step
     */
    runStep(stepName, instruction, measureFn) {
        return new Promise((resolve) => {
            this.onStep({ step: stepName, instruction, duration: this.stepDuration });

            const startTime = Date.now();
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(1, elapsed / this.stepDuration);
                this.onProgress({ step: stepName, progress });

                if (elapsed >= this.stepDuration) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);

            // Store measureFn for external calls
            this._currentMeasureFn = measureFn;
        });
    }

    /**
     * Feed landmarks during calibration (called from game's onHandResults)
     */
    feedLandmarks(landmarks) {
        if (!this.isCalibrating || !this._currentMeasureFn) return;
        this._currentMeasureFn(landmarks);
    }

    /**
     * Measure hand size (wrist to middle fingertip distance)
     */
    measureHandSize(landmarks) {
        if (!landmarks || landmarks.length < 21) return 0;

        const wrist = landmarks[0];
        const middleTip = landmarks[12];

        const distance = Math.sqrt(
            Math.pow(middleTip.x - wrist.x, 2) +
            Math.pow(middleTip.y - wrist.y, 2)
        );

        return distance;
    }

    /**
     * Measure pinch distance (thumb tip to index tip)
     */
    measurePinchDistance(landmarks) {
        if (!landmarks || landmarks.length < 21) return 0;

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        const distance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) +
            Math.pow(thumbTip.y - indexTip.y, 2) +
            Math.pow((thumbTip.z || 0) - (indexTip.z || 0), 2) * 0.5
        );

        return distance;
    }

    /**
     * Measure steering angle (hand tilt)
     */
    measureSteeringAngle(landmarks) {
        if (!landmarks || landmarks.length < 21) return 0;

        const wrist = landmarks[0];
        const middleBase = landmarks[9];

        // Tilt = horizontal difference
        const tilt = middleBase.x - wrist.x;

        return tilt;
    }

    /**
     * Calculate final calibration values from measurements
     */
    calculateCalibration() {
        // Hand scale: compare to average hand size
        const avgHandSize = this.average(this.measurements.handSizes);
        const referenceSize = 0.25; // Normalized reference
        const handScale = avgHandSize > 0 ? referenceSize / avgHandSize : 1.0;

        // Pinch threshold: use minimum pinch distance + margin
        const minPinch = Math.min(...this.measurements.pinchDistances.filter(d => d > 0));
        const pinchThreshold = isFinite(minPinch) ? minPinch * 1.3 : this.defaults.pinchThreshold;

        // Max steering: use 90th percentile of angles
        const sortedAngles = [...this.measurements.steeringAngles].sort((a, b) => b - a);
        const maxSteeringAngle = sortedAngles.length > 0
            ? sortedAngles[Math.floor(sortedAngles.length * 0.1)]
            : this.defaults.maxSteeringAngle;

        return {
            handScale: Math.max(0.5, Math.min(2.0, handScale)),
            pinchThreshold: Math.max(0.03, Math.min(0.12, pinchThreshold)),
            maxSteeringAngle: Math.max(0.1, Math.min(0.5, maxSteeringAngle)),
            calibrated: true,
            timestamp: Date.now()
        };
    }

    /**
     * Calculate average
     */
    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Save calibration to localStorage
     */
    save(data) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('Failed to save calibration:', e);
            return false;
        }
    }

    /**
     * Load calibration from localStorage
     */
    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                // Validate
                if (data.calibrated && data.timestamp) {
                    return { ...this.defaults, ...data };
                }
            }
        } catch (e) {
            console.warn('Failed to load calibration:', e);
        }
        return { ...this.defaults };
    }

    /**
     * Reset calibration to defaults
     */
    reset() {
        this.calibration = { ...this.defaults };
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) { }
        return this.calibration;
    }

    /**
     * Get normalized steering value
     * @param {number} rawAngle - Raw tilt angle from landmarks
     * @returns {number} Normalized steering (-1 to 1)
     */
    normalizeSteeringAngle(rawAngle) {
        const maxAngle = this.calibration.maxSteeringAngle || this.defaults.maxSteeringAngle;
        return Math.max(-1, Math.min(1, rawAngle / maxAngle));
    }

    /**
     * Check if pinching (with personalized threshold)
     * @param {number} distance - Pinch distance
     * @returns {boolean}
     */
    isPinching(distance) {
        const threshold = this.calibration.pinchThreshold || this.defaults.pinchThreshold;
        return distance < threshold;
    }

    /**
     * Get calibration status
     */
    getStatus() {
        return {
            calibrated: this.calibration.calibrated,
            age: this.calibration.timestamp
                ? Math.floor((Date.now() - this.calibration.timestamp) / 1000 / 60)
                : null,
            values: {
                handScale: this.calibration.handScale?.toFixed(2),
                pinchThreshold: this.calibration.pinchThreshold?.toFixed(3),
                maxSteeringAngle: this.calibration.maxSteeringAngle?.toFixed(2)
            }
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CalibrationManager };
}
