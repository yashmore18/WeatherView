/**
 * WeatherView 2.0 - Dynamic Weather Illustration System
 * Renders an animated full-viewport background (sky gradient + particles)
 * driven by the current weather condition and local day/night state.
 */

class WeatherScene {
    static ICON_SCENE_MAP = {
        '01': 'clear',
        '02': 'partly-cloudy',
        '03': 'cloudy',
        '04': 'cloudy',
        '09': 'rain',
        '10': 'rain',
        '11': 'thunderstorm',
        '13': 'snow',
        '50': 'mist'
    };

    static PARTICLE_BUDGET = {
        'clear': 0,
        'partly-cloudy': 5,
        'cloudy': 6,
        'rain': 220,
        'thunderstorm': 220,
        'snow': 140,
        'mist': 0
    };

    static mapIconToScene(iconCode) {
        if (!iconCode || iconCode.length < 3) {
            return { condition: 'clear', isNight: WeatherScene._isLocalNightNow() };
        }
        const prefix = iconCode.slice(0, 2);
        const suffix = iconCode.slice(-1);
        const condition = WeatherScene.ICON_SCENE_MAP[prefix] || 'clear';
        const isNight = suffix === 'n';
        return { condition, isNight };
    }

    static _isLocalNightNow() {
        const hour = new Date().getHours();
        return hour < 6 || hour >= 19;
    }

    constructor(rootEl) {
        this.root = rootEl;
        if (!this.root) return;

        this.gradientEl = this.root.querySelector('.wv-scene__gradient');
        this.canvas = this.root.querySelector('.wv-scene__canvas');
        this.flashEl = this.root.querySelector('.wv-scene__flash');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

        this.condition = 'clear';
        this.isNight = WeatherScene._isLocalNightNow();
        this.particles = [];
        this.stars = [];
        this.clouds = [];
        this.rafId = null;
        this.lightningTimeout = null;
        this.width = 0;
        this.height = 0;
        this.dpr = 1;

        this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.reducedMotion = this.reducedMotionQuery.matches;
        this.reducedMotionQuery.addEventListener('change', (e) => {
            this.reducedMotion = e.matches;
            if (this.reducedMotion) {
                this.pause();
                this._clearLightning();
                this._drawStatic();
            } else {
                this._buildParticles(this.condition);
                this.start();
                if (this.condition === 'thunderstorm') this._scheduleLightning();
            }
        });

        this._resizeHandle = null;
        window.addEventListener('resize', () => {
            clearTimeout(this._resizeHandle);
            this._resizeHandle = setTimeout(() => this._resize(), 150);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });

        this._resize();
        this.setCondition(this.condition, this.isNight);
    }

    applyWeatherIcon(iconCode) {
        const { condition, isNight } = WeatherScene.mapIconToScene(iconCode);
        this.setCondition(condition, isNight);
    }

    setCondition(condition, isNight) {
        if (!this.root) return;
        this.condition = condition;
        this.isNight = isNight;

        this.root.dataset.condition = condition;
        this.root.dataset.night = isNight ? 'true' : 'false';

        this._clearLightning();
        this._buildParticles(condition);

        if (this.reducedMotion) {
            this._drawStatic();
        } else {
            this.start();
            if (condition === 'thunderstorm') {
                this._scheduleLightning();
            }
        }
    }

