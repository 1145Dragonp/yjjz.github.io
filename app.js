class DistortionUI {
    constructor() {
        this.selectedFile = null;
        this.distortion = new DistortionEngine();
        this.settings = { type: 'digital', intensity: 5, noise: false, crackle: false };
        this.audioContext = null;
        this.init();
    }

    init() {
        console.log('🚀 初始化应用...');
        this.setupElements();
        this.bindEvents();
        this.setupProgressBar();
    }

    setupElements() {
        // 获取所有DOM元素
        this.elements = {
            audioInput: document.getElementById('audioInput'),
            uploadArea: document.getElementById('uploadArea'),
            audioInfo: document.getElementById('audioInfo'),
            controls: document.getElementById('controls'),
            result: document.getElementById('result'),
            progressContainer: document.getElementById('progressContainer'),
            fileName: document.getElementById('fileName'),
            duration: document.getElementById('duration'),
            fileSize: document.getElementById('fileSize'),
            newFileSize: document.getElementById('newFileSize'),
            progressText: document.getElementById('progressText'),
            progressFill: document.getElementById('progressFill'),
            processBtn: document.getElementById('processBtn'),
            downloadBtn: document.getElementById('downloadBtn')
        };

        console.log('📋 元素已绑定:', Object.keys(this.elements));
    }

    bindEvents() {
        console.log('🔗 绑定事件监听器...');

        // 1. 文件输入事件（关键修复）
        this.elements.audioInput.addEventListener('change', (e) => {
            console.log('📁 文件选择事件触发:', e.target.files[0]?.name);
            this.handleFile(e.target.files[0]);
        });

        // 2. 点击上传区域
        this.elements.uploadArea.addEventListener('click', () => {
            console.log('👆 点击上传区域');
            this.initAudioContext();
            this.elements.audioInput.click();
        });

        // 3. 拖拽支持
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.elements.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        this.elements.uploadArea.addEventListener('dragenter', () => {
            console.log('🤏 拖拽进入');
            this.elements.uploadArea.classList.add('border-pink-500/50', 'bg-white/5');
        });

        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('border-pink-500/50', 'bg-white/5');
        });

        this.elements.uploadArea.addEventListener('drop', (e) => {
            console.log('📂 拖拽文件:', e.dataTransfer.files[0]?.name);
            this.initAudioContext();
            this.elements.uploadArea.classList.remove('border-pink-500/50', 'bg-white/5');
            this.handleFile(e.dataTransfer.files[0]);
        });

        // 4. 控制事件
        document.getElementById('distortionType').addEventListener('change', (e) => {
            this.settings.type = e.target.value;
            console.log('🎛️ 失真类型:', this.settings.type);
        });

        document.getElementById('intensitySlider').addEventListener('input', (e) => {
            this.settings.intensity = parseInt(e.target.value);
            document.getElementById('intensityValue').textContent = e.target.value;
            console.log('🎚️ 强度:', this.settings.intensity);
        });

        document.getElementById('noiseCheck').addEventListener('change', (e) => {
            this.settings.noise = e.target.checked;
            console.log('🔊 底噪:', this.settings.noise);
        });

        document.getElementById('crackleCheck').addEventListener('change', (e) => {
            this.settings.crackle = e.target.checked;
            console.log('💥 爆裂音:', this.settings.crackle);
        });

        // 5. 处理按钮（确保已绑定）
        this.elements.processBtn.addEventListener('click', () => {
            console.log('🎯 点击处理按钮');
            this.initAudioContext();
            this.processAudio();
        });
    }

    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🎵 音频上下文已创建');
        }
    }

    setupProgressBar() {
        const container = document.getElementById('progressContainer');
        if (!container) {
            const newContainer = document.createElement('div');
            newContainer.id = 'progressContainer';
            newContainer.className = 'hidden mt-4';
            newContainer.innerHTML = `
                <div class="text-center mb-2">
                    <div class="text-white text-sm" id="progressText">0%</div>
                </div>
                <div class="h-2 bg-white/20 rounded-full">
                    <div id="progressFill" class="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all"></div>
                </div>
            `;
            document.querySelector('.glass-card').appendChild(newContainer);
        }
    }

    handleFile(file) {
        if (!file) {
            console.log('❌ 无文件选择');
            return;
        }

        console.log('✅ 文件已选择:', file.name, file.type, file.size);
        
        // 验证文件类型
        if (!file.type.startsWith('audio/')) {
            alert('请上传音频文件！支持: MP3, WAV, FLAC, M4A, OGG');
            return;
        }

        this.selectedFile = file;
        
        // 显示文件信息
        this.elements.fileName.textContent = file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name;
        this.elements.fileSize.textContent = this.formatFileSize(file.size);
        
        // 获取时长
        const audio = new Audio(URL.createObjectURL(file));
        audio.addEventListener('loadedmetadata', () => {
            this.elements.duration.textContent = this.formatDuration(audio.duration);
            URL.revokeObjectURL(audio.src);
        });

        // 显示控制面板
        console.log('🎯 显示控制面板');
        this.elements.audioInfo.style.display = 'block';
        this.elements.controls.style.display = 'block';
        this.elements.result.style.display = 'none';
        this.elements.progressContainer.style.display = 'none';
    }

    async processAudio() {
        if (!this.selectedFile) {
            alert('请先选择音频文件！');
            return;
        }

        console.log('🚀 开始处理...');
        
        // 显示进度
        this.elements.controls.style.display = 'none';
        this.elements.progressContainer.style.display = 'block';
        
        const btn = this.elements.processBtn;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>损坏中...';
        btn.disabled = true;

        try {
            const result = await this.distortion.addDistortion(
                this.selectedFile,
                this.settings,
                (progress) => {
                    this.elements.progressText.textContent = `${Math.round(progress)}%`;
                    this.elements.progressFill.style.width = `${progress}%`;
                }
            );

            this.distortedBlob = result;
            this.elements.newFileSize.textContent = this.formatFileSize(result.size);
            
            this.elements.result.style.display = 'block';
            this.elements.progressContainer.style.display = 'none';
            
            btn.innerHTML = '<i class="fas fa-bolt mr-1"></i>再次损坏';
            btn.disabled = false;

        } catch (error) {
            console.error('❌ 处理失败:', error);
            alert('处理失败: ' + error.message);
            this.elements.controls.style.display = 'block';
            this.elements.progressContainer.style.display = 'none';
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

// 确保DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎉 应用已初始化');
    new DistortionUI();
});
