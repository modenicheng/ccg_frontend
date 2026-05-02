import { useCallback, useRef, useState } from "react";
import { getSongs, type Song } from "../api/song";
import { setRoomTestAudio } from "../api/room";

const roomSongsPageSize = 10;

interface UseTestAudioManagementOptions {
  roomid: string;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}

export function useTestAudioManagement({
  roomid,
  setError,
  setSuccess,
}: UseTestAudioManagementOptions) {
  const testAudioRequestVersionRef = useRef(0);

  const [testAudioSongId, setTestAudioSongId] = useState<number | null>(null);
  const [initialTestAudioSongId, setInitialTestAudioSongId] = useState<number | null>(null);
  const [isSettingTestAudio, setIsSettingTestAudio] = useState(false);
  const [testAudioSearchKw, setTestAudioSearchKw] = useState<string>("");
  const [testAudioSongs, setTestAudioSongs] = useState<Song[]>([]);
  const [testAudioSongsTotal, setTestAudioSongsTotal] = useState(0);
  const [testAudioSongsPage, setTestAudioSongsPage] = useState(1);
  const [isLoadingTestAudioSongs, setIsLoadingTestAudioSongs] = useState(false);
  const [isSwitchingTestAudio, setIsSwitchingTestAudio] = useState(false);
  const [testAudioTaskId, setTestAudioTaskId] = useState<string | null>(null);
  const [testAudioTaskStatus, setTestAudioTaskStatus] = useState<string | null>(null);
  const [testAudioTargetSongId, setTestAudioTargetSongId] = useState<number | null>(null);

  const isUiBlockedByTestAudioTask = isSwitchingTestAudio;

  const loadTestAudioSongs = useCallback(
    async (page: number, kw?: string) => {
      setIsLoadingTestAudioSongs(true);
      try {
        const { list, total } = await getSongs({
          offset: (page - 1) * roomSongsPageSize,
          limit: roomSongsPageSize,
          kw: kw || undefined,
        });
        setTestAudioSongs(list);
        setTestAudioSongsTotal(total);
      } catch (err) {
        setError((err as Error).message || "加载歌曲列表失败");
      } finally {
        setIsLoadingTestAudioSongs(false);
      }
    },
    [setError],
  );

  const applyTestAudioWithPolling = useCallback(
    async (
      songDbId: number,
      options: { closeDialogOnSuccess: boolean } = { closeDialogOnSuccess: true },
    ) => {
      if (!roomid || isSwitchingTestAudio) {
        return false;
      }

      const requestVersion = testAudioRequestVersionRef.current + 1;
      testAudioRequestVersionRef.current = requestVersion;

      setIsSwitchingTestAudio(true);
      setTestAudioTargetSongId(songDbId);
      setTestAudioTaskId(null);
      setTestAudioTaskStatus(null);
      setError(null);

      let hasShownTaskHint = false;

      try {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          const response = await setRoomTestAudio(roomid, songDbId);

          if (testAudioRequestVersionRef.current !== requestVersion) {
            return false;
          }

          if (response.status === "task") {
            setTestAudioTaskId(response.taskId);
            setTestAudioTaskStatus(response.taskStatus);
            if (!hasShownTaskHint) {
              setSuccess("服务器正在拉取音频文件，请稍候...");
              hasShownTaskHint = true;
            }
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 1500);
            });
            continue;
          }

          setTestAudioSongId(songDbId);
          setInitialTestAudioSongId(songDbId);
          setTestAudioTaskId(null);
          setTestAudioTaskStatus(null);
          setSuccess(
            `已设置预热 BGM：${response.title || "歌曲"} (ID: ${songDbId})`,
          );

          if (options.closeDialogOnSuccess) {
            setIsSettingTestAudio(false);
          }

          return true;
        }

        setError("等待音频拉取超时，请稍后重试");
        return false;
      } catch (err) {
        setError((err as Error).message || "设置预热 BGM 失败");
        return false;
      } finally {
        if (testAudioRequestVersionRef.current === requestVersion) {
          setIsSwitchingTestAudio(false);
          setTestAudioTargetSongId(null);
          setTestAudioTaskStatus(null);
        }
      }
    },
    [isSwitchingTestAudio, roomid, setError, setSuccess],
  );

  const handleOpenTestAudioDialog = async () => {
    setIsSettingTestAudio(true);
    setTestAudioSongsPage(1);
    setTestAudioSongsTotal(0);
    await loadTestAudioSongs(1, testAudioSearchKw);
  };

  const handleTestAudioSongsPageChange = async (nextPage: number) => {
    if (nextPage < 1 || nextPage === testAudioSongsPage) return;
    setTestAudioSongsPage(nextPage);
    await loadTestAudioSongs(nextPage, testAudioSearchKw);
  };

  const handleSetTestAudio = async (songDbId: number) => {
    if (!roomid || isSwitchingTestAudio) return;
    await applyTestAudioWithPolling(songDbId, {
      closeDialogOnSuccess: true,
    });
  };

  return {
    testAudioSongId,
    setTestAudioSongId,
    initialTestAudioSongId,
    setInitialTestAudioSongId,
    isSettingTestAudio,
    setIsSettingTestAudio,
    testAudioSearchKw,
    setTestAudioSearchKw,
    testAudioSongs,
    setTestAudioSongs,
    testAudioSongsTotal,
    setTestAudioSongsTotal,
    testAudioSongsPage,
    setTestAudioSongsPage,
    isLoadingTestAudioSongs,
    setIsLoadingTestAudioSongs,
    isSwitchingTestAudio,
    setIsSwitchingTestAudio,
    testAudioTaskId,
    setTestAudioTaskId,
    testAudioTaskStatus,
    setTestAudioTaskStatus,
    testAudioTargetSongId,
    setTestAudioTargetSongId,
    testAudioRequestVersionRef,
    isUiBlockedByTestAudioTask,
    loadTestAudioSongs,
    applyTestAudioWithPolling,
    handleOpenTestAudioDialog,
    handleTestAudioSongsPageChange,
    handleSetTestAudio,
    roomSongsPageSize,
  };
}
