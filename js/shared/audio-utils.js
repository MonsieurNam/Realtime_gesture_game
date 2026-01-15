/**
 * Audio Utilities
 * Shared utilities for Web Audio API
 */

/**
 * AudioManager class for handling game audio
 */
export class AudioManager {
    constructor() {
        this.context = null;
        this.enabled = true;
        this.oscillators = {};
        this.gains = {};
    }

    /**
     * Initialize audio context
     */
    init() {
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            return true;
        } catch (error) {
            console.error('Audio context error:', error);
            return false;
        }
    }

    /**
     * Resume audio context (required after user interaction)
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Toggle audio on/off
     */
    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopAll();
        }
        return this.enabled;
    }

    /**
     * Create and start an oscillator
     * @param {string} name - Name identifier for the oscillator
     * @param {Object} options - Oscillator options
     */
    createOscillator(name, options = {}) {
        if (!this.context || !this.enabled) return;

        const defaults = {
            type: 'sine',
            frequency: 440,
            gain: 0.1
        };

        const config = { ...defaults, ...options };

        try {
            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.type = config.type;
            oscillator.frequency.setValueAtTime(config.frequency, this.context.currentTime);
            gainNode.gain.setValueAtTime(config.gain, this.context.currentTime);

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);
            oscillator.start();

            this.oscillators[name] = oscillator;
            this.gains[name] = gainNode;
        } catch (error) {
            console.error('Oscillator creation error:', error);
        }
    }

    /**
     * Update oscillator frequency
     * @param {string} name - Oscillator name
     * @param {number} frequency - New frequency
     */
    setFrequency(name, frequency) {
        if (this.oscillators[name] && this.context) {
            this.oscillators[name].frequency.setValueAtTime(frequency, this.context.currentTime);
        }
    }

    /**
     * Stop and remove an oscillator
     * @param {string} name - Oscillator name
     */
    stopOscillator(name) {
        try {
            if (this.oscillators[name]) {
                this.oscillators[name].stop();
                delete this.oscillators[name];
                delete this.gains[name];
            }
        } catch (error) { }
    }

    /**
     * Stop all oscillators
     */
    stopAll() {
        Object.keys(this.oscillators).forEach(name => {
            this.stopOscillator(name);
        });
    }

    /**
     * Play a one-shot sound effect
     * @param {Object} options - Sound options
     */
    playSound(options = {}) {
        if (!this.context || !this.enabled) return;

        const defaults = {
            type: 'square',
            frequency: 440,
            endFrequency: null,
            gain: 0.1,
            duration: 0.2,
            ramp: 'exponential'
        };

        const config = { ...defaults, ...options };

        try {
            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.type = config.type;
            oscillator.frequency.setValueAtTime(config.frequency, this.context.currentTime);

            if (config.endFrequency) {
                if (config.ramp === 'exponential') {
                    oscillator.frequency.exponentialRampToValueAtTime(
                        config.endFrequency,
                        this.context.currentTime + config.duration
                    );
                } else {
                    oscillator.frequency.linearRampToValueAtTime(
                        config.endFrequency,
                        this.context.currentTime + config.duration
                    );
                }
            }

            gainNode.gain.setValueAtTime(config.gain, this.context.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + config.duration);

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator.start();
            oscillator.stop(this.context.currentTime + config.duration);
        } catch (error) { }
    }

    /**
     * Play collision sound effect
     */
    playCollision() {
        this.playSound({
            type: 'square',
            frequency: 100,
            endFrequency: 50,
            gain: 0.2,
            duration: 0.3
        });
    }

    /**
     * Play success sound effect
     */
    playSuccess() {
        this.playSound({
            type: 'sine',
            frequency: 523,
            gain: 0.15,
            duration: 0.15
        });

        setTimeout(() => {
            this.playSound({
                type: 'sine',
                frequency: 659,
                gain: 0.15,
                duration: 0.15
            });
        }, 100);

        setTimeout(() => {
            this.playSound({
                type: 'sine',
                frequency: 784,
                gain: 0.15,
                duration: 0.3
            });
        }, 200);
    }

    /**
     * Play error sound effect
     */
    playError() {
        this.playSound({
            type: 'sawtooth',
            frequency: 200,
            endFrequency: 100,
            gain: 0.15,
            duration: 0.2
        });
    }
}

// Singleton instance
export const audioManager = new AudioManager();
