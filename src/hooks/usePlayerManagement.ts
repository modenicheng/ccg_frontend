import { useMemo, useState } from "react";
import type { WS } from "../wsClient";

interface Player {
  id: number;
  username: string;
  is_owner: boolean;
}

interface UsePlayerManagementOptions {
  roomid: string;
  wsClient: WS | null | undefined;
}

export function usePlayerManagement({ roomid, wsClient }: UsePlayerManagementOptions) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isKicking, setIsKicking] = useState<number | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
  const [kickSuccess, setKickSuccess] = useState<string | null>(null);

  const uniquePlayers = useMemo(() => {
    const seen = new Set<number>();
    return players.filter((player) => {
      if (seen.has(player.id)) {
        return false;
      }
      seen.add(player.id);
      return true;
    });
  }, [players]);

  const handleKickUser = async (userId: number) => {
    if (!roomid || !wsClient) return;
    setIsKicking(userId);
    setKickError(null);
    setKickSuccess(null);
    try {
      await wsClient.sendJson({
        event: 15, // KICK_USER
        data: { user_id: userId },
      });
      setKickSuccess("踢人成功");
      setTimeout(() => {
        setKickSuccess(null);
      }, 3000);
    } catch (err) {
      setKickError((err as Error).message || "踢人失败");
      setTimeout(() => {
        setKickError(null);
      }, 3000);
    } finally {
      setIsKicking(null);
    }
  };

  return {
    players,
    setPlayers,
    isKicking,
    kickError,
    kickSuccess,
    uniquePlayers,
    handleKickUser,
  };
}
