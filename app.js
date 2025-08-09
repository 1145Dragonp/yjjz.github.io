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

            const audioBuffer = await this.fileToAudioBuffer(file);
            
            // 创建离线上下文
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );

            // 音频处理链
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;

            // 根据设置应用失真
            let processedSignal = this.applyDistortionChain(
                source, 
                offlineContext, 
                settings,
                onProgress
            );

            processedSignal.connect(offlineContext.destination);
            source.start();

            const renderedBuffer = await offlineContext.startRendering();
            return this.bufferToWav(renderedBuffer);

        } catch (error) {
            throw new Error(`失真处理失败: ${error.message}`);
        }
    }

    applyDistortionChain(source, context, settings, onProgress) {
        let signal = source;

        // 1. 主失真类型
        switch (settings.type) {
            case 'digital':
                signal = this.createDigitalDistortion(signal, context, settings.intensity);
                break;
            case 'analog':
                signal = this.createAnalogDistortion(signal, context, settings.intensity);
                break;
            case 'crushed':
                signal = this.createBitCrush(signal, context, settings.intensity);
                break;
            case 'radio':
                signal = this.createRadioDistortion(signal, context, settings.intensity);
                break;
            case 'glitch':
                signal = this.createGlitchEffect(signal, context, settings.intensity);
                break;
        }

        // 2. 额外效果
        if (settings.noise) {
            signal = this.addNoise(signal, context, settings.intensity);
        }
        if (settings.crackle) {
            signal = this.addCrackle(signal, context, settings.intensity);
        }

        return signal;
    }

    // 失真效果实现
    createDigitalDistortion(source, context, intensity) {
        const shaper = context.createWaveShaper();
        const curve = new Float32Array(44100);
        const gain = Math.min(intensity * 0.5, 8);
        
        for (let i = 0; i < 44100; i++) {
            const x = (i * 2) / 44100 - 1;
            curve[i] = Math.tanh(x * gain);
        }
        shaper.curve = curve;
        shaper.oversample = '4x';
        
        source.connect(shaper);
        return shaper;
    }

    createAnalogDistortion(source, context, intensity) {
        const shaper = context.createWaveShaper();
        const curve = new Float32Array(44100);
        const drive = intensity * 0.3;
        
        for (let i = 0; i < 44100; i++) {
            const x = (i * 2) / 44100 - 1;
            curve[i] = (3 + drive) * x * 20 * Math.PI / 180 / (Math.PI + drive * Math.abs(x));
        }
        shaper.curve = curve;
        
        source.connect(shaper);
        return shaper;
    }

    createBitCrush(source, context, intensity) {
        const bitDepth = Math.max(2, 16 - intensity * 1.5);
        const levels = Math.pow(2, bitDepth);
        
        const shaper = context.createWaveShaper();
        const curve = new Float32Array(44100);
        
        for (let i = 0; i < 44100; i++) {
            const x = (i * 2) / 44100 - 1;
            const level = Math.round(x * levels) / levels;
            curve[i] = level;
        }
        shaper.curve = curve;
        
        source.connect(shaper);
        return shaper;
    }

    createRadioDistortion(source, context, intensity) {
        // 模拟收音机效果
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000 + intensity * 200, context.currentTime);
        filter.Q.setValueAtTime(intensity * 5, context.currentTime);

        const shaper = context.createWaveShaper();
        const curve = new Float32Array(44100);
        for (let i = 0; i < 44100; i++) {
            const x = (i * 2) / 44100 - 1;
            curve[i] = Math.sin(x * Math.PI * 0.5 * intensity);
        }
        shaper.curve = curve;

        source.connect(filter);
        filter.connect(shaper);
        return shaper;
    }

    createGlitchEffect(source, context, intensity) {
        const bufferSize = context.sampleRate * 2;
        const scriptNode = context.createScriptProcessor(bufferSize, 1, 1);
        
        scriptNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);
                
                for (let i = 0; i < inputBuffer.length; i++) {
                    if (Math.random() < intensity * 0.01) {
                        outputData[i] = inputData[i] * (Math.random() - 0.5) * 2;
                    } else {
                        outputData[i] = inputData[i];
                    }
                }
            }
        };
        
        source.connect(scriptNode);
        return scriptNode;
    }

    addNoise(source, context, intensity) {
        const bufferSize = context.sampleRate * 2;
        const noiseNode = context.createScriptProcessor(bufferSize, 1, 1);
        
        noiseNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);
                
                for (let i = 0; i < inputBuffer.length; i++) {
                    const noise = (Math.random() - 0.5) * 2 * (intensity * 0.1);
                    outputData[i] = inputData[i] + noise;
                }
            }
        };
        
        source.connect(noiseNode);
        return noiseNode;
    }

    addCrackle(source, context, intensity) {
        const bufferSize = context.sampleRate * 2;
        const crackleNode = context.createScriptProcessor(bufferSize, 1, 1);
        
        crackleNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);
                
                for (let i = 0; i < inputBuffer.length; i++) {
                    let sample = inputData[i];
                    if (Math.random() < intensity * 0.005) {
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
                    .catch(err => reject(new Error('音频解码失败: ' + err.message)));
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

// 用户界面
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
            distortionType: document.getElementById('distortionType'),
            intensitySlider: document.getElementById('intensitySlider'),
            noiseCheck: document.getElementById('noiseCheck'),
            crackleCheck: document.getElementById('crackleCheck')
        };
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
        
        this.elements.uploadArea.addEventListener('drop', (e) => {
            initAudio();
            e.preventDefault();
            this.handleFile(e.dataTransfer.files[0]);
        });

        document.getElementById('processBtn').addEventListener('click', () => {
            initAudio();
            this.processAudio();
        });

        document.getElementById('downloadBtn').addEventListener('click', () => this.download());

        // 实时设置更新
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
        this.hideElement(this.elements.result);
    }

    async processAudio() {
        if (!this.selectedFile) {
            alert('请先选择音频文件！');
            return;
        }

        document.getElementById('processBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>损坏中...';
        document.getElementById('processBtn').disabled = true;

        try {
            const distortedBlob = await this.distortion.addDistortion(
                this.selectedFile,
                this.settings,
                (progress) => {
                    // 可以添加进度动画
                }
            );

            this.distortedBlob = distortedBlob;
            this.elements.newFileSize.textContent = this.formatFileSize(distortedBlob.size);
            
            this.showElement(this.elements.result);
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt mr-2"></i>已损坏';
            setTimeout(() => {
                document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt mr-2"></i>再次损坏';
                document.getElementById('processBtn').disabled = false;
            }, 2000);

        } catch (error) {
            console.error('处理失败:', error);
            alert('损坏失败: ' + error.message);
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt mr-2"></i>重新损坏';
            document.getElementById('processBtn').disabled = false;
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new DistortionUI();
});
