/**
 * Tower of Hanoi - Configuration
 */

export const CONFIG = {
    // Disk settings
    diskColors: [
        '#ff6b6b', // Red
        '#ffa502', // Orange
        '#ffd93d', // Yellow
        '#6bcb77', // Green
        '#4d96ff', // Blue
        '#9b59b6', // Purple
        '#e84393'  // Pink
    ],
    diskMinRadius: 0.3,
    diskMaxRadius: 1.0,
    diskHeight: 0.25,
    diskGap: 0.02,

    // Rod settings
    rodHeight: 3,
    rodRadius: 0.08,
    rodSpacing: 3,
    rodPositions: [-3, 0, 3],

    // Gesture settings
    PINCH_THRESHOLD: 0.06,

    // Animation settings
    liftHeight: 2.5,
    animationSpeed: 0.15
};

/**
 * Create initial game state
 */
export function createGameState() {
    return {
        numDisks: 3,
        rods: [[], [], []], // Array of disk indices on each rod
        disks: [], // Three.js mesh objects
        moveCount: 0,
        startTime: null,
        timerInterval: null,
        isPlaying: false,
        gestureMode: false,

        // Interaction state
        selectedDisk: null,
        selectedDiskOriginalRod: null,
        isDragging: false,

        // Gesture state with smoothing
        isPinching: false,
        handPosition: { x: 0.5, y: 0.5 },
        smoothedHandPosition: { x: 0.5, y: 0.5 },
        targetHandPosition: { x: 0.5, y: 0.5 },
        lastPinchState: false,

        // Pinch gesture buffer
        pinchBuffer: [],
        PINCH_BUFFER_SIZE: 5,

        // Smoothing parameters
        POSITION_SMOOTHING: 0.3,
        DISK_FOLLOW_SPEED: 0.15,

        // Target position for smooth disk movement
        targetDiskPosition: { x: 0, z: 0 },

        // Animation
        animations: []
    };
}
