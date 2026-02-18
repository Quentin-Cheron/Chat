import { Badge } from "@/components/ui/badge";
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  formatFileSize,
  isImage,
  uploadFile,
} from "@/lib/upload";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "@/types/files";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import {
  AtSign,
  Hash,
  Mic,
  Paperclip,
  Pencil,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = { _id: string; name: string; type: "TEXT" | "VOICE" };
type Member = { _id: string; userId: string; name: string; email: string };
type MessageAttachment = {
  storageKey: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
};
type Message = {
  _id: string;
  _creationTime: number;
  channelId: string;
  authorId: string;
  content: string;
  authorName: string;
  editedAt?: number;
  attachments?: MessageAttachment[];
};
type VoiceParticipant = { peerId: string; name: string; email: string };
type ReactionEntry = { emoji: string; userId: string };

type Props = {
  selectedDmMember: Member | null;
  selectedChannel: Channel | null;
  messages: Message[];
  messageDraft: string;
  onMessageDraftChange: (v: string) => void;
  onSendMessage: (e: FormEvent) => void;
  onSendMessageWithAttachments: (
    content: string,
    attachments: UploadedFile[],
  ) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  pendingMutations: Set<string>;
  voiceChannelId: string;
  voiceParticipants: VoiceParticipant[];
  selectedChannelId: string;
  currentUserId: string;
  canModerate: boolean;
  reactions: Record<string, ReactionEntry[]>;
  hasMoreMessages: boolean;
  onLoadMoreMessages: () => void;
  loadingMoreMessages: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500",
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AttachmentPreview({
  file,
  onRemove,
}: {
  file: UploadedFile;
  onRemove: () => void;
}) {
  return (
    <div className="relative flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
      {isImage(file.mimeType) ? (
        <img
          src={file.url}
          alt={file.name}
          className="h-12 w-12 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-card">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col overflow-hidden">
        <span className="max-w-[120px] truncate font-medium text-foreground">
          {file.name}
        </span>
        <span className="text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function MessageAttachments({
  attachments,
}: {
  attachments: MessageAttachment[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att, i) =>
        isImage(att.mimeType) ? (
          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
            <img
              src={att.url}
              alt={att.name}
              className="max-h-64 max-w-xs rounded-lg border border-border object-cover transition-opacity hover:opacity-90"
            />
          </a>
        ) : (
          <a
            key={i}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            download={att.name}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground hover:bg-muted/80"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-[200px] truncate">{att.name}</span>
            <span className="text-muted-foreground">
              {formatFileSize(att.size)}
            </span>
          </a>
        ),
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MessagePanel({
  selectedDmMember,
  selectedChannel,
  messages,
  messageDraft,
  onMessageDraftChange,
  onSendMessage,
  onSendMessageWithAttachments,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  pendingMutations,
  voiceChannelId,
  voiceParticipants,
  selectedChannelId,
  currentUserId,
  canModerate,
  reactions,
  hasMoreMessages,
  onLoadMoreMessages,
  loadingMoreMessages,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(
    null,
  );
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingMessageId) {
      requestAnimationFrame(() => editInputRef.current?.focus());
    }
  }, [editingMessageId]);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!reactionPickerFor) return;
    const handler = () => setReactionPickerFor(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [reactionPickerFor]);

  const isVoiceChannel = selectedChannel?.type === "VOICE";
  const isInThisVoiceChannel = voiceChannelId === selectedChannelId;

  const title = selectedDmMember
    ? selectedDmMember.name
    : selectedChannel
      ? selectedChannel.name
      : "Select a channel";

  // ── Input handlers ─────────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  };

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (pendingFiles.length > 0) {
      await onSendMessageWithAttachments(messageDraft, pendingFiles);
      setPendingFiles([]);
    } else {
      onSendMessage(e);
    }
  }

  function onEmojiSelect(emojiData: EmojiClickData) {
    const emoji = emojiData.emoji;
    const input = inputRef.current;
    if (!input) {
      onMessageDraftChange(messageDraft + emoji);
      return;
    }
    const start = input.selectionStart ?? messageDraft.length;
    const end = input.selectionEnd ?? messageDraft.length;
    const next = messageDraft.slice(0, start) + emoji + messageDraft.slice(end);
    onMessageDraftChange(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
    });
  }

  // ── File upload ────────────────────────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setUploadError(`"${oversized.name}" exceeds 50 MB limit`);
      e.target.value = "";
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(files.map(uploadFile));
      setPendingFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // ── Edit handlers ──────────────────────────────────────────────────────────

  function startEditing(msg: Message) {
    setEditingMessageId(msg._id);
    setEditContent(msg.content);
  }

  async function commitEdit() {
    if (!editingMessageId || !editContent.trim()) return;
    await onEditMessage(editingMessageId, editContent);
    setEditingMessageId(null);
    setEditContent("");
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditContent("");
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        {isVoiceChannel ? (
          <Mic className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-bold text-foreground">{title}</span>
        {isVoiceChannel && isInThisVoiceChannel && (
          <Badge className="ml-1 text-[10px]">
            Live · {voiceParticipants.length}
          </Badge>
        )}
        {selectedChannel && (
          <div className="ml-auto flex items-center gap-3">
            <span className="h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground">
              {isVoiceChannel ? "Voice Channel" : "Text Channel"}
            </span>
          </div>
        )}
      </div>

      {/* Voice banner */}
      {isVoiceChannel && (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-card/50 py-2 text-xs text-muted-foreground">
          <Mic className="h-3.5 w-3.5 text-primary" />
          {isInThisVoiceChannel
            ? `Connected — ${voiceParticipants.length} participant(s)`
            : "Voice channel — join from the right panel"}
        </div>
      )}

      {/* Messages scroll area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Load more */}
        {hasMoreMessages && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={onLoadMoreMessages}
              disabled={loadingMoreMessages}
              className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {loadingMoreMessages ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              {isVoiceChannel ? (
                <Mic className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Hash className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-bold text-foreground">
                Welcome to {isVoiceChannel ? "" : "#"}
                {title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isVoiceChannel
                  ? "This is a voice channel."
                  : "This is the beginning of this channel. Say hello!"}
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const sameUser = prevMsg && prevMsg.authorId === msg.authorId;
              const timeDiff = prevMsg
                ? msg._creationTime - prevMsg._creationTime
                : Infinity;
              const grouped = sameUser && timeDiff < 5 * 60 * 1000;
              const time = new Date(msg._creationTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              const avatarColor = getAvatarColor(msg.authorName ?? "?");
              const isOwn = msg.authorId === currentUserId;
              const canDelete = isOwn || canModerate;
              const isEditing = editingMessageId === msg._id;

              // Group reactions by emoji
              const msgReactions = reactions[msg._id] ?? [];
              const groupedReactions = QUICK_REACTIONS.map((emoji) => ({
                emoji,
                count: msgReactions.filter((r) => r.emoji === emoji).length,
                reacted: msgReactions.some(
                  (r) => r.emoji === emoji && r.userId === currentUserId,
                ),
              })).filter((r) => r.count > 0);

              return (
                <li
                  key={msg._id}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-md px-2 py-0.5 transition-colors hover:bg-muted/50",
                    !grouped && "mt-4",
                  )}
                >
                  {/* Avatar / timestamp col */}
                  <div className="w-10 shrink-0">
                    {!grouped ? (
                      <div
                        className={cn(
                          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white",
                          avatarColor,
                        )}
                      >
                        {(msg.authorName ?? "?").charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <span className="hidden pt-1 text-right text-[10px] leading-4 text-muted-foreground group-hover:block">
                        {time}
                      </span>
                    )}
                  </div>

                  {/* Message body */}
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {msg.authorName ?? "Unknown"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {time}
                        </span>
                      </div>
                    )}

                    {/* Inline edit */}
                    {isEditing ? (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          ref={editInputRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void commitEdit();
                            }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="flex-1 rounded-lg border border-primary/50 bg-input px-3 py-1 text-sm text-foreground focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void commitEdit()}
                          className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="break-words text-sm leading-relaxed text-foreground/90">
                          {msg.content}
                          {msg.editedAt && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (edited)
                            </span>
                          )}
                        </p>

                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <MessageAttachments attachments={msg.attachments} />
                        )}
                      </>
                    )}

                    {/* Reaction pills */}
                    {groupedReactions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {groupedReactions.map(({ emoji, count, reacted }) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              void onToggleReaction(msg._id, emoji)
                            }
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                              reacted
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-foreground hover:border-primary/30",
                            )}
                          >
                            {emoji} <span>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover action bar */}
                  {!isEditing && (
                    <div className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-card shadow-sm group-hover:flex">
                      {/* Reaction picker trigger */}
                      <div className="relative">
                        <button
                          type="button"
                          title="React"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactionPickerFor((prev) =>
                              prev === msg._id ? null : msg._id,
                            );
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Smile className="h-3.5 w-3.5" />
                        </button>

                        {reactionPickerFor === msg._id && (
                          <div
                            className="absolute right-0 top-8 z-50 flex gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  void onToggleReaction(msg._id, emoji);
                                  setReactionPickerFor(null);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-muted"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Edit (own messages only) */}
                      {isOwn && (
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => startEditing(msg)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Delete */}
                      {canDelete && (
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => void onDeleteMessage(msg._id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            <div ref={messagesEndRef} />
          </ul>
        )}
      </div>

      {/* Input area */}
      {!isVoiceChannel && (
        <div className="relative shrink-0 px-4 pb-4">
          {/* Emoji picker popover */}
          {showEmojiPicker && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowEmojiPicker(false)}
              />
              <div className="absolute bottom-full right-4 z-50 mb-2">
                <EmojiPicker
                  onEmojiClick={onEmojiSelect}
                  theme={Theme.DARK}
                  lazyLoadEmojis
                />
              </div>
            </>
          )}

          {/* Pending file previews */}
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <AttachmentPreview
                  key={i}
                  file={f}
                  onRemove={() =>
                    setPendingFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                />
              ))}
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <p className="mb-1 text-xs text-red-400">{uploadError}</p>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={handleFileSelect}
          />

          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 rounded-xl border border-border bg-input px-2 py-1.5 transition-colors focus-within:border-primary/50"
          >
            {/* File attach button */}
            <button
              type="button"
              title="Attach file"
              disabled={uploading || !selectedChannelId}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>

            <input
              ref={inputRef}
              value={messageDraft}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${selectedChannel ? `#${selectedChannel.name}` : "…"}`}
              disabled={!selectedChannelId}
              className="flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <AtSign className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowEmojiPicker((p) => !p)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  showEmojiPicker
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Smile className="h-4 w-4" />
              </button>

              <button
                type="submit"
                disabled={
                  (!messageDraft.trim() && pendingFiles.length === 0) ||
                  uploading ||
                  pendingMutations.has("sendMessage")
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
