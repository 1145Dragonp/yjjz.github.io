class AudioCompressor {
    constructor() {
        // 延迟创建audioContext直到用户交互
        this.audioContext = null;
    }

    async compressAudio(file, qualityLevel, onProgress) {
        try {
            // 确保在用户交互后创建audioContext
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const audioBuffer = await this.fileToAudioBuffer(file);
            const settings = this.getQualitySettings(qualityLevel);

            // 创建离线音频上下文 - 使用合理的采样率
            const sampleRate = Math.max(8000, Math.min(44100, audioBuffer.sampleRate));
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                sampleRate
            );

            // 音频处理链
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;

            // 动态压缩器
            const compressor = offlineContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-20, offlineContext.currentTime);
            compressor.ratio.setValueAtTime(settings.compressionRatio, offlineContext.currentTime);
            compressor.attack.setValueAtTime(0.003, offlineContext.currentTime);
            compressor.release.setValueAtTime(0.1, offlineContext.currentTime);

            // 添加增益控制防止削波
            const gainNode = offlineContext.createGain();
            gainNode.gain.setValueAtTime(0.8, offlineContext.currentTime);

            // 失真效果（4-5级）
            let lastNode = compressor;
            if (settings.distortion > 0) {
                const waveShaper = offlineContext.createWaveShaper();
                waveShaper.curve = this.makeDistortionCurve(settings.distortion);
                compressor.connect(waveShaper);
                lastNode = waveShaper;
            }

            // 连接链路
            source.connect(gainNode);
            gainNode.connect(compressor);
            lastNode.connect(offlineContext.destination);
            source.start();

            // 进度动画
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress = Math.min(progress + 2, 95);
                onProgress(progress);
            }, 50);

            const renderedBuffer = await offlineContext.startRendering();
            clearInterval(progressInterval);
            onProgress(100);

            // 3比特量化
            return this.create3BitAudio(renderedBuffer);

        } catch (error) {
            console.error('压缩错误:', error);
            throw new Error(`处理失败: ${error.message}`);
        }
    }

    getQualitySettings(level) {
        return {
            1: { compressionRatio: 2, distortion: 0 },
            2: { compressionRatio: 3, distortion: 0 },
            3: { compressionRatio: 4, distortion: 0 },
            4: { compressionRatio: 4, distortion: 20 },
            5: { compressionRatio: 4, distortion: 40 }
        }[level];
    }

    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = Math.tanh(x * amount / 20);
        }
        return curve;
    }

    async fileToAudioBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // 使用try-catch处理解码错误
                this.audioContext.decodeAudioData(e.target.result)
                    .then(resolve)
                    .catch(err => reject(new Error('音频解码失败: ' + err.message)));
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    create3BitAudio(buffer) {
        // 3比特量化（8个电平）
        const levels = [-1, -0.714, -0.428, -0.142, 0.142, 0.428, 0.714, 1];
        
        const compressedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // 量化到8个电平
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const targetData = compressedBuffer.getChannelData(channel);
            
            for (let i = 0; i < buffer.length; i++) {
                const sample = sourceData[i];
                // 映射到8个电平
                const levelIndex = Math.round(((sample + 1) / 2) * 7);
                const clampedIndex = Math.max(0, Math.min(7, levelIndex));
                targetData[i] = levels[clampedIndex];
            }
        }

        return this.bufferToWav(compressedBuffer);
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

// 修复后的UI控制
class AudioUI {
    constructor() {
        this.selectedFile = null;
        this.currentQuality = 3;
        this.compressor = new AudioCompressor();
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            uploadArea: document.getElementById('uploadArea'),
            audioInput: document.getElementById('audioInput'),
            audioInfo: document.getElementById('audioInfo'),
            controls: document.getElementById('controls'),
            progressContainer: document.getElementById('progressContainer'),
            result: document.getElementById('result'),
            settingsModal: document.getElementById('settingsModal'),
            fileName: document.getElementById('fileName'),
            duration: document.getElementById('duration'),
            fileSize: document.getElementById('fileSize'),
            newFileSize: document.getElementById('newFileSize'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            qualitySlider: document.getElementById('qualitySlider'),
            qualityDescription: document.getElementById('qualityDescription')
        };
    }

    bindEvents() {
        // 用户交互后创建AudioContext
        const initAudio = () => {
            if (!this.compressor.audioContext) {
                this.compressor.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        };

        this.elements.uploadArea.addEventListener('click', () => {
            initAudio();
            this.elements.audioInput.click();
        });

        this.elements.audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        
        this.elements.uploadArea.addEventListener('drop', (e) => {
            initAudio();
            e.preventDefault();
            this.handleFile(e.dataTransfer.files[0]);
        });

        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal());
        document.getElementById('closeModal').addEventListener('click', () => this.hideModal());
        document.getElementById('applySettings').addEventListener('click', () => this.applySettings());
        this.elements.qualitySlider.addEventListener('input', () => this.updateQualityDescription());
        document.getElementById('compressBtn').addEventListener('click', () => {
            initAudio();
            this.compress();
        });
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());

        this.updateQualityDescription();
    }

    handleFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            alert('请选择有效的音频文件！');
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
    }

    showModal() {
        this.elements.settingsModal.classList.remove('hidden');
        this.elements.settingsModal.classList.add('flex');
    }

    hideModal() {
        this.elements.settingsModal.classList.add('hidden');
        this.elements.settingsModal.classList.remove('flex');
    }

    applySettings() {
        this.currentQuality = parseInt(this.elements.qualitySlider.value);
        this.hideModal();
    }

    updateQualityDescription() {
        const level = this.elements.qualitySlider.value;
        const descriptions = {
            1: '1级：3比特8电平，轻度量化噪声',
            2: '2级：3比特8电平，中度量化噪声',
            3: '3级：3比特8电平，重度量化噪声',
            4: '3比特+轻度失真，Lo-Fi效果',
            5: '3比特+强失真，复古效果'
        };
        this.elements.qualityDescription.textContent = descriptions[level];
    }

    async compress() {
        if (!this.selectedFile || !this.compressor.audioContext) {
            alert('请先选择音频文件！');
            return;
        }

        this.hideElement(this.elements.controls);
        this.showElement(this.elements.progressContainer);
        this.hideElement(this.elements.result);

        try {
            const compressedBlob = await this.compressor.compressAudio(
                this.selectedFile,
                this.currentQuality,
                null,
                (progress) => {
                    this.elements.progressFill.style.width = `${progress}%`;
                    this.elements.progressText.textContent = `${progress}%`;
                }
            );

            this.compressedBlob = compressedBlob;
            this.elements.newFileSize.textContent = this.formatFileSize(compressedBlob.size);
            
            this.hideElement(this.elements.progressContainer);
            this.showElement(this.elements.result);

        } catch (error) {
            console.error('压缩失败:', error);
            alert('处理失败: ' + error.message + '\n请尝试重新上传文件');
            this.showElement(this.elements.controls);
            this.hideElement(this.elements.progressContainer);
        }
    }

    download() {
        if (this.compressedBlob) {
            const url = URL.createObjectURL(this.compressedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `3bit_${this.selectedFile.name.replace(/\.[^/.]+$/, "")}.wav`;
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

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new AudioUI();
});
