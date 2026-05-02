/**
 * 检测 AudioContext 被浏览器拦截并显示提示弹窗的 Hook
 * 
 * 浏览器可能会因为自动播放策略而阻止 AudioContext 启动，
 * 此时需要用户手势（点击、触摸等）来恢复。
 * 此 Hook 会在检测到 NotAllowedError 时显示一个弹窗，
 * 用户点击弹窗后会自动恢复 AudioContext。
 */

import { useCallback, useRef, useState } from 'react';
import type { audioPlayer } from '../audioPlayer';

export function useAudioContextInterceptor() {
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
  const hasShownPromptRef = useRef(false);
  const pendingErrorRef = useRef<Error | null>(null);

  // 显示音频恢复提示弹窗
  const showAudioContextPrompt = useCallback(() => {
    if (!hasShownPromptRef.current) {
      hasShownPromptRef.current = true;
      setShowAudioPrompt(true);
    }
  }, []);

  // 处理用户点击弹窗，恢复 AudioContext
  const handleAudioPromptClick = useCallback(async (audioPlayer: audioPlayer | null) => {
    try {
      await audioPlayer?.ensureRunning?.();
      setShowAudioPrompt(false);
      hasShownPromptRef.current = false; // 重置，允许下次再显示

      // 如果有待处理的错误，尝试重新播放
      if (pendingErrorRef.current) {
        console.log("[AUDIO_PROMPT] Retrying playback after user gesture");
        pendingErrorRef.current = null;
      }
    } catch (err) {
      console.error("[AUDIO_PROMPT] Failed to resume AudioContext:", err);
    }
  }, []);

  // 关闭弹窗（不恢复）
  const closeAudioPrompt = useCallback(() => {
    setShowAudioPrompt(false);
    hasShownPromptRef.current = false; // 重置
    pendingErrorRef.current = null;
  }, []);

  // 创建错误处理回调，绑定到 audioPlayer
  const createPlaybackErrorCallback = useCallback(() => {
    return (error: Error) => {
      if (error.name === 'NotAllowedError') {
        console.warn('[AUDIO_INTERCEPTOR] Detected NotAllowedError, showing prompt');
        pendingErrorRef.current = error;
        showAudioContextPrompt();
      }
    };
  }, [showAudioContextPrompt]);

  // 初始化音频播放器的错误回调
  const setupAudioPlayerInterceptor = useCallback((audioPlayer: audioPlayer | null) => {
    if (audioPlayer && typeof audioPlayer.setPlaybackErrorCallback === 'function') {
      audioPlayer.setPlaybackErrorCallback(createPlaybackErrorCallback());
    }
  }, [createPlaybackErrorCallback]);

  return {
    showAudioPrompt,
    handleAudioPromptClick,
    closeAudioPrompt,
    setupAudioPlayerInterceptor,
  };
}
