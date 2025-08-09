class DistortionEngine {
    constructor() {
        this.audioContext = null;
    }

    async addDistortion(file, settings, onProgress) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            onProgress(0);
            const audioBuffer = await this.fileToAudioBuffer(file);
            onProgress(20);

            const processedBuffer = await this.processAudioBuffer(audioBuffer, settings, onProgress);
            onProgress(100);
            return this.bufferToWav(processedBuffer);

        } catch (error) {
            throw new Error(`处理失败: ${error.message}`);
        }
    }

    async processAudioBuffer(buffer, settings, onProgress) {
        const processedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // 分步处理
        const totalSteps = 5;
        for (let step = 0; step < totalSteps; step++) {
            const start = Math.floor((step / totalSteps) * buffer.length);
            const end = Math.floor(((step + 1) / totalSteps) * buffer.length);

            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const inputData = buffer.getChannelData(channel);
                const outputData = processedBuffer.getChannelData(channel);

                for (let i = start; i < end; i++) {
                    let sample = inputData[i];
                    
                    // 主失真
                    sample = this.applyDistortion(sample, settings);
                    
                    // 额外效果
                    if (settings.noise) sample += (Math.random() - 0.5) * 0.1 * settings.intensity;
                    if (settings.crackle && Math.random() < 0.001 * settings.intensity) {
                        sample = (Math.random() - 0.5) * 2;
                    }
                    
                    outputData[i] = Math.max(-1, Math.min(1, sample));
                }
            }
            
            onProgress(20 + (step / totalSteps) * 80);
        }

        return processedBuffer;
    }

    applyDistortion(sample, settings) {
        const intensity = settings.intensity * 0.3;
        switch (settings.type) {
            case 'digital': return Math.tanh(sample * intensity);
            case 'analog': return Math.sin(sample * intensity * Math.PI * 0.5);
            case 'crushed': 
                const levels = Math.pow(2, Math.max(2, 16 - intensity));
                return Math.round(sample * levels) / levels;
            case 'radio': return Math.sin(sample * intensity * 2) * 0.7;
            case 'glitch': 
                return Math.random() < 0.02 * intensity ? (Math.random() - 0.5) * 2 : sample;
            default: return sample;
        }
    }

    async fileToAudioBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.audioContext.decodeAudioData(e.target.result)
                    .then(resolve)
                    .catch(() => reject(new Error('不支持的音频格式')));
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    bufferToWav(buffer) {
        const length = buffer.length * buffer.numberOfChannels * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, buffer.numberOfChannels, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
        view.setUint16(32, buffer.numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);

        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample * 0x7FFF, true);
                offset += 2;
            }
        }
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }
}

// 移动友好的UI控制器
class DistortionUI {
    constructor() {
        this.selectedFile = null;
        this.distortion = new DistortionEngine();
        this.settings = { type: 'digital', intensity: 5, noise: false, crackle: false };
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupProgressBar();
    }

    setupProgressBar() {
        const container = document.getElementById('progressContainer');
        container.innerHTML = `
            <div class="text-center mb-2">
                <div class="text-white text-sm mb-1" id="progressText">0%</div>
            </div>
            <div class="h-2 bg-white/20 rounded-full">
                <div id="progressFill" class="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all"></div>
            </div>
        `;
    }

    bindEvents() {
        // 音频上下文初始化
        const initAudio = () => {
            if (!this.distortion.audioContext) {
                this.distortion.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        };

        // 文件输入
        const audioInput = document.getElementById('audioInput');
        audioInput.addEventListener('change', (e) => {
            initAudio();
            this.handleFile(e.target.files[0]);
        });

        // 点击上传区域
        document.getElementById('uploadArea').addEventListener('click', () => {
            initAudio();
            audioInput.click();
        });

        // 拖拽支持
        document.getElementById('uploadArea').addEventListener('dragover', (e) => {
            e.preventDefault();
            e.currentTarget.classList.add('upload-hover');
        });
        document.getElementById('uploadArea').addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('upload-hover');
        });
        document.getElementById('uploadArea').addEventListener('drop', (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('upload-hover');
            initAudio();
            this.handleFile(e.dataTransfer.files[0]);
        });

        // 控制事件
        document.getElementById('distortionType').addEventListener('change', (e) => {
            this.settings.type = e.target.value;
        });
        document.getElementById('intensitySlider').addEventListener('input', (e) => {
            this.settings.intensity = parseInt(e.target.value);
            document.getElementById('intensityValue').textContent = e.target.value;
        });
        document.getElementById('noiseCheck').addEventListener('change', (e) => {
            this.settings.noise = e.target.checked;
        });
        document.getElementById('crackleCheck').addEventListener('change', (e) => {
            this.settings.crackle = e.target.checked;
        });

        // 处理按钮
        document.getElementById('processBtn').addEventListener('click', () => {
            initAudio();
            this.processAudio();
        });
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());
    }

    handleFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            alert('请上传音频文件（MP3/WAV/FLAC/M4A/OGG）');
            return;
        }

        this.selectedFile = file;
        this.elements.fileName.textContent = file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name;
        this.elements.fileSize.textContent = this.formatFileSize(file.size);
        
        // 获取时长
        const audio = new Audio(URL.createObjectURL(file));
        audio.addEventListener('loadedmetadata', () => {
            this.elements.duration.textContent = this.formatDuration(audio.duration);
            URL.revokeObjectURL(audio.src);
        });

        // 显示控制面板
        document.getElementById('audioInfo').classList.remove('hidden');
        document.getElementById('controls').classList.remove('hidden');
        document.getElementById('progressContainer').classList.add('hidden');
        document.getElementById('result').classList.add('hidden');
    }

    async processAudio() {
        if (!this.selectedFile) return;

        // 显示进度
        document.getElementById('controls').classList.add('hidden');
        document.getElementById('progressContainer').classList.remove('hidden');
        
        const btn = document.getElementById('processBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>损坏中...';
        btn.disabled = true;

        try {
            const result = await this.distortion.addDistortion(
                this.selectedFile,
                this.settings,
                (progress) => {
                    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
                    document.getElementById('progressFill').style.width = `${progress}%`;
                }
            );

            document.getElementById('newFileSize').textContent = this.formatFileSize(result.size);
            document.getElementById('result').classList.remove('hidden');
            document.getElementById('progressContainer').classList.add('hidden');
            
            this.distortedBlob = result;
            btn.innerHTML = '<i class="fas fa-bolt mr-1"></i>再次损坏';
            btn.disabled = false;

        } catch (error) {
            alert('处理失败: ' + error.message);
            document.getElementById('controls').classList.remove('hidden');
            document.getElementById('progressContainer').classList.add('hidden');
            btn.innerHTML = '<i class="fas fa-bolt mr-1"></i>重新损坏';
            btn.disabled = false;
        }
    }

    download() {
        if (this.distortedBlob) {
            const url = URL.createObjectURL(this.distortedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `damaged_${this.selectedFile.name.replace(/\.[^/.]+$/, "")}.wav`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
    new DistortionUI();
    
    // 修复iOS点击延迟
    if ('ontouchstart' in window) {
        document.body.addEventListener('touchstart', () => {}, {passive: true});
    }
});
