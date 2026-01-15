/**
 * WebGPU Sparse Lucas-Kanade Optical Flow
 * 
 * Performs iterative optical flow tracking on GPU compute shaders.
 * Input: Previous Frame Texture, Current Frame Texture, Reference Keypoints (Buffer)
 * Output: Tracked Keypoints (Buffer)
 */
class WebGpuOpticalFlow {
    constructor(device, width, height) {
        this.device = device;
        this.width = width;
        this.height = height;

        this.pipeline = null;
        this.bindGroupLayout = null;

        // Buffers
        this.pointsBufferSrc = null; // Previous points
        this.pointsBufferDst = null; // Current points (tracking result)
        this.resultBuffer = null;    // Readback buffer

        // Constants
        this.windowSize = 15;
        this.maxIterations = 10;
        this.epsilon = 0.01;
        this.numPoints = 21; // Hand landmarks
    }

    async init() {
        // WGSL Shader: Sparse Lucas-Kanade
        const shaderModule = this.device.createShaderModule({
            label: 'Lucas-Kanade Compute Shader',
            code: `
                struct Point {
                    x: f32,
                    y: f32,
                }

                @group(0) @binding(0) var prevTex : texture_2d<f32>;
                @group(0) @binding(1) var currTex : texture_2d<f32>;
                @group(0) @binding(2) var samp : sampler;
                @group(0) @binding(3) var<storage, read> prevPoints : array<Point>;
                @group(0) @binding(4) var<storage, read_write> currPoints : array<Point>;

                // Gradient calculation helper
                fn get_gradient(tex: texture_2d<f32>, s: sampler, uv: vec2<f32>, dims: vec2<f32>) -> vec2<f32> {
                    let offX = vec2<f32>(1.0 / dims.x, 0.0);
                    let offY = vec2<f32>(0.0, 1.0 / dims.y);
                    
                    let left = textureSampleLevel(tex, s, uv - offX, 0.0).r;
                    let right = textureSampleLevel(tex, s, uv + offX, 0.0).r;
                    let top = textureSampleLevel(tex, s, uv - offY, 0.0).r;
                    let bottom = textureSampleLevel(tex, s, uv + offY, 0.0).r;
                    
                    return vec2<f32>((right - left) * 0.5, (bottom - top) * 0.5);
                }

                @compute @workgroup_size(64)
                fn track(@builtin(global_invocation_id) global_id : vec3<u32>) {
                    let idx = global_id.x;
                    if (idx >= arrayLength(&prevPoints)) { return; }

                    let dims = vec2<f32>(textureDimensions(prevTex));
                    let p_prev = prevPoints[idx]; // Pixel coords
                    var p_curr = currPoints[idx]; // Initial guess (usually same as prev)

                    // Iterative Lucas-Kanade
                    for (let n = 0; n < 20; n++) { // Changed maxIterations to 20 for safety
                        var G = mat2x2<f32>(0.0, 0.0, 0.0, 0.0); // Spatial gradient matrix
                        var b = vec2<f32>(0.0, 0.0);             // Mismatch vector
                        
                        // Window loop (15x15)
                        for (let wy = -7; wy <= 7; wy++) {
                            for (let wx = -7; wx <= 7; wx++) {
                                // Sample coordinates
                                let uv_prev = (vec2<f32>(p_prev.x + f32(wx), p_prev.y + f32(wy)) + 0.5) / dims;
                                let uv_curr = (vec2<f32>(p_curr.x + f32(wx), p_curr.y + f32(wy)) + 0.5) / dims;

                                if (uv_prev.x < 0.0 || uv_prev.x > 1.0 || uv_prev.y < 0.0 || uv_prev.y > 1.0) { continue; }

                                // Intensity and Gradients from Previous Frame
                                let Ix_Iy = get_gradient(prevTex, samp, uv_prev, dims);
                                let Ix = Ix_Iy.x;
                                let Iy = Ix_Iy.y;
                                
                                // Temporal Difference It = I(curr) - I(prev)
                                let I_prev = textureSampleLevel(prevTex, samp, uv_prev, 0.0).r;
                                let I_curr = textureSampleLevel(currTex, samp, uv_curr, 0.0).r;
                                let It = I_curr - I_prev;

                                // Accumulate G matrix and b vector
                                G[0][0] += Ix * Ix;
                                G[0][1] += Ix * Iy;
                                G[1][0] += Ix * Iy;
                                G[1][1] += Iy * Iy;

                                b.x += -It * Ix;
                                b.y += -It * Iy;
                            }
                        }

                        // Solve G * d = b using determinant
                        let det = G[0][0] * G[1][1] - G[0][1] * G[1][0];
                        if (abs(det) < 0.00001) { break; } // Singular matrix

                        let invDet = 1.0 / det;
                        let dx = (G[1][1] * b.x - G[0][1] * b.y) * invDet;
                        let dy = (G[0][0] * b.y - G[1][0] * b.x) * invDet;

                        p_curr.x += dx;
                        p_curr.y += dy;

                        // Convergence check
                        if (abs(dx) < 0.01 && abs(dy) < 0.01) { break; }
                    }

                    // Write back result
                    currPoints[idx] = p_curr;
                }
            `
        });

        this.pipeline = this.device.createComputePipeline({
            label: 'LK Optical Flow Pipeline',
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: 'track' }
        });

