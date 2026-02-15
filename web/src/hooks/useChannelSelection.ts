import { useAppStore } from "@/store/app-store";
import { useEffect } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export function useChannelSelection(
  workspaces: Array<{ workspaceId: string; name: string; role: string }>,
  channels: Array<{ _id: Id<"channels">; name: string; slug: string; type: string }>,
  searchWorkspace?: string,
  searchChannel?: string,
) {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectedChannelId = useAppStore((s) => s.selectedChannelId);
  const setSelectedWorkspaceId = useAppStore((s) => s.setSelectedWorkspaceId);
  const setSelectedChannelId = useAppStore((s) => s.setSelectedChannelId);
  const resetChannelSelection = useAppStore((s) => s.resetChannelSelection);

  // Workspace selection sync
  useEffect(() => {
    if (!workspaces.length) {
      setSelectedWorkspaceId("");
      resetChannelSelection();
      return;
    }
    const fromSearch =
      searchWorkspace &&
      workspaces.some((w) => w.workspaceId === searchWorkspace)
        ? searchWorkspace
        : "";
    if (fromSearch && fromSearch !== selectedWorkspaceId) {
      setSelectedWorkspaceId(fromSearch);
      return;
    }
    if (
      !selectedWorkspaceId ||
      !workspaces.some((w) => w.workspaceId === selectedWorkspaceId)
    ) {
      setSelectedWorkspaceId(workspaces[0].workspaceId);
    }
  }, [
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    resetChannelSelection,
    searchWorkspace,
  ]);

  // Channel selection sync
  useEffect(() => {
    if (!channels.length) {
      setSelectedChannelId("");
      return;
    }
    const fromSearch =
      searchChannel && channels.some((c) => c._id === searchChannel)
        ? searchChannel
        : "";
    if (fromSearch && fromSearch !== selectedChannelId) {
      setSelectedChannelId(fromSearch);
      return;
    }
    if (
      !selectedChannelId ||
      !channels.some((c) => c._id === selectedChannelId)
    ) {
      setSelectedChannelId(channels[0]._id);
    }
  }, [channels, setSelectedChannelId, searchChannel]);

  return {
    selectedWorkspaceId,
    selectedChannelId,
    setSelectedWorkspaceId,
    setSelectedChannelId,
    resetChannelSelection,
  };
}
