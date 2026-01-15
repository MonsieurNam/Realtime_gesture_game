/**
 * Vision Client
 * Bridge between Main Thread (Game) and Vision Worker
 */
export class VisionClient {
    constructor(videoElement) {
        this.video = videoElement;
        this.worker = new Worker('../js/shared/vision-worker.js');
        this.canvas = document.createElement('canvas'); // Offscreen source
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.callbacks = new Set();
        this.isReady = false;

        this.setupWorker();
    }

    setupWorker() {
        this.worker.onmessage = (e) => {
            const { type, data } = e.data;
            if (type === 'STATUS') {
                console.log('[VisionClient] Worker Status:', data);
                if (data === 'MediaPipe Ready') this.isReady = true;
            } else if (type === 'RESULT') {
                this.notifyListeners(data);
            } else if (type === 'ERROR') {
                console.error('[VisionClient] Worker Error:', data);
            }
        };
    }

    async start() {
        // Init Camera
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            this.video.srcObject = stream;
            await new Promise(r => { this.video.onloadedmetadata = () => { this.video.play(); r(); }; });

            // Send Init Config to Worker
            // We need to transfer an OffscreenCanvas for WebGPU if supported
            // Or just ImageBitmap loop for MediaPipe

            // For efficient Transferable support:
            // 1. Create OffscreenCanvas from the video track? (Not directly supported)
            // 2. Or create a main thread canvas and transferControlToOffscreen()?
            //    (Only works if canvas is in DOM, but we can creating one in memory)
            //    Actually, we can send ImageBitmaps every frame. It's fast and zero-copy in many browsers.

            this.worker.postMessage({
                type: 'INIT',
                data: { config: { width: 640, height: 480 } }
            });

            this.startLoop();
        } catch (e) {
            console.error('Camera Access Error:', e);
            throw e;
        }
    }

    startLoop() {
        const loop = async () => {
            if (this.video.readyState >= 2) {
                // Create ImageBitmap (Efficient transfer)
                const bitmap = await createImageBitmap(this.video);

                this.worker.postMessage({
                    type: 'FRAME',
                    data: {
                        imageBitmap: bitmap,
                        timestamp: performance.now()
                    }
                }, [bitmap]); // Transfer ownership
            }
            requestAnimationFrame(loop);
        };
        loop();
    }

    onResult(callback) {
        this.callbacks.add(callback);
    }

    notifyListeners(data) {
        this.callbacks.forEach(cb => cb(data));
    }
}
