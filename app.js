class AudioCompressor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async compressAudio(file, qualityLevel, onProgress) {
        try {
            const audioBuffer = await this.fileToAudioBuffer(file);
            const settings = this.getQualitySettings(qualityLevel);

            // 保持原始采样率确保可听性
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );

            // 音频处理链
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;

            // 压缩器
            const compressor = offlineContext.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-20, offlineContext.currentTime);
            compressor.ratio.setValueAtTime(settings.compressionRatio, offlineContext.currentTime);
            compressor.attack.setValueAtTime(0.003, offlineContext.currentTime);
            compressor.release.setValueAtTime(0.1, offlineContext.currentTime);

            // 失真效果
            let lastNode = compressor;
            if (settings.distortion > 0) {
                const waveShaper = offlineContext.createWaveShaper();
                waveShaper.curve = this.makeDistortionCurve(settings.distortion);
                compressor.connect(waveShaper);
                lastNode = waveShaper;
            }

            lastNode.connect(offlineContext.destination);
            source.start();

            // 进度模拟
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress = Math.min(progress + 5, 95);
                onProgress(progress);
            }, 100);

            const renderedBuffer = await offlineContext.startRendering();
            clearInterval(progressInterval);
            onProgress(100);

            // 真正的3比特压缩
            return this.create3BitAudio(renderedBuffer);

        } catch (error) {
            throw new Error(`处理失败: ${error.message}`);
        }
    }

    getQualitySettings(level) {
        return {
            1: { compressionRatio: 2, distortion: 0 },   // 3比特轻度
            2: { compressionRatio: 3, distortion: 0 },   // 3比特中度
            3: { compressionRatio: 4, distortion: 0 },   // 3比特重度
            4: { compressionRatio: 4, distortion: 20 },  // 3比特+失真
            5: { compressionRatio: 4, distortion: 40 }   // 3比特+强失真
        }[level];
    }

    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = Math.tanh(x * (amount/10));
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

    create3BitAudio(buffer) {
        // 真正的3比特量化
        const levels = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]; // 8个电平
        
        const compressedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // 量化到3比特（8个电平）
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const targetData = compressedBuffer.getChannelData(channel);
            
            for (let i = 0; i < buffer.length; i++) {
                // 映射到最接近的3比特电平
                const sample = sourceData[i];
                const index = Math.round((sample + 1) * 3.5);
                const clampedIndex = Math.max(0, Math.min(7, index));
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

// 用户界面控制
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
        this.elements.uploadArea.addEventListener('click', () => this.elements.audioInput.click());
        this.elements.audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.elements.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        this.elements.uploadArea.addEventListener('dragenter', () => {
            this.elements.uploadArea.classList.add('border-white/50', 'bg-white/5');
        });
        
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('border-white/50', 'bg-white/5');
        });
        
        this.elements.uploadArea.addEventListener('drop', (e) => {
            this.elements.uploadArea.classList.remove('border-white/50', 'bg-white/5');
            this.handleFile(e.dataTransfer.files[0]);
        });

        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal());
        document.getElementById('closeModal').addEventListener('click', () => this.hideModal());
        document.getElementById('applySettings').addEventListener('click', () => this.applySettings());
        this.elements.qualitySlider.addEventListener('input', () => this.updateQualityDescription());
        document.getElementById('compressBtn').addEventListener('click', () => this.compress());
        document.getElementById('downloadBtn').addEventListener('click', () => this.download());

        this.updateQualityDescription();
    }

    handleFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            alert('请选择有效的音频文件！');
            return;
        }

        this.selectedFile = file;
        this.elements.fileName.textContent = file.name;
        this.elements.fileSize.textContent = this.formatFileSize(file.size);
        
        const audio = new Audio(URL.createObjectURL(file));
        audio.addEventListener('loadedmetadata', () => {
            this.elements.duration.textContent = this.formatDuration(audio.duration);
            URL.revokeObjectURL(audio.src);
        });

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
            1: '1级：3比特轻度压缩，清晰可听',
            2: '2级：3比特中度压缩，可听',
            3: '3级：3比特重度压缩，仍可听',
            4: '3比特+轻度失真，Lo-Fi效果',
            5: '3比特+强失真，复古效果'
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
            alert('处理失败，请重试！');
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new AudioUI();
});
