class DistortionEngine {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
    }

    async addDistortion(file, settings, onProgress) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // 开始进度
            onProgress(0);
            
            // 第1步：读取文件 (10%)
            const audioBuffer = await this.fileToAudioBuffer(file);
            onProgress(10);

            // 第2步：创建上下文 (20%)
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );
            onProgress(20);

            // 第3步：设置音频源 (30%)
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            onProgress(30);

            // 第4步：应用失真效果 (60%)
            const processedSignal = this.applyDistortionChain(
                source, 
                offlineContext, 
                settings,
                (stepProgress) => {
                    // 30% 到 60% 的进度
                    onProgress(30 + stepProgress * 0.3);
                }
            );
            onProgress(60);

            // 第5步：连接并渲染 (90%)
            processedSignal.connect(offlineContext.destination);
            source.start();
            
            const renderedBuffer = await offlineContext.startRendering();
            onProgress(90);

            // 第6步：导出文件 (100%)
            const result = this.bufferToWav(renderedBuffer);
            onProgress(100);

            return result;

        } catch (error) {
            console.error('失真处理失败:', error);
            throw new Error(`处理失败: ${error.message}`);
        }
    }

    applyDistortionChain(source, context, settings, onStepProgress) {
        let signal = source;
        
        // 模拟处理步骤
        const steps = 5;
        let currentStep = 0;

        // 1. 主失真 (20%)
        signal = this.createDistortion(signal, context, settings);
        onStepProgress(++currentStep / steps);

        // 2. 底噪 (40%)
        if (settings.noise) {
            signal = this.addNoise(signal, context, settings.intensity);
        }
        onStepProgress(++currentStep / steps);

        // 3. 爆裂音 (60%)
        if (settings.crackle) {
            signal = this.addCrackle(signal, context, settings.intensity);
        }
        onStepProgress(++currentStep / steps);

        // 4. 最终增益 (80%)
        const gainNode = context.createGain();
        gainNode.gain.setValueAtTime(0.9, context.currentTime);
        signal.connect(gainNode);
        signal = gainNode;
        onStepProgress(++currentStep / steps);

        return signal;
    }

    createDistortion(source, context, settings) {
        const shaper = context.createWaveShaper();
        const curve = new Float32Array(44100);
        const drive = settings.intensity * 0.8;

        switch (settings.type) {
            case 'digital':
                for (let i = 0; i < 44100; i++) {
                    const x = (i * 2) / 44100 - 1;
                    curve[i] = Math.tanh(x * drive);
                }
                break;
            case 'analog':
                for (let i = 0; i < 44100; i++) {
                    const x = (i * 2) / 44100 - 1;
                    curve[i] = ((3 + drive) * x * 20 * Math.PI / 180) / (Math.PI + drive * Math.abs(x));
                }
                break;
            case 'crushed':
                const levels = Math.pow(2, Math.max(2, 16 - drive));
                for (let i = 0; i < 44100; i++) {
                    const x = (i * 2) / 44100 - 1;
                    curve[i] = Math.round(x * levels) / levels;
                }
                break;
            case 'radio':
                const filter = context.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1000 + drive * 200, context.currentTime);
                filter.Q.setValueAtTime(drive * 3, context.currentTime);
                source.connect(filter);
                source = filter;
                
                for (let i = 0; i < 44100; i++) {
                    const x = (i * 2) / 44100 - 1;
                    curve[i] = Math.sin(x * Math.PI * 0.5 * drive);
                }
                break;
            case 'glitch':
                for (let i = 0; i < 44100; i++) {
                    const x = (i * 2) / 44100 - 1;
                    if (Math.random() < drive * 0.01) {
                        curve[i] = (Math.random() - 0.5) * 2;
                    } else {
                        curve[i] = x;
                    }
                }
                break;
        }
        
        shaper.curve = curve;
        source.connect(shaper);
        return shaper;
    }

    addNoise(source, context, intensity) {
        const bufferSize = 2048;
        const noiseNode = context.createScriptProcessor(bufferSize, 1, 1);
        
        noiseNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);
                
                for (let i = 0; i < inputBuffer.length; i++) {
                    const noise = (Math.random() - 0.5) * 2 * (intensity * 0.05);
                    outputData[i] = inputData[i] + noise;
                }
            }
        };
        
        source.connect(noiseNode);
        return noiseNode;
    }

    addCrackle(source, context, intensity) {
        const bufferSize = 2048;
        const crackleNode = context.createScriptProcessor(bufferSize, 1, 1);
        
        crackleNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);
                
                for (let i = 0; i < inputBuffer.length; i++) {
                    let sample = inputData[i];
                    if (Math.random() < intensity * 0.002) {
                        sample = (Math.random() - 0.5) * 2;
                    }
                    outputData[i] = sample;
                }
            }
        };
        
        source.connect(crackleNode);
        return crackleNode;
    }

    async fileToAudioBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.audioContext.decodeAudioData(e.target.result)
                    .then(resolve)
                    .catch(err => reject(new Error('音频格式不支持')));
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

