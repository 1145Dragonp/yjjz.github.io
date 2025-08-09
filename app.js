console.log('🚀 应用启动');

// 检查浏览器支持
console.log('Web Audio API支持:', !!window.AudioContext || !!window.webkitAudioContext);

// 文件处理
document.getElementById('audioFile').addEventListener('change', function(e) {
    console.log('📁 文件选择事件触发');
    handleFile(e.target.files[0]);
});

document.getElementById('uploadArea').addEventListener('click', function() {
    console.log('👆 点击上传区域');
    document.getElementById('audioFile').click();
});

function handleFile(file) {
    if (!file) {
        console.log('❌ 没有选择文件');
        return;
    }
    
    console.log('✅ 文件信息:', file.name, file.type, file.size);
    
    // 显示文件信息
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileType').textContent = file.type;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('fileInfo').style.display = 'block';
    
    // 绑定处理按钮
    document.getElementById('processBtn').onclick = () => processAudio(file);
}

async function processAudio(file) {
    console.log('🚀 开始处理...');
    
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('progressContainer').style.display = 'block';
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 处理音频
        const processed = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const inputData = audioBuffer.getChannelData(channel);
            const outputData = processed.getChannelData(channel);
            
            for (let i = 0; i < audioBuffer.length; i++) {
                let sample = inputData[i];
                sample = Math.sin(sample * 3) * 0.7; // 简单失真
                outputData[i] = Math.max(-1, Math.min(1, sample));
            }
        }
        
        // 导出
        const wav = bufferToWav(processed);
        const url = URL.createObjectURL(wav);
        
        document.getElementById('downloadBtn').onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `damaged_${file.name}`;
            a.click();
        };
        
        document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('downloadContainer').style.display = 'block';
        
    } catch (error) {
        console.error('❌ 处理失败:', error);
        alert('处理失败: ' + error.message);
        document.getElementById('progressContainer').style.display = 'none';
        document.getElementById('fileInfo').style.display = 'block';
    }
}

function bufferToWav(buffer) {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
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
