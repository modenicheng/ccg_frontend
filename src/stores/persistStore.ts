import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PersistState {
    theme: string;
    setTheme: (theme: string) => void;
}