import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistState } from "../types/store";

const usePersistStore = create<PersistState>()(
  persist(
    (set, get) => ({
      theme: "light",
      volume: 100,
      users: [],
      setTheme: (theme: string) => set({ theme }),
      setVolume: (volume: number) => set({ volume }),
      addUser: (user) =>
        set((state) => ({
          users: [...state.users, user],
        })),
      removeUser: (userId) =>
        set((state) => ({
          users: state.users.filter((u) => u.id !== userId),
        })),
      getRoomUser: (roomId: string) =>
        get().users.find((u) => u.roomId === roomId),
    }),
    {
      name: "ccg-persist-store",
      partialize: (state) => ({
        theme: state.theme,
        volume: state.volume,
        users: state.users,
      }),
    },
  ),
);

export default usePersistStore;
