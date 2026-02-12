import { create } from 'zustand';

type AppStore = {
  selectedWorkspaceId: string;
  selectedChannelId: string;
  messageDraft: string;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setSelectedChannelId: (channelId: string) => void;
  setMessageDraft: (value: string) => void;
  resetChannelSelection: () => void;
};

export const useAppStore = create<AppStore>((set) => ({
  selectedWorkspaceId: '',
  selectedChannelId: '',
  messageDraft: '',
  setSelectedWorkspaceId: (workspaceId) => set({ selectedWorkspaceId: workspaceId }),
  setSelectedChannelId: (channelId) => set({ selectedChannelId: channelId }),
  setMessageDraft: (value) => set({ messageDraft: value }),
  resetChannelSelection: () => set({ selectedChannelId: '', messageDraft: '' }),
}));
