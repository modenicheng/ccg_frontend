import { create } from "zustand";

const MAX_ERROR_TOAST_COUNT = 6;

export type ToastVariant = "error" | "success" | "info";

export interface ErrorToastItem {
  id: number;
  message: string;
  errorEvent: number | null;
  createdAt: number;
  variant: ToastVariant;
}

interface ErrorToastState {
  toasts: ErrorToastItem[];
  pushToast: (payload: {
    message: string;
    variant?: ToastVariant;
    errorEvent?: number | null;
  }) => void;
  pushWsError: (payload: { message: string; errorEvent?: number | null }) => void;
  pushSuccess: (message: string) => void;
  pushInfo: (message: string) => void;
  removeToast: (id: number) => void;
  clearToasts: () => void;
}

let toastIdSeed = 0;

const buildNextToasts = (
  currentToasts: ErrorToastItem[],
  payload: { message: string; variant: ToastVariant; errorEvent?: number | null },
): ErrorToastItem[] => {
  const normalizedMessage = payload.message.trim();
  if (!normalizedMessage) {
    return currentToasts;
  }

  toastIdSeed += 1;
  const nextToast: ErrorToastItem = {
    id: Date.now() + toastIdSeed,
    message: normalizedMessage,
    errorEvent: typeof payload.errorEvent === "number" ? payload.errorEvent : null,
    createdAt: Date.now(),
    variant: payload.variant,
  };

  const nextToasts = [...currentToasts, nextToast];
  if (nextToasts.length <= MAX_ERROR_TOAST_COUNT) {
    return nextToasts;
  }
  return nextToasts.slice(nextToasts.length - MAX_ERROR_TOAST_COUNT);
};

const useErrorToastStore = create<ErrorToastState>((set) => ({
  toasts: [],
  pushToast: ({ message, variant = "error", errorEvent }) => {
    set((state) => {
      return {
        toasts: buildNextToasts(state.toasts, {
          message,
          variant,
          errorEvent,
        }),
      };
    });
  },
  pushWsError: ({ message, errorEvent }) => {
    set((state) => ({
      toasts: buildNextToasts(state.toasts, {
        message,
        variant: "error",
        errorEvent,
      }),
    }));
  },
  pushSuccess: (message) => {
    set((state) => ({
      toasts: buildNextToasts(state.toasts, {
        message,
        variant: "success",
      }),
    }));
  },
  pushInfo: (message) => {
    set((state) => ({
      toasts: buildNextToasts(state.toasts, {
        message,
        variant: "info",
      }),
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  clearToasts: () => {
    set({ toasts: [] });
  },
}));

export default useErrorToastStore;
