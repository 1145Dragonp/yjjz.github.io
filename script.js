// 全局变量
let selectedFile = null;
let compressedBlob = null;
let currentQuality = 3;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
});

function initializeEventListeners() {
    const audioInput = document.getElementById('audioInput');
    const uploadArea = document.getElementById('uploadArea');
    const settingsBtn = document.getElementById('settingsBtn');
    const compressBtn = document.getElementById('compressBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModal = document.getElementById('closeModal');
    const applySettings = document.getElementById('applySettings');
    const qualitySlider = document.getElementById('qualitySlider');

    // 文件上传
    uploadArea.addEventListener('click', () => audioInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.background = '#f8f9ff';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.background = 'transparent';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.background = 'transparent';
        const files = e.dataTransfer.files;
        if (files.length > 0) handleAudioFile(files[0]);
    });

    audioInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleAudioFile(e.target.files[0]);
    });

    // 设置弹窗
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });

    closeModal.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    applySettings.addEventListener('click', () => {
        currentQuality = parseInt(qualitySlider.value);
        settingsModal.style.display = 'none';
    });

    // 压缩按钮
    compressBtn.addEventListener('click', compressAudio);

    // 下载按钮
    downloadBtn.addEventListener('click', () => {
        if (compressedBlob) {
            const url = URL.createObjectURL(compressedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `compressed_${selectedFile.name}`;
            a.click();
            URL.revokeObjectURL(url);
        }
    });

    // 质量滑块
    qualitySlider.addEventListener('input', updateQualityDescription);
    updateQualityDescription();
}

function handleAudioFile(file) {
    if (!file.type.startsWith('audio/')) {
        alert('请选择有效的音频文件！');
        return;
    }

    selectedFile = file;
    
    // 显示文件信息
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    
    // 获取音频时长
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.addEventListener('loadedmetadata', () => {
        document.getElementById('duration').textContent = formatDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
    });

    // 显示控制按钮
    document.getElementById('audioInfo').style.display = 'block';
    document.getElementById('controls').style.display = 'block';
}

function updateQualityDescription() {
    const level = document.getElementById('qualitySlider').value;
    const descriptions = {
        1: '1级：压缩到3比特，无失真',
        2: '2级：压缩到2比特，无失真',
        3: '3级：压缩到1比特，无失真',
        4: '4级：压缩到1比特，添加轻度失真',
        5: '5级：压缩到1比特，

    };
    document.getElementById('qualityDescription').textContent = descriptions[level];
}

async function compressAudio() {
    if (!selectedFile) {
        alert('请先选择音频文件！');
        return;
    }

    // 隐藏控制按钮，显示进度
    document.getElementById('controls').style.display = 'none';
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('result').style.display = 'none';

    const compressor = new AudioCompressor();
    
    try {
        compressedBlob = await compressor.compressAudio(
            selectedFile,
            currentQuality,
            (progress) => {
                document.getElementById('progressFill').style.width = `${progress}%`;
                document.getElementById('progressText').textContent = `${progress}%`;
            }
        );

        // 显示结果
        document.getElementById('newFileSize').textContent = formatFileSize(compressedBlob.size);
        document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('result').style.display = 'block';
        
    } catch (error) {
        console.error('压缩失败:', error);
        alert('音频处理失败，请重试！');
        document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