    start() {
        if (this.reducedMotion || this.rafId || !this.ctx) return;
        const loop = (ts) => {
            this._drawFrame(ts);
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    pause() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    resume() {
        if (!this.reducedMotion) {
            this.start();
        }
    }

    destroy() {
        this.pause();
        this._clearLightning();
    }

    _resize() {
        if (!this.canvas) return;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        if (this.ctx) {
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(this.dpr, this.dpr);
        }
        this._buildParticles(this.condition);
        if (this.reducedMotion) this._drawStatic();
    }

    _buildParticles(condition) {
        const budget = WeatherScene.PARTICLE_BUDGET[condition] || 0;
        this.particles = [];
        this.clouds = [];
        this.stars = [];

        if (condition === 'clear' && this.isNight) {
            const starCount = 90;
            for (let i = 0; i < starCount; i++) {
                this.stars.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height * 0.7,
                    r: Math.random() * 1.4 + 0.3,
                    twinkle: Math.random() * Math.PI * 2
                });
            }
            return;
        }

        if (condition === 'partly-cloudy' || condition === 'cloudy') {
            const cloudCount = budget;
            for (let i = 0; i < cloudCount; i++) {
                this.clouds.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height * 0.5,
                    scale: 0.6 + Math.random() * 1.2,
                    speed: 6 + Math.random() * 10,
                    opacity: 0.15 + Math.random() * 0.15
                });
            }
            return;
        }

        if (condition === 'rain' || condition === 'thunderstorm') {
            for (let i = 0; i < budget; i++) {
                this.particles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    len: 10 + Math.random() * 14,
                    speed: 500 + Math.random() * 400,
                    drift: condition === 'thunderstorm' ? 60 : 40
                });
            }
            return;
        }

        if (condition === 'snow') {
            for (let i = 0; i < budget; i++) {
                this.particles.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    r: 1.5 + Math.random() * 2.5,
                    speed: 20 + Math.random() * 40,
                    drift: Math.random() * 30 - 15,
                    phase: Math.random() * Math.PI * 2
                });
            }
            return;
        }
        // mist: no discrete particles, handled entirely via CSS drifting bands
    }

    _drawFrame(ts) {
        if (!this.ctx) return;
        const dt = this._lastTs ? Math.min((ts - this._lastTs) / 1000, 0.1) : 0.016;
        this._lastTs = ts;

        this.ctx.clearRect(0, 0, this.width, this.height);

        if (this.condition === 'clear' && this.isNight) {
            this.stars.forEach(star => {
                star.twinkle += dt * 1.5;
                const alpha = 0.5 + Math.sin(star.twinkle) * 0.4;
                this.ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
                this.ctx.beginPath();
                this.ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
                this.ctx.fill();
            });
        } else if (this.condition === 'partly-cloudy' || this.condition === 'cloudy') {
            this.clouds.forEach(cloud => {
                cloud.x += cloud.speed * dt;
                if (cloud.x - 120 * cloud.scale > this.width) cloud.x = -120 * cloud.scale;
                this._drawCloud(cloud.x, cloud.y, cloud.scale, cloud.opacity);
            });
        } else if (this.condition === 'rain' || this.condition === 'thunderstorm') {
            this.ctx.strokeStyle = 'rgba(220, 230, 245, 0.35)';
            this.ctx.lineWidth = 1;
            this.particles.forEach(drop => {
                drop.y += drop.speed * dt;
                drop.x += (drop.drift * dt);
                if (drop.y > this.height) {
                    drop.y = -drop.len;
                    drop.x = Math.random() * this.width;
                }
                this.ctx.beginPath();
                this.ctx.moveTo(drop.x, drop.y);
                this.ctx.lineTo(drop.x - drop.len * 0.15, drop.y + drop.len);
                this.ctx.stroke();
            });
        } else if (this.condition === 'snow') {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.particles.forEach(flake => {
                flake.phase += dt;
                flake.y += flake.speed * dt;
                flake.x += Math.sin(flake.phase) * 0.6 + flake.drift * dt;
                if (flake.y > this.height) {
                    flake.y = -flake.r * 2;
                    flake.x = Math.random() * this.width;
                }
                this.ctx.beginPath();
                this.ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }
    }

    _drawCloud(x, y, scale, opacity) {
        this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, 60 * scale, 22 * scale, 0, 0, Math.PI * 2);
        this.ctx.ellipse(x + 35 * scale, y + 6 * scale, 40 * scale, 18 * scale, 0, 0, Math.PI * 2);
        this.ctx.ellipse(x - 35 * scale, y + 8 * scale, 36 * scale, 16 * scale, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    _drawStatic() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
        if (this.condition === 'clear' && this.isNight) {
            this.stars.forEach(star => {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                this.ctx.beginPath();
                this.ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
                this.ctx.fill();
            });
        } else if (this.condition === 'partly-cloudy' || this.condition === 'cloudy') {
            this.clouds.forEach(cloud => this._drawCloud(cloud.x, cloud.y, cloud.scale, cloud.opacity));
        } else if (this.condition === 'snow') {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.particles.forEach(flake => {
                this.ctx.beginPath();
                this.ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }
        // Rain/thunderstorm render nothing in the static (reduced-motion) frame beyond the
        // gradient itself - streak lines only read as motion, so a frozen frame of them
        // looks like visual noise rather than rain.
    }

    _scheduleLightning() {
        if (this.reducedMotion || this.condition !== 'thunderstorm') return;
        const delay = 4000 + Math.random() * 5000;
        this.lightningTimeout = setTimeout(() => {
            if (this.condition !== 'thunderstorm' || this.reducedMotion) return;
            if (this.flashEl) this.flashEl.classList.add('is-active');
            setTimeout(() => {
                if (this.flashEl) this.flashEl.classList.remove('is-active');
            }, 90);
            this._scheduleLightning();
        }, delay);
    }

    _clearLightning() {
        if (this.lightningTimeout) {
            clearTimeout(this.lightningTimeout);
            this.lightningTimeout = null;
        }
        if (this.flashEl) this.flashEl.classList.remove('is-active');
    }
}
