// Vision Worker
// Handles MediaPipe and Optical Flow tracking in a background thread

importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');

// Import our local modules (they must be compatible with importScripts or simple ES5/6)
// Note: ES modules in Workers need type="module", but for broad compatibility we often use importScripts.
// However, our classes are likely ES modules.
// We'll define a simple loader or just paste the Utils here if needed.
// For now, let's assume we can import scripts if they are not modules, or we load them as modules.
// Since our previous files were classes, let's try to import them if they are globals.
// BUT they were written as classes.
// Strategy: We will duplicate the Core Logic/Import it.
// To keep it simple currently: We will assume modern browser support for module workers.
// But if not, we might need a bundler.
// Let's implement the worker logic assuming we can load the scripts.

importScripts('webgpu-utils.js');
importScripts('gpu-preprocessor.js');
importScripts('webgpu-optical-flow.js');

let hands = null;
let gpuUtils = null;
let gpuProcessor = null;
let opticalFlow = null;
let device = null;
let canvas2D = null;
let ctx2D = null;

let isCalibrating = false;
let gestureMode = false;

// Shared State
let prevKeyframeTexture = null;
let trackedPoints = []; // 21 points {x,y}
let lastKeyframeTime = 0;
const KEYFRAME_INTERVAL = 100; // ms

self.onmessage = async function (e) {
    const { type, data, width, height, canvas } = e.data;

    switch (type) {
        case 'INIT':
            await init(data.config, canvas);
            break;
        case 'FRAME':
            if (gestureMode) await processFrame(data.imageBitmap, data.timestamp);
            break;
        case 'CONFIG':
            if (data.gestureMode !== undefined) gestureMode = data.gestureMode;
            break;
    }
};

async function init(config, offscreenCanvas) {
    // 1. Init WebGPU
    try {
        gpuUtils = new WebGPUUtils();
        device = await gpuUtils.init();
        if (device) {
            gpuProcessor = new GpuPreprocessor(device);
            opticalFlow = new WebGpuOpticalFlow(device, 640, 480);
            await gpuProcessor.init();
            await opticalFlow.init();
            postMessage({ type: 'STATUS', data: 'WebGPU Ready' });
        } else {
            postMessage({ type: 'ERROR', data: 'WebGPU not supported' });
        }
    } catch (err) {
        console.error('Worker WebGPU Init Error:', err);
        postMessage({ type: 'ERROR', data: err.message });
    }

    // 2. Init MediaPipe
    try {
        hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        hands.onResults(onHandResults);
        postMessage({ type: 'STATUS', data: 'MediaPipe Ready' });
    } catch (err) {
        console.error('Worker MediaPipe Init Error:', err);
    }
}

async function processFrame(imageBitmap, timestamp) {
    try {
        const now = performance.now();
        const shouldKeyframe = (now - lastKeyframeTime > KEYFRAME_INTERVAL);

        if (shouldKeyframe && hands) {
            // 1. Run MediaPipe (Heavy)
            // Hands.send() takes HTMLVideoElement, Image, or Canvas.
            // ImageBitmap is supported in recent versions.
            await hands.send({ image: imageBitmap });
            lastKeyframeTime = now;

            // Also update GPU texture for next optical flow
            if (gpuProcessor && opticalFlow) {
                gpuProcessor.execute(imageBitmap);
                // We need to store this texture for next frame's Previous
                // In a real loop we would swap.
                // For now, let's wait for logic.
            }
        } else if (opticalFlow && prevKeyframeTexture) {
            // 2. Run Optical Flow (Fast)
            // Flow: Current Image -> GPU Texture -> Optical Flow -> Points

            // A. Preprocess Current Frame
            gpuProcessor.execute(imageBitmap);
            const currTexture = gpuProcessor.getOutputTexture();

            // B. Track
            if (trackedPoints.length > 0) {
                const newPoints = await opticalFlow.track(prevKeyframeTexture, currTexture, trackedPoints);
                // Check drift/confidence?
                trackedPoints = newPoints;

                // Send results back immediately
                postMessage({
                    type: 'RESULT',
                    data: {
                        landmarks: convertPointsToLandmarks(newPoints),
                        source: 'OPTICAL_FLOW'
                    }
                });
            }

            // Update Previous Texture (Swap or Copy?)
            // Simple approach: Copy current to prev
            // TODO: Optimize texture management
        }

    } catch (err) {
        console.error('Worker Process Error:', err);
    }
}

function onHandResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        postMessage({ type: 'RESULT', data: { landmarks: results.multiHandLandmarks, source: 'MEDIAPIPE' } });

        // Update tracking points for Optical Flow
        // Simplified: Take first hand for tracking
        if (results.multiHandLandmarks[0]) {
            trackedPoints = results.multiHandLandmarks[0].map(pt => ({ x: pt.x * 640, y: pt.y * 480 })); // Pixel scale

            // Store GPU texture if available
            if (gpuProcessor) {
                // This logic needs refinement: MediaPipe used the frame, we should capture that frame's texture
                // stored in `prevKeyframeTexture`
                prevKeyframeTexture = gpuProcessor.getOutputTexture();
            }
        }
    } else {
        postMessage({ type: 'Result', data: { landmarks: [], source: 'MEDIAPIPE' } });
    }
}

function convertPointsToLandmarks(points) {
    // Convert pixel coordinates back to normalized 0-1
    return [points.map(pt => ({ x: pt.x / 640, y: pt.y / 480, z: 0 }))];
}
