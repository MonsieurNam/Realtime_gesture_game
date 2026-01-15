/**
 * WebGPU Utility Class
 * Handles browser support checking, adapter request, and device initialization.
 */
class WebGPUUtils {
    constructor() {
        this.device = null;
        this.adapter = null;
    }

    /**
     * Checks if WebGPU is supported in the current browser
     * @returns {boolean}
     */
    static isSupported() {
        return !!navigator.gpu;
    }

    /**
     * Initializes the WebGPU device
     * @returns {Promise<GPUDevice|null>} The WebGPU Device or null if failed
     */
    async init() {
        if (!WebGPUUtils.isSupported()) {
            console.warn('WebGPU is not supported in this browser.');
            return null;
        }

        try {
            this.adapter = await navigator.gpu.requestAdapter();
            if (!this.adapter) {
                console.warn('No appropriate WebGPU adapter found.');
                return null;
            }

            this.device = await this.adapter.requestDevice();

            this.device.lost.then((info) => {
                console.error(`WebGPU device was lost: ${info.message}`);
                this.device = null;
            });

            console.log('WebGPU initialized successfully:', this.adapter.features);
            return this.device;
        } catch (error) {
            console.error('Failed to initialize WebGPU:', error);
            return null;
        }
    }

    getDevice() {
        return this.device;
    }
}
