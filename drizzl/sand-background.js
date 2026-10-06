(() => {
    'use strict';

    // A small decorative sand field; the app screenshot remains the product preview.
    class SandField {
        constructor(columns, rows) {
            this.columns = columns;
            this.rows = rows;
            this.cells = new Uint8Array(columns * rows);
            this.count = 0;
            this.limit = Math.min(5200, Math.floor(columns * rows * .33));
            this.tick = 0;
        }

        add(x, y, color) {
            if (x < 0 || x >= this.columns || y < 0 || y >= this.rows || this.count >= this.limit) return false;
            const index = y * this.columns + x;
            if (this.cells[index]) return false;
            this.cells[index] = color;
            this.count += 1;
            return true;
        }

        seed() {
            const height = Math.min(24, Math.round(this.rows * .17));
            for (let x = 0; x < this.columns; x += 1) {
                const pile = Math.max(3, height - Math.abs(x - this.columns * .12) * .45,
                    height * .8 - Math.abs(x - this.columns * .88) * .4);
                for (let depth = 0; depth < pile; depth += 1) {
                    this.add(x, this.rows - 1 - depth, 1 + (Math.floor(depth / 3) + Math.floor(x / 17)) % 3);
                }
            }
        }

        step() {
            let drained = 0;
            let moved = 0;
            const bottom = (this.rows - 1) * this.columns;
            // Narrow outlets keep the settled piles flowing without growing over the copy.
            for (const ratio of [.04, .96]) {
                const x = Math.round((this.columns - 1) * ratio);
                if (this.cells[bottom + x]) {
                    this.cells[bottom + x] = 0;
                    this.count -= 1;
                    drained += 1;
                }
            }
            this.tick += 1;
            for (let y = this.rows - 2; y >= 0; y -= 1) {
                const reverse = (y + this.tick) % 2;
                for (let column = 0; column < this.columns; column += 1) {
                    const x = reverse ? this.columns - 1 - column : column;
                    const index = y * this.columns + x;
                    const color = this.cells[index];
                    if (!color) continue;
                    const below = index + this.columns;
                    let target = -1;
                    if (!this.cells[below]) target = below;
                    else {
                        const direction = (x + y + this.tick) % 2 ? 1 : -1;
                        for (const offset of [direction, -direction]) {
                            if (x + offset >= 0 && x + offset < this.columns && !this.cells[below + offset]) {
                                target = below + offset;
                                break;
                            }
                        }
                    }
                    if (target >= 0) {
                        this.cells[target] = color;
                        this.cells[index] = 0;
                        moved += 1;
                    }
                }
            }
            return { moved, drained };
        }
    }

    const hero = document.querySelector('.hero');
    const canvas = document.querySelector('.sand-background');
    const toggle = document.querySelector('.background-toggle');
    if (!hero || !canvas || !toggle) return;
    const context = canvas.getContext('2d', { alpha: true });
    const buffer = document.createElement('canvas');
    const bufferContext = buffer.getContext('2d', { alpha: true });
    if (!context || !bufferContext) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colors = [[0, 0, 0], [83, 232, 227], [241, 158, 220], [241, 191, 104]];
    const frameInterval = 1000 / 24;
    let field;
    let pixels;
    let pausedByUser = false;
    let reducedMotionOverride = false;
    let inView = false;
    let frame = null;
    let lastStep = 0;
    let lastPointer = 0;
    let elapsed = 0;
    let resizeTimer;
    let width = 0;
    let height = 0;

    const isPaused = () => pausedByUser || (reducedMotion.matches && !reducedMotionOverride);
    const canRun = () => field && !isPaused() && !document.hidden && inView;

    function render() {
        const data = pixels.data;
        data.fill(0);
        for (let y = 0; y < field.rows; y += 1) {
            for (let x = 0; x < field.columns; x += 1) {
                const color = field.cells[y * field.columns + x];
                if (!color) continue;
                const position = x / (field.columns - 1);
                const edge = Math.pow(Math.abs(position - .5) * 2, 1.5);
                const alpha = Math.round(255 * (.12 + edge * .32));
                const jitter = (x * 23 + y * 11) % 2;
                const first = ((y * 2) * buffer.width + x * 2 + jitter) * 4;
                const second = ((y * 2 + 1) * buffer.width + x * 2 + 1 - jitter) * 4;
                for (const index of [first, second]) {
                    data[index] = colors[color][0];
                    data[index + 1] = colors[color][1];
                    data[index + 2] = colors[color][2];
                    data[index + 3] = index === first ? alpha : Math.round(alpha * .6);
                }
            }
        }
        bufferContext.putImageData(pixels, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    }

    function pour() {
        const sources = [.05, .94];
        for (let i = 0; i < sources.length; i += 1) {
            const drift = Math.sin(elapsed * .012 + i * 2) * .025;
            const x = Math.round((sources[i] + drift) * (field.columns - 1));
            field.add(x, 0, 1 + (Math.floor(elapsed / 100) + i) % 3);
        }
    }

    function animate(now) {
        frame = null;
        if (!canRun()) return;
        if (now - lastStep >= frameInterval) {
            lastStep = now - (now - lastStep) % frameInterval;
            elapsed += 1;
            pour();
            field.step();
            render();
        }
        frame = window.requestAnimationFrame(animate);
    }

    function syncActivity() {
        toggle.textContent = isPaused() ? 'Play background' : 'Pause background';
        toggle.setAttribute('aria-label', isPaused() ? 'Play the sand background animation' : 'Pause the sand background animation');
        if (!canRun() && frame !== null) {
            window.cancelAnimationFrame(frame);
            frame = null;
        } else if (canRun() && frame === null) {
            lastStep = performance.now();
            frame = window.requestAnimationFrame(animate);
        }
    }

    function resize() {
        const bounds = hero.getBoundingClientRect();
        const nextWidth = Math.round(bounds.width);
        const nextHeight = Math.round(bounds.height);
        if (!nextWidth || !nextHeight || (width === nextWidth && height === nextHeight)) return;
        width = nextWidth;
        height = nextHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const columns = Math.max(40, Math.min(180, Math.round(width / 6)));
        const rows = Math.max(40, Math.min(220, Math.round(height / (width / columns))));
        field = new SandField(columns, rows);
        field.seed();
        buffer.width = columns * 2;
        buffer.height = rows * 2;
        pixels = bufferContext.createImageData(buffer.width, buffer.height);
        render();
        toggle.hidden = false;
        syncActivity();
    }

    toggle.addEventListener('click', () => {
        if (isPaused()) {
            pausedByUser = false;
            reducedMotionOverride = reducedMotion.matches;
        } else pausedByUser = true;
        syncActivity();
    });
    hero.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse' || !canRun() || performance.now() - lastPointer < 100 ||
            event.target.closest('a, button')) return;
        lastPointer = performance.now();
        const bounds = hero.getBoundingClientRect();
        const x = Math.floor((event.clientX - bounds.left) / bounds.width * field.columns);
        const y = Math.floor((event.clientY - bounds.top) / bounds.height * field.rows);
        const color = 1 + Math.floor(elapsed / 100) % 3;
        field.add(x, y, color);
        field.add(x + 1, y, color);
    }, { passive: true });
    document.addEventListener('visibilitychange', syncActivity);
    reducedMotion.addEventListener('change', () => {
        reducedMotionOverride = false;
        syncActivity();
    });
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            inView = entries[0].isIntersecting;
            syncActivity();
        }, { threshold: .05 }).observe(hero);
    } else {
        const updateVisibility = () => {
            const bounds = hero.getBoundingClientRect();
            inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
            syncActivity();
        };
        window.addEventListener('scroll', updateVisibility, { passive: true });
        updateVisibility();
    }
    const scheduleResize = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, 120);
    };
    if ('ResizeObserver' in window) new ResizeObserver(scheduleResize).observe(hero);
    window.addEventListener('resize', scheduleResize, { passive: true });
    resize();
})();
