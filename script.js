const { createApp, ref, computed, onMounted, onUnmounted, watch } = Vue;

// 音频控制类
class AudioManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playTone(freq, type, duration, startTime = 0) {
        if (!this.ctx) this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(this.ctx.currentTime + startTime);
        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    playWorkStart() {
        this.playTone(440, 'sine', 0.1, 0);
        this.playTone(880, 'sine', 0.3, 0.1);
    }

    playBreakStart() {
        this.playTone(880, 'sine', 0.1, 0);
        this.playTone(440, 'sine', 0.3, 0.1);
    }

    playFinished() {
        const now = 0;
        this.playTone(523.25, 'triangle', 0.2, now);       // C5
        this.playTone(659.25, 'triangle', 0.2, now + 0.2); // E5
        this.playTone(783.99, 'triangle', 0.2, now + 0.4); // G5
        this.playTone(1046.50, 'triangle', 0.6, now + 0.6);// C6
    }
}

// 粒子特效类
class ParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        
        window.addEventListener('resize', () => this.resize());
        
        // 鼠标交互
        this.mouse = { x: null, y: null };
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.x;
            this.mouse.y = e.y;
        });
        window.addEventListener('mouseleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });

        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.initParticles();
    }

    initParticles() {
        this.particles = [];
        const numberOfParticles = (this.canvas.width * this.canvas.height) / 9000;
        for (let i = 0; i < numberOfParticles; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                dx: (Math.random() - 0.5) * 1,
                dy: (Math.random() - 0.5) * 1,
                size: Math.random() * 2 + 1
            });
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 更新和绘制粒子
        this.particles.forEach(p => {
            p.x += p.dx;
            p.y += p.dy;

            // 边界反弹
            if (p.x < 0 || p.x > this.canvas.width) p.dx = -p.dx;
            if (p.y < 0 || p.y > this.canvas.height) p.dy = -p.dy;

            // 绘制点
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.fill();

            // 连线
            // 与鼠标连线
            if (this.mouse.x != null) {
                const distMouse = Math.hypot(p.x - this.mouse.x, p.y - this.mouse.y);
                if (distMouse < 150) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = `rgba(255, 255, 255, ${1 - distMouse/150})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(this.mouse.x, this.mouse.y);
                    this.ctx.stroke();
                }
            }
        });
    }
}

createApp({
    setup() {
        // 状态定义
        const STATUS = {
            IDLE: 'IDLE',
            WORK: 'WORK',
            SHORT_BREAK: 'SHORT_BREAK',
            LONG_BREAK: 'LONG_BREAK'
        };

        const status = ref(STATUS.IDLE);
        const remainingTime = ref(0); // 秒
        const timerInterval = ref(null);
        const showSettings = ref(false);
        const audioManager = new AudioManager();

        // 默认设置
        const defaultSettings = {
            workDuration: 25, // 分钟
            randomBreakMin: 3, // 分钟
            randomBreakMax: 5, // 分钟
            randomBreakDuration: 30, // 秒
            longBreakDuration: 5 // 分钟
        };

        // 从 LocalStorage 加载设置
        const loadSettings = () => {
            try {
                const saved = localStorage.getItem('pomodoro-settings');
                if (saved) {
                    return { ...defaultSettings, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.error('Failed to load settings', e);
            }
            return { ...defaultSettings };
        };

        // 设置
        const settings = ref(loadSettings());

        // 运行时状态追踪
        const workTimeElapsed = ref(0); // 当前专注阶段已进行的秒数
        const nextRandomBreakAt = ref(0); // 下一次随机休息的时间点（秒）

        const statusText = computed(() => {
            switch (status.value) {
                case STATUS.IDLE: return '准备专注';
                case STATUS.WORK: return '专注中...';
                case STATUS.SHORT_BREAK: return '随机休息一下';
                case STATUS.LONG_BREAK: return '番茄钟结束，休息时间';
                default: return '';
            }
        });

        const formattedTime = computed(() => {
            const m = Math.floor(remainingTime.value / 60).toString().padStart(2, '0');
            const s = (remainingTime.value % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        });

        const isRunning = computed(() => status.value !== STATUS.IDLE);

        // 计算下一次随机休息的时间点
        const calculateNextRandomBreak = () => {
            const min = settings.value.randomBreakMin * 60;
            const max = settings.value.randomBreakMax * 60;
            // 随机生成 min 到 max 之间的秒数
            const nextInterval = Math.floor(Math.random() * (max - min + 1)) + min;
            // 下一次休息点 = 当前已工作时间 + 随机间隔
            // 注意：如果剩余工作时间小于随机间隔，则不再休息
            return workTimeElapsed.value + nextInterval;
        };

        const startTimer = () => {
            // 初始化音频上下文（必须在用户交互后）
            audioManager.init();
            
            // 应用设置
            const totalWorkSeconds = settings.value.workDuration * 60;
            remainingTime.value = totalWorkSeconds;
            workTimeElapsed.value = 0;
            
            status.value = STATUS.WORK;
            nextRandomBreakAt.value = calculateNextRandomBreak();
            
            audioManager.playWorkStart();
            
            clearInterval(timerInterval.value);
            timerInterval.value = setInterval(tick, 1000);
        };

        const stopTimer = () => {
            clearInterval(timerInterval.value);
            status.value = STATUS.IDLE;
            remainingTime.value = 0;
        };

        const tick = () => {
            if (remainingTime.value <= 0) {
                handleTimerComplete();
                return;
            }

            remainingTime.value--;

            if (status.value === STATUS.WORK) {
                workTimeElapsed.value++;

                // 检查是否触发随机休息
                // 条件：达到了预设的随机休息点，且剩余专注时间大于随机休息时长（避免在最后几秒插入休息）
                if (workTimeElapsed.value >= nextRandomBreakAt.value && 
                    remainingTime.value > settings.value.randomBreakDuration) {
                    enterShortBreak();
                }
            }
        };

        const enterShortBreak = () => {
            clearInterval(timerInterval.value);
            // 保存当前的专注剩余时间（因为进入休息要显示休息倒计时）
            const currentWorkRemaining = remainingTime.value;
            
            status.value = STATUS.SHORT_BREAK;
            remainingTime.value = settings.value.randomBreakDuration;
            audioManager.playBreakStart();

            timerInterval.value = setInterval(() => {
                if (remainingTime.value <= 0) {
                    // 休息结束，回到专注
                    clearInterval(timerInterval.value);
                    status.value = STATUS.WORK;
                    remainingTime.value = currentWorkRemaining; // 恢复专注倒计时
                    
                    // 重新计算下一次休息
                    nextRandomBreakAt.value = calculateNextRandomBreak();
                    audioManager.playWorkStart();
                    
                    timerInterval.value = setInterval(tick, 1000);
                } else {
                    remainingTime.value--;
                }
            }, 1000);
        };

        const handleTimerComplete = () => {
            clearInterval(timerInterval.value);
            
            if (status.value === STATUS.WORK) {
                // 专注结束，进入长休息
                status.value = STATUS.LONG_BREAK;
                remainingTime.value = settings.value.longBreakDuration * 60;
                audioManager.playFinished();
                
                timerInterval.value = setInterval(() => {
                    if (remainingTime.value <= 0) {
                        stopTimer();
                    } else {
                        remainingTime.value--;
                    }
                }, 1000);
            } else {
                stopTimer();
            }
        };

        const saveSettings = () => {
            // 保存到 LocalStorage
            try {
                localStorage.setItem('pomodoro-settings', JSON.stringify(settings.value));
            } catch (e) {
                console.error('Failed to save settings', e);
            }

            showSettings.value = false;
            // 如果正在运行，停止并重置，因为参数变了
            if (isRunning.value) {
                stopTimer();
            }
        };

        onMounted(() => {
            new ParticleSystem('particles-canvas');
        });

        onUnmounted(() => {
            clearInterval(timerInterval.value);
        });

        return {
            status,
            statusText,
            formattedTime,
            isRunning,
            settings,
            showSettings,
            startTimer,
            stopTimer,
            saveSettings
        };
    }
}).mount('#app');
