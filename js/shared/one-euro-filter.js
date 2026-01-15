/**
 * One Euro Filter - Adaptive Low-Pass Filter
 * 
 * Giảm jitter khi tay đứng yên, giảm latency khi tay di chuyển nhanh.
 * Paper: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 * 
 * @see https://cristal.univ-lille.fr/~casiez/1euro/
 */

class LowPassFilter {
    constructor(alpha) {
        this.alpha = alpha;
        this.initialized = false;
        this.hatXPrev = 0;
    }

    filter(x) {
        if (!this.initialized) {
            this.initialized = true;
            this.hatXPrev = x;
            return x;
        }
        const hatX = this.alpha * x + (1 - this.alpha) * this.hatXPrev;
        this.hatXPrev = hatX;
        return hatX;
    }

    setAlpha(alpha) {
        this.alpha = alpha;
    }

    reset() {
        this.initialized = false;
    }
}

class OneEuroFilter {
    /**
     * @param {number} freq - Tần số lấy mẫu (Hz). Ví dụ: 30 cho camera 30fps
     * @param {number} minCutoff - Tần số cắt tối thiểu (Hz). Default: 1.0
     *                             Giá trị nhỏ = mượt hơn khi đứng yên, nhưng lag hơn
     * @param {number} beta - Hệ số tốc độ. Default: 0.007
     *                        Giá trị lớn = phản hồi nhanh hơn khi di chuyển, nhưng nhiễu hơn
     * @param {number} dCutoff - Tần số cắt cho đạo hàm. Default: 1.0
     */
    constructor(freq, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;

        this.xFilter = new LowPassFilter(this._alpha(minCutoff));
        this.dxFilter = new LowPassFilter(this._alpha(dCutoff));
        this.lastTime = null;
    }

    _alpha(cutoff) {
        const te = 1.0 / this.freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }

    /**
     * Lọc giá trị đầu vào
     * @param {number} x - Giá trị thô cần lọc
     * @param {number} timestamp - Thời gian hiện tại (ms). Tùy chọn.
     * @returns {number} Giá trị đã lọc
     */
    filter(x, timestamp = null) {
        // Cập nhật tần số dựa trên timestamp thực tế
        if (timestamp !== null && this.lastTime !== null) {
            const dt = (timestamp - this.lastTime) / 1000; // Convert to seconds
            if (dt > 0) {
                this.freq = 1.0 / dt;
            }
        }
        this.lastTime = timestamp;

        // Tính đạo hàm (tốc độ thay đổi)
        const dx = this.xFilter.initialized
            ? (x - this.xFilter.hatXPrev) * this.freq
            : 0;

        // Lọc đạo hàm
        const edx = this.dxFilter.filter(dx);

        // Tính cutoff thích ứng: cutoff = minCutoff + beta * |speed|
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        this.xFilter.setAlpha(this._alpha(cutoff));

        // Trả về giá trị đã lọc
        return this.xFilter.filter(x);
    }

    /**
     * Reset bộ lọc (khi mất tracking hoặc bắt đầu mới)
     */
    reset() {
        this.xFilter.reset();
        this.dxFilter.reset();
        this.lastTime = null;
    }
}

/**
 * OneEuroFilter2D - Lọc cho tọa độ 2D (x, y)
 */
class OneEuroFilter2D {
    constructor(freq, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.xFilter = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
        this.yFilter = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
    }

    filter(x, y, timestamp = null) {
        return {
            x: this.xFilter.filter(x, timestamp),
            y: this.yFilter.filter(y, timestamp)
        };
    }

    reset() {
        this.xFilter.reset();
        this.yFilter.reset();
    }
}

/**
 * OneEuroFilter3D - Lọc cho tọa độ 3D (x, y, z)
 */
class OneEuroFilter3D {
    constructor(freq, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.xFilter = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
        this.yFilter = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
        this.zFilter = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
    }

    filter(x, y, z, timestamp = null) {
        return {
            x: this.xFilter.filter(x, timestamp),
            y: this.yFilter.filter(y, timestamp),
            z: this.zFilter.filter(z, timestamp)
        };
    }

    reset() {
        this.xFilter.reset();
        this.yFilter.reset();
        this.zFilter.reset();
    }
}

// ==================== TÍCH HỢP VỚI GAMES ====================

/**
 * Cấu hình đề xuất cho từng game
 */
const FILTER_PRESETS = {
    // Tower of Hanoi: Cần ổn định cao khi pinch
    hanoi: {
        freq: 30,
        minCutoff: 0.5,  // Mượt hơn để grab disk chính xác
        beta: 0.01,      // Phản hồi vừa phải
        dCutoff: 1.0
    },
    // Racing: Cần phản hồi nhanh cho steering
    racing: {
        freq: 30,
        minCutoff: 1.0,  // Ít lag hơn
        beta: 0.02,      // Phản hồi nhanh hơn khi lái
        dCutoff: 1.0
    }
};

// Export cho ES modules (nếu cần)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OneEuroFilter,
        OneEuroFilter2D,
        OneEuroFilter3D,
        LowPassFilter,
        FILTER_PRESETS
    };
}
