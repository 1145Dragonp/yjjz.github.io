// 错误处理增强版
class DistortionEngine {
    constructor() {
        this.audioContext = null;
    }

    async addDistortion(file, settings, onProgress) {
        try {
            // 1. 文件验证
            this.validateFile(file);
            
            // 2. 创建音频上下文（用户交互后）
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // 3. 开始处理
            onProgress(0);
            const audioBuffer = await this.fileToAudioBuffer(file);
            onProgress(20);

            // 4. 处理音频
            const processedBuffer = await this.processAudioBuffer(audioBuffer, settings, onProgress);
            onProgress(100);

            return this.bufferToWav(processedBuffer);

        } catch (error) {
            throw this.createUserFriendlyError(error);
        }
    }

    validateFile(file) {
        // 文件大小检查
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_SIZE) {
            throw new Error(`文件过大 (${(file.size/1024/1024).toFixed(1)}MB)，请选择小于50MB的音频`);
        }

        // 文件类型检查
        const supportedTypes = ['audio/mp3', 'audio/wav', 'audio/flac', 'audio/m4a', 'audio/ogg', 'audio/wave'];
        if (!file.type || !file.type.startsWith('audio/')) {
            throw new Error(`不支持的文件类型: ${file.type}，请使用MP3/WAV/FLAC/M4A/OGG`);
        }
    }

    fileToAudioBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    this.audioContext.decodeAudioData(e.target.result)
                        .then(resolve)
                        .catch((err) => {
                            reject(new Error(`音频解码失败: ${err.message || '文件可能损坏'}`));
                        });
                } catch (decodeError) {
                    reject(new Error('浏览器不支持该音频编码'));
                }
            };
            
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.onabort = () => reject(new Error('读取被取消'));
            reader.readAsArrayBuffer(file);
        });
    }

    processAudioBuffer(buffer, settings, onProgress) {
        const processedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // 分批次处理避免阻塞
        const batchSize = 4096;
        const totalBatches = Math.ceil(buffer.length / batchSize);

        for (let batch = 0; batch < totalBatches; batch++) {
            const start = batch * batchSize;
            const end = Math.min(start + batchSize, buffer.length);

            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const inputData = buffer.getChannelData(channel);
                const outputData = processedBuffer.getChannelData(channel);

                for (let i = start; i < end; i++) {
                    let sample = inputData[i];
                    
                    // 应用损坏程度
                    sample = this.applyDamageLevel(sample, settings);
                    
                    // 额外效果
                    if (settings.noise) {
                        sample += (Math.random() - 0.5) * 0.05 * settings.intensity;
                    }
                    if (settings.crackle && Math.random() < 0.001 * settings.intensity) {
                        sample = (Math.random() - 0.5) * 2;
                    }
                    
                    outputData[i] = Math.max(-1, Math.min(1, sample));
                }
            }
            
            onProgress(20 + (batch / totalBatches) * 80);
        }

        return processedBuffer;
    }

    applyDamageLevel(sample, settings) {
        const intensity = settings.intensity * 0.3;
        
        switch (settings.type) {
            case 'digital':
                return Math.tanh(sample * intensity);
                
            case 'analog':
                return Math.sin(sample * intensity * Math.PI * 0.5);
                
            case 'crushed':
                // 动态位深压缩
                const bits = Math.max(1, 16 - intensity);
                const levels = Math.pow(2, bits);
                return Math.round(sample * levels) / levels;
                
            case 'radio':
                // 收音机失真 + 带通
                const radioSample = Math.sin(sample * intensity * 2);
                return Math.max(-0.7, Math.min(0.7, radioSample));
                
            case 'glitch':
                // 随机故障
                if (Math.random() < 0.005 * intensity) {
                    return (Math.random() - 0.5) * 2;
                }
                return sample;
                
            default:
                return sample;
        }
    }

    createUserFriendlyError(error) {
        if (error.message.includes('file')) return error; // 保持原始错误
        
        if (error.message.includes('decode')) {
            return new Error('音频解码失败，文件可能已损坏或格式不兼容');
        }
        
        if (error.message.includes('AudioContext')) {
            return new Error('浏览器不支持音频处理，请使用现代浏览器');
        }
        
        return new Error(`处理失败: ${error.message}`);
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

// 增强版用户界面
class DistortionUI {
    constructor() {
        this.selectedFile = null;
        this.distortion = new DistortionEngine();
        this.settings = { type: 'digital', intensity: 5, noise: false, crackle: false };
        this.init();
    }

    init() {
        this.setupElements();
        this.bindEvents();
        this.setupErrorHandling();
    }

    setupElements() {
        // 确保所有元素存在
        const elements = [
            'audioFile', 'uploadArea', 'fileInfo', 'controls', 'result',
            'progressContainer', 'fileName', 'fileType', 'fileSize', 'fileDuration',
            'distortionType', 'intensitySlider', 'intensityValue', 'noiseCheck',
            'crackleCheck', 'processBtn', 'progressText', 'progressFill', 'downloadBtn'
        ];

        elements.forEach(id => {
            const el = document.getElementById(id);
            if (!el) console.error(`❌ 缺少元素: ${id}`);
        });
    }

    bindEvents() {
        // 文件输入
        const audioInput = document.getElementById('audioFile');
        audioInput.addEventListener('change', (e) => this.handleFile(e.target.files[0]));

        // 点击区域
        document.getElementById('uploadArea').addEventListener('click', () => {
            audioInput.click();
        });

        // 拖拽
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.getElementById('uploadArea').addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        document.getElementById('uploadArea').addEventListener('drop', (e) => {
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

        document.getElementById('processBtn').addEventListener('click', () => {
            this.processAudio();
        });
    }

    setupErrorHandling() {
        window.addEventListener('error', (e) => {
            console.error('全局错误:', e.error);
        });
    }

    handleFile(file) {
        if (!file) return;

        // 详细文件检查
        console.log('📁 文件信息:', {
            name: file.name,
            type: file.type,
            size: `${(file.size/1024/1024).toFixed(2)}MB`,
            lastModified: new Date(file.lastModified).toLocaleString()
        });

        // 验证文件
        try {
            this.validateFile(file);
            
            this.selectedFile = file;
            
            // 显示文件信息
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileType').textContent = file.type;
            document.getElementById('fileSize').textContent = `${(file.size/1024).toFixed(1)} KB`;
            
            // 获取时长
            const audio = new Audio(URL.createObjectURL(file));
            audio.addEventListener('loadedmetadata', () => {
                document.getElementById('fileDuration').textContent = 
                    `${Math.floor(audio.duration / 60)}:${Math.floor(audio.duration % 60).toString().padStart(2, '0')}`;
                URL.revokeObjectURL(audio.src);
            });
            
            // 显示控制面板
            document.getElementById('fileInfo').style.display = 'block';
            document.getElementById('controls').style.display = 'block';
            
        } catch (error) {
            alert(error.message);
        }
    }

    validateFile(file) {
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_SIZE) {
            throw new Error(`文件过大 (${(file.size/1024/1024).toFixed(1)}MB)，请选择小于50MB的音频`);
        }
        
        const supportedTypes = ['audio/mp3', 'audio/wav', 'audio/flac', 'audio/m4a', 'audio/ogg', 'audio/wave'];
        if (!file.type || !file.type.startsWith('audio/')) {
            throw new Error(`不支持的文件类型: ${file.type || '未知'}`);
        }
    }

    async processAudio() {
        if (!this.selectedFile) {
            alert('请先选择音频文件！');
            return;
        }

        try {
            // 显示进度
            document.getElementById('controls').style.display = 'none';
            document.getElementById('progressContainer').style.display = 'block';
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
            document.getElementById('processBtn').disabled = true;

            const result = await this.distortion.addDistortion(
                this.selectedFile,
                this.settings,
                (progress) => {
                    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
                    document.getElementById('progressFill').style.width = `${progress}%`;
                }
            );

            document.getElementById('newFileSize').textContent = `${(result.size/1024).toFixed(1)} KB`;
            document.getElementById('downloadContainer').style.display = 'block';
            document.getElementById('progressContainer').style.display = 'none';
            
            // 设置下载
            const url = URL.createObjectURL(result);
            document.getElementById('downloadBtn').onclick = () => {
                const a = document.createElement('a');
                a.href = url;
                a.download = `damaged_${this.selectedFile.name.replace(/\.[^/.]+$/, "")}.wav`;
                a.click();
            };
            
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt"></i> 再次处理';
            document.getElementById('processBtn').disabled = false;

        } catch (error) {
            console.error('处理失败:', error);
            alert(error.message);
            document.getElementById('controls').style.display = 'block';
            document.getElementById('progressContainer').style.display = 'none';
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt"></i> 重新处理';
            document.getElementById('processBtn').disabled = false;
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ 全损音质生成器已启动');
    new DistortionUI();
});
