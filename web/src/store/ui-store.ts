import { create } from "zustand";

type UiStore = {
  output: string;
  copied: boolean;
  setOutput: (value: string) => void;
  setCopied: (value: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  output: "Ready. Query your API from the live panel.",
  copied: false,
  setOutput: (value) => set({ output: value }),
  setCopied: (value) => set({ copied: value }),
}));
