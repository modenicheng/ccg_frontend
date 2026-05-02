import { useEffect, useState } from "react";

const VOLUME_HOTKEY_STEP = 5;

interface UseKeyboardShortcutsOptions {
  isConnected: boolean;
  handleBuzz: () => void;
  adjustVolume: (delta: number) => void;
  showVolumeToast: () => void;
  showAudioPrompt: boolean;
  needsGesturePromptOnInit: boolean;
  handleRecoverPlaybackWithGesture: () => void;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const {
    isConnected,
    handleBuzz,
    adjustVolume,
    showVolumeToast,
    showAudioPrompt,
    needsGesturePromptOnInit,
    handleRecoverPlaybackWithGesture,
    hasUserInteractedRef,
  } = options;

  const [isBuzzHotkeyActive, setIsBuzzHotkeyActive] = useState(false);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName;
      return (
        target.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      );
    };

    const isBuzzHotkey = (ev: KeyboardEvent) => {
      const isSpace =
        ev.code === "Space" || ev.key === " " || ev.key === "Spacebar";
      const isEnter = ev.key === "Enter";
      return isSpace || isEnter;
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (!isBuzzHotkey(ev) || isEditableTarget(ev.target)) {
        return;
      }

      ev.preventDefault();

      if (ev.repeat) {
        return;
      }

      if (!isConnected) {
        return;
      }

      setIsBuzzHotkeyActive(true);
      handleBuzz();
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (!isBuzzHotkey(ev)) {
        return;
      }
      setIsBuzzHotkeyActive(false);
    };

    const onWindowBlur = () => {
      setIsBuzzHotkeyActive(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [handleBuzz, isConnected]);

  useEffect(() => {
    const isVolumeDownHotkey = (ev: KeyboardEvent) => {
      return (
        ev.key === "-" ||
        ev.key === "_" ||
        ev.code === "Minus" ||
        ev.code === "NumpadSubtract"
      );
    };

    const isVolumeUpHotkey = (ev: KeyboardEvent) => {
      return (
        ev.key === "=" ||
        ev.key === "+" ||
        ev.code === "Equal" ||
        ev.code === "NumpadAdd"
      );
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        return;
      }

      if (isVolumeDownHotkey(ev)) {
        ev.preventDefault();
        adjustVolume(-VOLUME_HOTKEY_STEP);
        showVolumeToast();
        return;
      }

      if (isVolumeUpHotkey(ev)) {
        ev.preventDefault();
        adjustVolume(VOLUME_HOTKEY_STEP);
        showVolumeToast();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [adjustVolume, showVolumeToast]);

  useEffect(() => {
    if (!showAudioPrompt && !needsGesturePromptOnInit) {
      return;
    }

    const handleUserGesture = () => {
      hasUserInteractedRef.current = true;
      void handleRecoverPlaybackWithGesture();
    };

    window.addEventListener("pointerdown", handleUserGesture, {
      passive: true,
      once: true,
    });
    window.addEventListener("keydown", handleUserGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, [handleRecoverPlaybackWithGesture, showAudioPrompt, needsGesturePromptOnInit, hasUserInteractedRef]);

  return { isBuzzHotkeyActive };
}
