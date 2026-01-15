/**
 * MediaPipe Utilities
 * Shared utilities for hand gesture recognition
 */

/**
 * Initialize MediaPipe Hands
 * @param {Object} options - Configuration options
 * @returns {Promise<Hands>} Initialized Hands instance
 */
export async function initMediaPipe(options = {}) {
    const defaultOptions = {
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5
    };
    
    const config = { ...defaultOptions, ...options };
    
    return new Promise((resolve, reject) => {
        try {
            const hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });
            
            hands.setOptions(config);
            resolve(hands);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Request camera access and set up video element
 * @param {HTMLVideoElement} videoElement - Video element for camera feed
 * @param {Object} options - Camera options
 * @returns {Promise<MediaStream>}
 */
export async function startCamera(videoElement, options = {}) {
    const defaultOptions = {
        width: 640,
        height: 480,
        facingMode: 'user'
    };
    
    const config = { ...defaultOptions, ...options };
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: config
        });
        
        videoElement.srcObject = stream;
        
        await new Promise(resolve => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });
        
        return stream;
    } catch (error) {
        console.error('Camera access error:', error);
        throw error;
    }
}

/**
 * Stop camera stream
 * @param {HTMLVideoElement} videoElement - Video element with camera stream
 */
export function stopCamera(videoElement) {
    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
}

/**
 * HandTracker class for encapsulating hand tracking state
 */
export class HandTracker {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.isRunning = false;
        this.callbacks = {
            onResults: null,
            onError: null
        };
        
        // State with smoothing
        this.state = {
            handPosition: { x: 0.5, y: 0.5 },
            smoothedPosition: { x: 0.5, y: 0.5 },
            isPinching: false,
            pinchDistance: 1,
            handsDetected: false
        };
        
        // Smoothing parameters
        this.smoothing = 0.3;
        this.pinchBuffer = [];
        this.pinchBufferSize = 5;
        this.pinchThreshold = 0.06;
    }
    
    /**
     * Initialize hand tracking
     * @param {HTMLVideoElement} videoElement - Video element for camera feed
     * @param {Function} onResults - Callback for hand detection results
     */
    async init(videoElement, onResults) {
        this.callbacks.onResults = onResults;
        
        try {
            this.hands = await initMediaPipe();
            this.hands.onResults(this._processResults.bind(this));
            
            await startCamera(videoElement);
            
            this.camera = new Camera(videoElement, {
                onFrame: async () => {
                    if (this.isRunning && this.hands) {
                        await this.hands.send({ image: videoElement });
                    }
                },
                width: 640,
                height: 480
            });
            
            return true;
        } catch (error) {
            console.error('HandTracker init error:', error);
            return false;
        }
    }
    
    /**
     * Start hand tracking
     */
    async start() {
        if (this.camera) {
            this.isRunning = true;
            await this.camera.start();
        }
    }
    
    /**
     * Stop hand tracking
     */
    stop() {
        this.isRunning = false;
        if (this.camera) {
            this.camera.stop();
        }
    }
    
    /**
     * Process MediaPipe results with smoothing
     * @private
     */
    _processResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // Key landmarks
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            
            // Calculate pinch distance
            const pinchDistance = Math.sqrt(
                Math.pow(thumbTip.x - indexTip.x, 2) +
                Math.pow(thumbTip.y - indexTip.y, 2)
            );
            
            // Stabilize pinch detection
            const rawPinching = pinchDistance < this.pinchThreshold;
            this.pinchBuffer.push(rawPinching);
            if (this.pinchBuffer.length > this.pinchBufferSize) {
                this.pinchBuffer.shift();
            }
            
            const pinchCount = this.pinchBuffer.filter(Boolean).length;
            this.state.isPinching = pinchCount >= Math.ceil(this.pinchBufferSize * 0.6);
            
            // Smooth position (flipped for mirrored webcam)
            const rawX = 1 - indexTip.x;
            const rawY = indexTip.y;
            
            this.state.smoothedPosition.x += (rawX - this.state.smoothedPosition.x) * this.smoothing;
            this.state.smoothedPosition.y += (rawY - this.state.smoothedPosition.y) * this.smoothing;
            
            this.state.handPosition.x = rawX;
            this.state.handPosition.y = rawY;
            this.state.pinchDistance = pinchDistance;
            this.state.handsDetected = true;
        } else {
            this.state.handsDetected = false;
            this.pinchBuffer = [];
        }
        
        // Call user callback
        if (this.callbacks.onResults) {
            this.callbacks.onResults(results, this.state);
        }
    }
    
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
}

/**
 * Calculate if fingers are open (for racing game gestures)
 * @param {Array} landmarks - Hand landmarks array
 * @returns {Object} { openFingers, isOpen, isClosed }
 */
export function detectFingerState(landmarks) {
    const fingerTips = [8, 12, 16, 20]; // Index, middle, ring, pinky tips
    const fingerBases = [5, 9, 13, 17]; // Corresponding bases
    
    let openFingers = 0;
    fingerTips.forEach((tipIdx, i) => {
        if (landmarks[tipIdx].y < landmarks[fingerBases[i]].y) {
            openFingers++;
        }
    });
    
    return {
        openFingers,
        isOpen: openFingers >= 3,
        isClosed: openFingers <= 1
    };
}

/**
 * Calculate hand steering value (for racing game)
 * @param {Array} landmarks - Hand landmarks array
 * @returns {number} Steering value from -1 (left) to 1 (right)
 */
export function calculateSteering(landmarks) {
    const wrist = landmarks[0];
    const middleBase = landmarks[9];
    
    const handCenter = (wrist.x + middleBase.x) / 2;
    const tilt = middleBase.x - wrist.x;
    
    // Negate for mirrored webcam
    const steering = -((handCenter - 0.5) * 2 + tilt * 3);
    
    return Math.max(-1, Math.min(1, steering));
}