// 用户界面（含进度条）
class DistortionUI {
    constructor() {
        this.selectedFile = null;
        this.distortion = new DistortionEngine();
        this.settings = {
            type: 'digital',
            intensity: 5,
            noise: false,
            crackle: false
        };
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            uploadArea: document.getElementById('uploadArea'),
            audioInput: document.getElementById('audioInput'),
            audioInfo: document.getElementById('audioInfo'),
            controls: document.getElementById('controls'),
            result: document.getElementById('result'),
            fileName: document.getElementById('fileName'),
            duration: document.getElementById('duration'),
            fileSize: document.getElementById('fileSize'),
            newFileSize: document.getElementById('newFileSize'),
            progressContainer: this.createProgressContainer(),
            distortionType: document.getElementById('distortionType'),
            intensitySlider: document.getElementById('intensitySlider'),
            noiseCheck: document.getElementById('noiseCheck'),
            crackleCheck: document.getElementById('crackleCheck')
        };
    }

    createProgressContainer() {
        // 动态创建进度条容器
        const container = document.createElement('div');
        container.id = 'progressContainer';
        container.className = 'hidden mt-6';
        container.innerHTML = `
            <div class="text-center mb-4">
                <h3 class="text-white font-semibold mb-2">正在损坏音频...</h3>
                <div class="text-white/60 text-sm" id="progressText">0%</div>
            </div>
            <div class="relative h-3 bg-white/20 rounded-full overflow-hidden">
                <div id="progressFill" class="h-full bg-gradient-to-r from-red-500 to-purple-500 rounded-full transition-all duration-300"></div>
            </div>
            <div class="text-center mt-2">
                <div id="progressStep" class="text-xs text-gray-400">准备中...</div>
            </div>
        `;
        document.querySelector('.glass-card').appendChild(container);
        return container;
    }

    bindEvents() {
        // 初始化AudioContext
        const initAudio = () => {
            if (!this.distortion.audioContext) {
                this.distortion.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        };

        this.elements.uploadArea.addEventListener('click', () => {
            initAudio();
            this.elements.audioInput.click();
        });

        this.elements.audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('border-cyan-500/50', 'bg-gray-800/50');
        });
        
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('border-cyan-500/50', 'bg-gray-800/50');
        });
        
        this.elements.uploadArea.addEventListener('drop', (e) => {
            initAudio();
            e.preventDefault();
            this.elements.uploadArea.classList.remove('border-cyan-500/50', 'bg-gray-800/50');
            this.handleFile(e.dataTransfer.files[0]);
        });

        // 设置更新
        this.elements.distortionType.addEventListener('change', (e) => {
            this.settings.type = e.target.value;
        });
        this.elements.intensitySlider.addEventListener('input', (e) => {
            this.settings.intensity = parseInt(e.target.value);
        });
        this.elements.noiseCheck.addEventListener('change', (e) => {
            this.settings.noise = e.target.checked;
        });
        this.elements.crackleCheck.addEventListener('change', (e) => {
            this.settings.crackle = e.target.checked;
        });

        document.getElementById('processBtn').addEventListener('click', () => {
            initAudio();
            this.processAudio();
        });
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());
    }

    handleFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            alert('请选择有效的音频文件！支持 MP3, WAV, FLAC, M4A, OGG');
            return;
        }

        this.selectedFile = file;
        this.elements.fileName.textContent = file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name;
        this.elements.fileSize.textContent = this.formatFileSize(file.size);
        
        const audio = new Audio(URL.createObjectURL(file));
        audio.addEventListener('loadedmetadata', () => {
            this.elements.duration.textContent = this.formatDuration(audio.duration);
            URL.revokeObjectURL(audio.src);
        });

        this.showElement(this.elements.audioInfo);
        this.showElement(this.elements.controls);
        this.hideElement(this.elements.result);
        this.hideElement(this.elements.progressContainer);
    }

    async processAudio() {
        if (!this.selectedFile || !this.distortion.audioContext) {
            alert('请先选择音频文件！');
            return;
        }

        // 显示进度条
        this.hideElement(this.elements.controls);
        this.showElement(this.elements.progressContainer);
        this.hideElement(this.elements.result);

        // 禁用按钮
        const processBtn = document.getElementById('processBtn');
        processBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>损坏中...';
        processBtn.disabled = true;

        // 更新进度步骤
        const steps = [
            '正在读取文件...',
            '正在创建音频上下文...',
            '正在应用主失真...',
            '正在添加底噪...',
            '正在添加爆裂音...',
            '正在最终调整...',
            '正在导出文件...'
        ];

        try {
            const distortedBlob = await this.distortion.addDistortion(
                this.selectedFile,
                this.settings,
                (progress) => {
                    const stepIndex = Math.floor((progress / 100) * steps.length);
                    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
                    document.getElementById('progressStep').textContent = steps[Math.min(stepIndex, steps.length - 1)];
                    document.getElementById('progressFill').style.width = `${progress}%`;
                }
            );

            this.distortedBlob = distortedBlob;
            this.elements.newFileSize.textContent = this.formatFileSize(distortedBlob.size);
            
            this.hideElement(this.elements.progressContainer);
            this.showElement(this.elements.result);

            // 恢复按钮
            processBtn.innerHTML = '<i class="fas fa-bolt mr-2"></i>再次损坏';
            processBtn.disabled = false;

        } catch (error) {
            console.error('处理失败:', error);
            alert('损坏失败: ' + error.message);
            
            this.hideElement(this.elements.progressContainer);
            this.showElement(this.elements.controls);
            
            processBtn.innerHTML = '<i class="fas fa-bolt mr-2"></i>重新损坏';
            processBtn.disabled = false;
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

    showElement(el) {
        el.classList.remove('hidden');
    }

    hideElement(el) {
        el.classList.add('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new DistortionUI();
});
