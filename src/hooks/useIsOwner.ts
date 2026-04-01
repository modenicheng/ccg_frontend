import { useMemo } from "react";
import type { UserState, RoomState } from "../types/store";

export function useIsOwner(
  user: UserState | undefined,
  userId: number | null,
  roomState: RoomState | undefined,
): boolean {
  return useMemo(() => {
    if (user?.isOwner) {
      return true;
    }
    if (userId === null || !roomState?.players?.length) {
      return false;
    }
    return roomState.players.some(
      (player) => player.id === userId && player.is_owner,
    );
  }, [user?.isOwner, userId, roomState]);
}
