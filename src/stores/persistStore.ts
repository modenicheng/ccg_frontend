import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistState } from "../types/store";

const usePersistStore = create<PersistState>()(
    persist(
        (set) => ({
            theme: "light",
            volume: 100,
            setTheme: (theme: string) => set({ theme }),
            setVolume: (volume: number) => set({ volume }),
        }),
        {
            name: "ccg-persist-store",
            partialize: (state) => ({ theme: state.theme, volume: state.volume }),
        },
    ),
);

export default usePersistStore;