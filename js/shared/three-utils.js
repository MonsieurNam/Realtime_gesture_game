/**
 * Three.js Utilities
 * Shared utilities for 3D scene setup
 */

import * as THREE from 'three';

/**
 * Create a standard scene with fog
 * @param {Object} options - Scene options
 * @returns {THREE.Scene}
 */
export function createScene(options = {}) {
    const defaults = {
        backgroundColor: 0x1a1a2e,
        fogColor: 0x1a1a2e,
        fogNear: 30,
        fogFar: 100,
        enableFog: true
    };

    const config = { ...defaults, ...options };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);

    if (config.enableFog) {
        scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);
    }

    return scene;
}

/**
 * Create a perspective camera
 * @param {Object} options - Camera options
 * @returns {THREE.PerspectiveCamera}
 */
export function createCamera(options = {}) {
    const defaults = {
        fov: 60,
        aspect: window.innerWidth / window.innerHeight,
        near: 0.1,
        far: 1000,
        position: { x: 0, y: 10, z: 14 },
        lookAt: { x: 0, y: 0, z: 0 }
    };

    const config = { ...defaults, ...options };

    const camera = new THREE.PerspectiveCamera(
        config.fov,
        config.aspect,
        config.near,
        config.far
    );

    camera.position.set(config.position.x, config.position.y, config.position.z);
    camera.lookAt(config.lookAt.x, config.lookAt.y, config.lookAt.z);

    return camera;
}

/**
 * Create a WebGL renderer optimized for performance
 * @param {HTMLCanvasElement|Object} canvasOrOptions - Canvas element or options
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(canvasOrOptions = {}) {
    const isCanvas = canvasOrOptions instanceof HTMLCanvasElement;
    const canvas = isCanvas ? canvasOrOptions : canvasOrOptions.canvas;

    const defaults = {
        antialias: false,
        powerPreference: 'low-power',
        enableShadows: true,
        shadowMapType: THREE.PCFShadowMap,
        maxPixelRatio: 1.5
    };

    const options = isCanvas ? defaults : { ...defaults, ...canvasOrOptions };

    const rendererConfig = {
        antialias: options.antialias,
        powerPreference: options.powerPreference
    };

    if (canvas) {
        rendererConfig.canvas = canvas;
    }

    const renderer = new THREE.WebGLRenderer(rendererConfig);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.maxPixelRatio));

    if (options.enableShadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = options.shadowMapType;
    }

    return renderer;
}

/**
 * Setup standard lighting for a scene
 * @param {THREE.Scene} scene - Scene to add lights to
 * @param {string} preset - Lighting preset ('game', 'puzzle', 'custom')
 * @returns {Object} Object containing light references
 */
export function setupLighting(scene, preset = 'game') {
    const lights = {};

    // Ambient light
    lights.ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(lights.ambient);

    if (preset === 'game' || preset === 'racing') {
        // Main directional light
        lights.main = new THREE.DirectionalLight(0xffffff, 1.0);
        lights.main.position.set(10, 20, 10);
        scene.add(lights.main);

        // Neon accent lights
        lights.neon1 = new THREE.PointLight(0xff6b6b, 1, 50);
        lights.neon1.position.set(-10, 5, -20);
        scene.add(lights.neon1);

        lights.neon2 = new THREE.PointLight(0x48dbfb, 1, 50);
        lights.neon2.position.set(10, 5, -20);
        scene.add(lights.neon2);
    }

    if (preset === 'puzzle' || preset === 'hanoi') {
        // Main directional light with shadows
        lights.main = new THREE.DirectionalLight(0xffffff, 0.8);
        lights.main.position.set(5, 10, 5);
        lights.main.castShadow = true;
        lights.main.shadow.mapSize.width = 1024;
        lights.main.shadow.mapSize.height = 1024;
        lights.main.shadow.camera.near = 0.5;
        lights.main.shadow.camera.far = 30;
        lights.main.shadow.camera.left = -8;
        lights.main.shadow.camera.right = 8;
        lights.main.shadow.camera.top = 8;
        lights.main.shadow.camera.bottom = -8;
        scene.add(lights.main);

        // Fill light
        lights.fill = new THREE.DirectionalLight(0x00d9ff, 0.3);
        lights.fill.position.set(-5, 5, -5);
        scene.add(lights.fill);

        // Back light
        lights.back = new THREE.DirectionalLight(0xff6b6b, 0.2);
        lights.back.position.set(0, 5, -10);
        scene.add(lights.back);
    }

    return lights;
}

/**
 * Create a resize handler for responsive 3D
 * @param {THREE.Camera} camera - Camera to update
 * @param {THREE.WebGLRenderer} renderer - Renderer to update
 * @returns {Function} Resize handler function
 */
export function createResizeHandler(camera, renderer) {
    const handler = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handler);

    return handler;
}

/**
 * Create a raycaster for mouse/gesture interaction
 * @returns {Object} { raycaster, mouse, updateMousePosition, getIntersects }
 */
export function createInteractionHandler(camera) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const updateMousePosition = (event, element) => {
        const rect = element.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const getIntersects = (objects) => {
        raycaster.setFromCamera(mouse, camera);
        return raycaster.intersectObjects(objects);
    };

    const getWorldPosition = (planeY = 0) => {
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(plane, intersection)) {
            return intersection;
        }
        return null;
    };

    return {
        raycaster,
        mouse,
        updateMousePosition,
        getIntersects,
        getWorldPosition
    };
}

/**
 * Create starfield background
 * @param {THREE.Scene} scene - Scene to add stars to
 * @param {number} count - Number of stars
 * @returns {THREE.Points}
 */
export function createStarfield(scene, count = 300) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = Math.random() * 50 + 10;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200 - 50;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.5,
        transparent: true,
        opacity: 0.8
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    return stars;
}
