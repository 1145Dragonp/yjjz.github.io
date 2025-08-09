// 音频压缩类
class AudioCompressor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async compressAudio(file, qualityLevel, onProgress) {
        try {
            const audioBuffer = await this.fileToAudioBuffer(file);
            
            // 根据等级设置参数
            const settings = this.getQualitySettings(qualityLevel);
            
            // 创建离线音频上下文
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );

            // 创建处理链
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;

            // 压缩器
            const compressor = offlineContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(settings.threshold, offlineContext.currentTime);
            compressor.knee.setValueAtTime(settings.knee, offlineContext.currentTime);
            compressor.ratio.setValueAtTime(settings.ratio, offlineContext.currentTime);
            compressor.attack.setValueAtTime(0.003, offlineContext.currentTime);
            compressor.release.setValueAtTime(0.1, offlineContext.currentTime);

            // 失真器（4级以上）
            let lastNode = compressor;
            if (settings.distortion > 0) {
                const waveShaper = offlineContext.createWaveShaper();
                waveShaper.curve = this.makeDistortionCurve(settings.distortion);
                waveShaper.oversample = '4x';
                compressor.connect(waveShaper);
                lastNode = waveShaper;
            }

            lastNode.connect(offlineContext.destination);
            source.start();

            // 模拟进度
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress = Math.min(progress + 5, 95);
                onProgress(progress);
            }, 100);

            // 渲染音频
            const renderedBuffer = await offlineContext.startRendering();
            clearInterval(progressInterval);
            onProgress(100);

            // 转换为低质量WAV
            return this.createLowQualityWav(renderedBuffer, settings.bitrate);

        } catch (error) {
            throw new Error(`音频处理失败: ${error.message}`);
        }
    }

    getQualitySettings(level) {
        return {
            1: { threshold: -50, knee: 40, ratio: 12, distortion: 0, bitrate: 24000 },  // 3比特
            2: { threshold: -40, knee: 30, ratio: 10, distortion: 0, bitrate: 16000 },  // 2比特
            3: { threshold: -30, knee: 20, ratio: 8,  distortion: 0, bitrate: 8000 },   // 1比特
            4: { threshold: -20, knee: 10, ratio: 6,  distortion: 20, bitrate: 8000 },  // 1比特+轻度失真
            5: { threshold: -10, knee: 0,  ratio: 4,  distortion: 50, bitrate: 8000 }   // 1比特+强烈失真
        }[level];
    }

    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
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

    createLowQualityWav(buffer, targetBitrate) {
        // 降低采样率来模拟低比特率
        const targetSampleRate = Math.min(8000, buffer.sampleRate);
        const length = Math.floor(buffer.length * (targetSampleRate / buffer.sampleRate));
        
        const offlineContext = new OfflineAudioContext(
            buffer.numberOfChannels,
            length,
            targetSampleRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start();

        return offlineContext.startRendering().then(renderedBuffer => {
            // 创建WAV文件
            const length = renderedBuffer.length * renderedBuffer.numberOfChannels * 2;
            const buffer = new ArrayBuffer(44 + length);
            const view = new DataView(buffer);

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
            view.setUint16(22, renderedBuffer.numberOfChannels, true);
            view.setUint32(24, renderedBuffer.sampleRate, true);
            view.setUint32(28, renderedBuffer.sampleRate * renderedBuffer.numberOfChannels * 2, true);
            view.setUint16(32, renderedBuffer.numberOfChannels * 2, true);
            view.setUint16(34, 16, true);
            writeString(36, 'data');
            view.setUint32(40, length, true);

            let offset = 44;
            for (let i = 0; i < renderedBuffer.length; i++) {
                for (let channel = 0; channel < renderedBuffer.numberOfChannels; channel++) {
                    const sample = Math.max(-1, Math.min(1, renderedBuffer.getChannelData(channel)[i]));
                    view.setInt16(offset, sample * 0x7FFF, true);
                    offset += 2;
                }
            }

            return new Blob([buffer], { type: 'audio/wav' });
        });
    }
}

// UI控制
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
        // 文件上传
        this.elements.uploadArea.addEventListener('click', () => this.elements.audioInput.click());
        this.elements.audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        
        // 拖拽上传
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('border-blue-500', 'bg-blue-50');
        });
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
        });
        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
            this.handleFile(e.dataTransfer.files[0]);
        });

        // 设置模态框
        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal());
        document.getElementById('closeModal').addEventListener('click', () => this.hideModal());
        document.getElementById('applySettings').addEventListener('click', () => this.applySettings());
        this.elements.qualitySlider.addEventListener('input', () => this.updateQualityDescription());

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
        this.hideModal();
    }

    updateQualityDescription() {
        const level = this.elements.qualitySlider.value;
        const descriptions = {
            1: '1级：压缩到3比特，无失真',
            2: '2级：压缩到2比特，无失真',
            3: '3级：压缩到1比特，无失真',
            4: '4级：压缩到1比特，添加轻度失真',
            5: '5级：压缩到1比特，添加强烈失真'
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
            a.download = `compressed_${this.selectedFile.name.replace(/\.[^/.]+$/, "")}.wav`;
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