        // Sampler
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        // Init buffers for 21 points (float32 x 2)
        const bufferSize = this.numPoints * 2 * 4; // 21 * 2 * 4 bytes
        this.pointsBufferSrc = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.pointsBufferDst = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });
        this.resultBuffer = this.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    }

    /**
     * Run Optical Flow on GPU
     * @param {GPUTexture} prevTexture - Grayscale texture of previous frame
     * @param {GPUTexture} currTexture - Grayscale texture of current frame
     * @param {Array} keypoints - Array of {x, y} objects (21 points)
     * @returns {Promise<Array>} Updated keypoints {x, y}
     */
    async track(prevTexture, currTexture, keypoints) {
        if (!this.pipeline) await this.init();

        // 1. Upload keypoints to GPU
        const pointsData = new Float32Array(keypoints.length * 2);
        for (let i = 0; i < keypoints.length; i++) {
            pointsData[i * 2] = keypoints[i].x;     // Pixel coords
            pointsData[i * 2 + 1] = keypoints[i].y;
        }

        this.device.queue.writeBuffer(this.pointsBufferSrc, 0, pointsData);
        // Initialize destination with same points (as initial guess)
        this.device.queue.writeBuffer(this.pointsBufferDst, 0, pointsData);

        // 2. Create BindGroup
        const bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: prevTexture.createView() },
                { binding: 1, resource: currTexture.createView() },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: { buffer: this.pointsBufferSrc } },
                { binding: 4, resource: { buffer: this.pointsBufferDst } }
            ]
        });

        // 3. Dispatch Compute
        const commandEncoder = this.device.createCommandEncoder();
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(1); // 1 workgroup handles all 21 points
        pass.end();

        // 4. Readback results
        commandEncoder.copyBufferToBuffer(
            this.pointsBufferDst, 0,
            this.resultBuffer, 0,
            pointsData.byteLength
        );
        this.device.queue.submit([commandEncoder.finish()]);

        // 5. Map async
        await this.resultBuffer.mapAsync(GPUMapMode.READ);
        const mappedRange = this.resultBuffer.getMappedRange();
        const resultFloat32 = new Float32Array(mappedRange.slice(0));
        this.resultBuffer.unmap();

        // 6. Convert back to array of objects
        const updatedPoints = [];
        for (let i = 0; i < keypoints.length; i++) {
            updatedPoints.push({
                x: resultFloat32[i * 2],
                y: resultFloat32[i * 2 + 1]
            });
        }
        return updatedPoints; // Can include status/error later
    }
}
