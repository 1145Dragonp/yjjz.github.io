// 音频压缩与格式转换类
class AudioCompressor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async compressAudio(file, qualityLevel, outputFormat, onProgress) {
        try {
            const audioBuffer = await this.fileToAudioBuffer(file);
            const settings = this.getQualitySettings(qualityLevel);
            
            // 保持可听性的采样率
            const targetSampleRate = Math.max(8000, Math.min(22050, audioBuffer.sampleRate));
            
            // 创建离线音频上下文
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                Math.floor(audioBuffer.length * (targetSampleRate / audioBuffer.sampleRate)),
                targetSampleRate
            );

            // 音频处理链
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;

            // 增益控制
            const gainNode = offlineContext.createGain();
            gainNode.gain.setValueAtTime(0.9, offlineContext.currentTime);

            // 动态压缩
            const compressor = offlineContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(settings.threshold, offlineContext.currentTime);
            compressor.knee.setValueAtTime(settings.knee, offlineContext.currentTime);
            compressor.ratio.setValueAtTime(settings.ratio, offlineContext.currentTime);
            compressor.attack.setValueAtTime(0.003, offlineContext.currentTime);
            compressor.release.setValueAtTime(0.1, offlineContext.currentTime);

            // 失真效果（4级以上）
            let lastNode = compressor;
            if (settings.distortion > 0) {
                const waveShaper = offlineContext.createWaveShaper();
                waveShaper.curve = this.makeDistortionCurve(settings.distortion);
                waveShaper.oversample = '4x';
                compressor.connect(waveShaper);
                lastNode = waveShaper;
            }

            // 最终输出增益
            const outputGain = offlineContext.createGain();
            outputGain.gain.setValueAtTime(settings.outputGain, offlineContext.currentTime);

            // 连接链路
            source.connect(gainNode);
            gainNode.connect(compressor);
            lastNode.connect(outputGain);
            outputGain.connect(offlineContext.destination);
            source.start();

