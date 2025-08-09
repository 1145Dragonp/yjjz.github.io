console.log('🚀 全损音质生成器已启动');

// 音频处理引擎
class DistortionEngine {
    constructor() {
        this.audioContext = null;
    }

    async addDistortion(file, settings, onProgress) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // 开始进度
            onProgress(0);
            const audioBuffer = await this.fileToAudioBuffer(file);
            onProgress(20);

            // 处理音频
            const processedBuffer = await this.processAudioBuffer(audioBuffer, settings, onProgress);
            onProgress(100);

            return this.bufferToWav(processedBuffer);

        } catch (error) {
            console.error('处理失败:', error);
            throw new Error(`处理失败: ${error.message}`);
        }
    }

    async processAudioBuffer(buffer, settings, onProgress) {
        const processedBuffer = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        const totalSteps = 100;
        const stepSize = Math.floor(buffer.length / totalSteps);

        for (let step = 0; step < totalSteps; step++) {
            const start = step * stepSize;
            const end = Math.min(start + stepSize, buffer.length);

            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const inputData = buffer.getChannelData(channel);
                const outputData = processedBuffer.getChannelData(channel);

                for (let i = start; i < end; i++) {
                    let sample = inputData[i];
                    
                    // 应用主失真
                    sample = this.applyMainDistortion(sample, settings);
                    
                    // 应用额外效果
                    if (settings.noise) {
                        sample += (Math.random() - 0.5) * 0.1 * settings.intensity;
                    }
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

    applyMainDistortion(sample, settings) {
        const intensity = settings.intensity * 0.5;
        
        switch (settings.type) {
            case 'digital':
                // 数字硬削波
                return Math.tanh(sample * intensity);
                
            case 'analog':
                // 模拟管饱和
                return Math.sin(sample * intensity * Math.PI * 0.5);
                
            case 'crushed':
                // 比特粉碎（可调位深）
                const bits = Math.max(1, 16 - intensity);
                const levels = Math.pow(2, bits);
                return Math.round(sample * levels) / levels;
                
            case 'radio':
                // 收音机效果 + 带通
                return Math.sin(sample * intensity * 2) * 0.7;
                
            case 'glitch':
                // 随机故障
                if (Math.random() < 0.01 * intensity) {
                    return (Math.random() - 0.5) * 2;
                }
                return sample;
                
            default:
                return sample;
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

// 用户界面控制器
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

    bindEvents() {
        // 文件选择
        const audioInput = document.getElementById('audioFile');
        audioInput.addEventListener('change', (e) => {
            this.handleFile(e.target.files[0]);
        });

        // 点击上传区域
        document.getElementById('uploadArea').addEventListener('click', () => {
            audioInput.click();
        });

        // 拖拽支持
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

        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.download();
        });
    }

    setupProgressBar() {
        // 进度条已内嵌在HTML中
    }

    handleFile(file) {
        if (!file || !file.type.startsWith('audio/')) {
            alert('请上传音频文件！支持: MP3, WAV, FLAC, M4A, OGG');
            return;
        }

        this.selectedFile = file;
        
        // 显示文件信息
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileType').textContent = file.type;
        document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
        
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
    }

    async processAudio() {
        if (!this.selectedFile) {
            alert('请先选择音频文件！');
            return;
        }

        // 显示进度
        document.getElementById('controls').style.display = 'none';
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('processBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>损坏中...';
        document.getElementById('processBtn').disabled = true;

        try {
            const result = await this.distortion.addDistortion(
                this.selectedFile,
                this.settings,
                (progress) => {
                    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
                    document.getElementById('progressFill').style.width = `${progress}%`;
                }
            );

            document.getElementById('newFileSize').textContent = (result.size / 1024).toFixed(1) + ' KB';
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
            
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt mr-1"></i>再次损坏';
            document.getElementById('processBtn').disabled = false;

        } catch (error) {
            alert('处理失败: ' + error.message);
            document.getElementById('controls').style.display = 'block';
            document.getElementById('progressContainer').style.display = 'none';
            document.getElementById('processBtn').innerHTML = '<i class="fas fa-bolt mr-1"></i>重新损坏';
            document.getElementById('processBtn').disabled = false;
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new DistortionUI();
});
