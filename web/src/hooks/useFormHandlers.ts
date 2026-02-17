import { useAppStore } from "@/store/app-store";
import { useMutation } from "convex/react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useFormHandlers(params?: { selectedWorkspaceId?: string; selectedChannelId?: string }) {
  const selectedWorkspaceIdFromStore = useAppStore((s) => s.selectedWorkspaceId);
  const selectedChannelIdFromStore = useAppStore((s) => s.selectedChannelId);
  const selectedWorkspaceId = params?.selectedWorkspaceId ?? selectedWorkspaceIdFromStore;
  const selectedChannelId = params?.selectedChannelId ?? selectedChannelIdFromStore;
  const messageDraft = useAppStore((s) => s.messageDraft);
  const setMessageDraft = useAppStore((s) => s.setMessageDraft);
  const setSelectedWorkspaceId = useAppStore((s) => s.setSelectedWorkspaceId);

  // Form state
  const [workspaceName, setWorkspaceName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"TEXT" | "VOICE">("TEXT");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [pendingMutations, setPendingMutations] = useState<Set<string>>(
    new Set(),
  );
  const [mutationError, setMutationError] = useState("");

  // Convex mutations
  const createWorkspaceMutation = useMutation(api.workspaces.create);
  const createChannelMutation = useMutation(api.channels.create);
  const removeChannelMutation = useMutation(api.channels.remove);
  const sendMessageMutation = useMutation(api.messages.send);
  const createInviteMutation = useMutation(api.invites.create);
  const joinInviteMutation = useMutation(api.invites.join);
  const updateSettingsMutation = useMutation(api.workspaces.updateSettings);
  const updateRoleMutation = useMutation(api.members.updateRole);
  const kickMemberMutation = useMutation(api.members.kick);

  function withPending<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    setPendingMutations((prev) => new Set([...prev, key]));
    setMutationError("");
    return fn()
      .catch((e: Error) => {
        setMutationError(e.message ?? String(e));
        return undefined;
      })
      .finally(() => {
        setPendingMutations((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  }

  const onCreateWorkspace = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!workspaceName.trim()) return;
      const id = await withPending("createWorkspace", () =>
        createWorkspaceMutation({ name: workspaceName.trim() }),
      );
      if (id) {
        setWorkspaceName("");
        setSelectedWorkspaceId(id as string);
      }
    },
    [workspaceName, createWorkspaceMutation, setSelectedWorkspaceId],
  );

  const onCreateChannel = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedWorkspaceId || !channelName.trim()) return;
      await withPending("createChannel", () =>
        createChannelMutation({
          workspaceId: selectedWorkspaceId as Id<"workspaces">,
          name: channelName.trim(),
          type: channelType,
        }),
      );
      setChannelName("");
    },
    [selectedWorkspaceId, channelName, channelType, createChannelMutation],
  );

  const onRemoveChannel = useCallback(
    async (channelId: string) => {
      await withPending("removeChannel", () =>
        removeChannelMutation({ channelId: channelId as Id<"channels"> }),
      );
    },
    [removeChannelMutation],
  );

  const onSendMessage = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedChannelId || !messageDraft.trim()) return;
      const draft = messageDraft.trim();
      setMessageDraft("");
      await withPending("sendMessage", () =>
        sendMessageMutation({
          channelId: selectedChannelId as Id<"channels">,
          content: draft,
        }),
      );
    },
    [selectedChannelId, messageDraft, sendMessageMutation, setMessageDraft],
  );

  const onGenerateInvite = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedWorkspaceId) return;
      const result = await withPending("generateInvite", () =>
        createInviteMutation({
          workspaceId: selectedWorkspaceId as Id<"workspaces">,
        }),
      );
      if (result) {
        setInviteLink(
          `${window.location.origin}/invite/${(result as { code: string }).code}`,
        );
      }
    },
    [selectedWorkspaceId, createInviteMutation],
  );

  const onJoinInvite = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const raw = inviteCode.trim();
      if (!raw) return;
      // Extract code from a full invite URL if pasted
      let code = raw;
      try {
        const url = new URL(raw);
        const match = url.pathname.match(/\/invite\/([^/?#]+)/);
        if (match?.[1]) code = decodeURIComponent(match[1]);
      } catch {
        // not a URL, use as-is
      }
      const workspaceId = await withPending("joinInvite", () =>
        joinInviteMutation({ code: code.toUpperCase() }),
      );
      if (workspaceId) {
        setInviteCode("");
        setSelectedWorkspaceId(workspaceId as string);
      }
    },
    [inviteCode, joinInviteMutation, setSelectedWorkspaceId],
  );

  const onUpdateSettings = useCallback(
    async (settings: {
      allowMemberChannelCreation?: boolean;
      allowMemberInviteCreation?: boolean;
    }) => {
      if (!selectedWorkspaceId) return;
      await withPending("updateSettings", () =>
        updateSettingsMutation({
          workspaceId: selectedWorkspaceId as Id<"workspaces">,
          ...settings,
        }),
      );
    },
    [selectedWorkspaceId, updateSettingsMutation],
  );

  const onUpdateMemberRole = useCallback(
    async (memberId: string, role: "ADMIN" | "MEMBER") => {
      await withPending("updateRole", () =>
        updateRoleMutation({ memberId: memberId as Id<"members">, role }),
      );
    },
    [updateRoleMutation],
  );

  const onKickMember = useCallback(
    async (memberId: string) => {
      await withPending("kickMember", () =>
        kickMemberMutation({ memberId: memberId as Id<"members"> }),
      );
    },
    [kickMemberMutation],
  );

  return {
    // form state
    workspaceName,
    setWorkspaceName,
    channelName,
    setChannelName,
    channelType,
    setChannelType,
    inviteCode,
    setInviteCode,
    inviteLink,
    setInviteLink,
    pendingMutations,
    mutationError,
    // handlers
    onCreateWorkspace,
    onCreateChannel,
    onRemoveChannel,
    onSendMessage,
    onGenerateInvite,
    onJoinInvite,
    onUpdateSettings,
    onUpdateMemberRole,
    onKickMember,
  };
}