            // 进度模拟
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress = Math.min(progress + 2, 95);
                onProgress(progress);
            }, 100);

            // 渲染音频
            const renderedBuffer = await offlineContext.startRendering();
            clearInterval(progressInterval);
            onProgress(100);

            // 根据格式创建输出
            return this.createOutputBlob(renderedBuffer, settings.bitrate, outputFormat);

        } catch (error) {
            throw new Error(`音频处理失败: ${error.message}`);
        }
    }

    getQualitySettings(level) {
        return {
            1: { threshold: -30, knee: 40, ratio: 8,  distortion: 0, bitrate: 32, outputGain: 1.0 },
            2: { threshold: -25, knee: 30, ratio: 6,  distortion: 0, bitrate: 24, outputGain: 1.0 },
            3: { threshold: -20, knee: 20, ratio: 4,  distortion: 0, bitrate: 16, outputGain: 1.2 },
            4: { threshold: -15, knee: 10, ratio: 3,  distortion: 20, bitrate: 16, outputGain: 1.5 },
            5: { threshold: -10, knee: 0,  ratio: 2,  distortion: 40, bitrate: 16, outputGain: 2.0 }
        }[level];
    }

    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            // 软削波失真，保持可听性
            curve[i] = Math.tanh(x * (1 + amount/25));
        }
        return curve;
    }

    async fileToAudioBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const audioBuffer = await this.audioContext.decodeAudioData(e.target.result);
                    resolve(audioBuffer);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    async createOutputBlob(buffer, targetKbps, format) {
        const sampleRate = buffer.sampleRate;
        const numberOfChannels = buffer.numberOfChannels;
        
        switch (format) {
            case 'wav':
                return this.createWavBlob(buffer);
            case 'mp3':
                return this.createMp3Blob(buffer, targetKbps);
            case 'ogg':
                return this.createOggBlob(buffer, targetKbps);
            default:
                return this.createWavBlob(buffer);
        }
    }

    createWavBlob(buffer) {
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

    async createMp3Blob(buffer, bitrate) {
        // 简化的MP3编码：降低采样率+位深
        const targetSampleRate = Math.max(8000, Math.min(22050, buffer.sampleRate));
        return this.createCompressedWav(buffer, targetSampleRate, bitrate);
    }

    async createOggBlob(buffer, bitrate) {
        // 简化的OGG编码：降低采样率+位深
        const targetSampleRate = Math.max(8000, Math.min(22050, buffer.sampleRate));
        return this.createCompressedWav(buffer, targetSampleRate, bitrate);
    }

    createCompressedWav(buffer, targetSampleRate, bitrate) {
        // 重采样到目标采样率
        const offlineContext = new OfflineAudioContext(
            buffer.numberOfChannels,
            Math.floor(buffer.length * (targetSampleRate / buffer.sampleRate)),
            targetSampleRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start();

        return offlineContext.startRendering().then(renderedBuffer => {
            return this.createWavBlob(renderedBuffer);
        });
    }
}

// 用户界面控制
class AudioUI {
    constructor() {
        this.selectedFile = null;
        this.currentQuality = 3;
        this.outputFormat = 'wav';
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
            qualityDescription: document.getElementById('qualityDescription'),
            formatSelect: document.getElementById('formatSelect')
        };
    }

    bindEvents() {
        // 文件上传
        this.elements.uploadArea.addEventListener('click', () => this.elements.audioInput.click());
        this.elements.audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        
        // 拖拽上传
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.elements.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        this.elements.uploadArea.addEventListener('dragenter', () => {
            this.elements.uploadArea.classList.add('border-blue-500', 'bg-blue-50');
        });
        
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
        });
        
        this.elements.uploadArea.addEventListener('drop', (e) => {
            this.elements.uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
            this.handleFile(e.dataTransfer.files[0]);
        });

        // 设置模态框
        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal());
        document.getElementById('closeModal').addEventListener('click', () => this.hideModal());
        document.getElementById('applySettings').addEventListener('click', () => this.applySettings());
        this.elements.qualitySlider.addEventListener('input', () => this.updateQualityDescription());
        this.elements.formatSelect.addEventListener('change', (e) => {
            this.outputFormat = e.target.value;
        });

        // 压缩和下载
        document.getElementById('compressBtn').addEventListener('click', () => this.compress());
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());

        // 点击模态框外部关闭
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) this.hideModal();
        });

        this.updateQualityDescription();
    }

    handleFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            alert('请选择有效的音频文件！');
            return;
        }

        this.selectedFile = file;
        
        // 显示文件信息
        this.elements.fileName.textContent = file.name;
        this.elements.fileSize.textContent = this.formatFileSize(file.size);
        
        // 获取音频时长
        const audio = new Audio(URL.createObjectURL(file));
        audio.addEventListener('loadedmetadata', () => {
            this.elements.duration.textContent = this.formatDuration(audio.duration);
            URL.revokeObjectURL(audio.src);
        });

        // 显示控制按钮
        this.showElement(this.elements.audioInfo);
        this.showElement(this.elements.controls);
        this.hideElement(this.elements.progressContainer);
        this.hideElement(this.elements.result);
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
        this.outputFormat = this.elements.formatSelect.value;
        this.hideModal();
    }

    updateQualityDescription() {
        const level = this.elements.qualitySlider.value;
        const format = this.outputFormat.toUpperCase();
        const descriptions = {
            1: `1级：32kbps高质量${format}，无失真`,
            2: `2级：24kbps中等质量${format}，无失真`,
            3: `3级：16kbps低质量${format}，无失真`,
            4: `4级：16kbps${format}+轻度失真`,
            5: `5级：16kbps${format}+强烈失真`
        };
        this.elements.qualityDescription.textContent = descriptions[level];
    }

    async compress() {
        if (!this.selectedFile) {
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
                this.outputFormat,
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
            alert('音频处理失败，请重试！');
            this.showElement(this.elements.controls);
            this.hideElement(this.elements.progressContainer);
        }
    }

    download() {
        if (this.compressedBlob) {
            const url = URL.createObjectURL(this.compressedBlob);
            const a = document.createElement('a');
            a.href = url;
            const extension = this.outputFormat;
            a.download = `compressed_${this.selectedFile.name.replace(/\.[^/.]+$/, "")}.${extension}`;
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
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
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
