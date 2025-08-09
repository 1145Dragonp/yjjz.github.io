class AudioCompressor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async compressAudio(file, qualityLevel, onProgress) {
        const audioBuffer = await this.fileToAudioBuffer(file);
        const duration = audioBuffer.duration;
        
        // 根据等级设置参数
        const settings = this.getQualitySettings(qualityLevel);
        
        // 创建离线音频上下文
        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        // 创建源节点
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        // 添加压缩和失真效果
        const compressor = offlineContext.createDynamicsCompressor();
        const waveShaper = offlineContext.createWaveShaper();
        
        // 设置压缩参数
        compressor.threshold.setValueAtTime(settings.threshold, offlineContext.currentTime);
        compressor.knee.setValueAtTime(settings.knee, offlineContext.currentTime);
        compressor.ratio.setValueAtTime(settings.ratio, offlineContext.currentTime);
        compressor.attack.setValueAtTime(0.003, offlineContext.currentTime);
        compressor.release.setValueAtTime(0.1, offlineContext.currentTime);

        // 设置失真
        if (settings.distortion > 0) {
            waveShaper.curve = this.makeDistortionCurve(settings.distortion);
            waveShaper.oversample = '4x';
        }

        // 连接节点
        source.connect(compressor);
        if (settings.distortion > 0) {
            compressor.connect(waveShaper);
            waveShaper.connect(offlineContext.destination);
        } else {
            compressor.connect(offlineContext.destination);
        }

        // 模拟进度
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 2;
            if (progress <= 100) {
                onProgress(progress);
            } else {
                clearInterval(progressInterval);
            }
        }, 50);

        // 开始渲染
        source.start();
        const renderedBuffer = await offlineContext.startRendering();
        
        clearInterval(progressInterval);
        onProgress(100);

        // 转换为MP3并返回
        return this.audioBufferToBlob(renderedBuffer, settings.bitrate);
    }

    getQualitySettings(level) {
        const settings = {
            1: { threshold: -50, knee: 40, ratio: 12, distortion: 0, bitrate: 3000 },   // 压缩到3比特
            2: { threshold: -40, knee: 30, ratio: 10, distortion: 0, bitrate: 2000 },   // 压缩到2比特
            3: { threshold: -30, knee: 20, ratio: 8, distortion: 0, bitrate: 1000 },    // 压缩到1比特
            4: { threshold: -20, knee: 10, ratio: 6, distortion: 20, bitrate: 1000 },   // 1比特 + 轻度失真
            5: { threshold: -10, knee: 0, ratio: 4, distortion: 50, bitrate: 1000 }     // 1比特 + 强烈失真
        };
        return settings[level];
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
        const arrayBuffer = await file.arrayBuffer();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    async audioBufferToBlob(buffer, bitrate) {
        // 使用Web Audio API转换为WAV格式
        const length = buffer.length * buffer.numberOfChannels * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);
        
        // WAV文件头
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
        
        // 音频数据
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
