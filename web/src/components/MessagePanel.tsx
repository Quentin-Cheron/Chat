import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { AtSign, Hash, Mic, Plus, Send, Smile } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

type Channel = { _id: string; name: string; type: "TEXT" | "VOICE" };
type Member = { _id: string; userId: string; name: string; email: string };
type Message = { _id: string; _creationTime: number; channelId: string; authorId: string; content: string; authorName: string };
type VoiceParticipant = { peerId: string; name: string; email: string };

type Props = {
  selectedDmMember: Member | null;
  selectedChannel: Channel | null;
  messages: Message[];
  messageDraft: string;
  onMessageDraftChange: (v: string) => void;
  onSendMessage: (e: FormEvent) => void;
  pendingMutations: Set<string>;
  voiceChannelId: string;
  voiceParticipants: VoiceParticipant[];
  selectedChannelId: string;
};

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-pink-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function MessagePanel({
  selectedDmMember,
  selectedChannel,
  messages,
  messageDraft,
  onMessageDraftChange,
  onSendMessage,
  pendingMutations,
  voiceChannelId,
  voiceParticipants,
  selectedChannelId,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isVoiceChannel = selectedChannel?.type === "VOICE";
  const isInThisVoiceChannel = voiceChannelId === selectedChannelId;

  const title = selectedDmMember
    ? selectedDmMember.name
    : selectedChannel
      ? selectedChannel.name
      : "Select a channel";

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage(e as unknown as FormEvent);
    }
  };

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
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
    });
  }

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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
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
                Welcome to {isVoiceChannel ? "" : "#"}{title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isVoiceChannel ? "This is a voice channel." : "This is the beginning of this channel. Say hello!"}
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const sameUser = prevMsg && prevMsg.authorId === msg.authorId;
              const timeDiff = prevMsg ? msg._creationTime - prevMsg._creationTime : Infinity;
              const grouped = sameUser && timeDiff < 5 * 60 * 1000;
              const time = new Date(msg._creationTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const avatarColor = getAvatarColor(msg.authorName ?? "?");

              return (
                <li
                  key={msg._id}
                  className={cn(
                    "group flex items-start gap-3 rounded-md px-2 py-0.5 transition-colors hover:bg-muted/50",
                    !grouped && "mt-4",
                  )}
                >
                  <div className="w-10 shrink-0">
                    {!grouped ? (
                      <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white", avatarColor)}>
                        {(msg.authorName ?? "?").charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <span className="hidden pt-1 text-right text-[10px] leading-4 text-muted-foreground group-hover:block">
                        {time}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-foreground">{msg.authorName ?? "Unknown"}</span>
                        <span className="text-[11px] text-muted-foreground">{time}</span>
                      </div>
                    )}
                    <p className="break-words text-sm leading-relaxed text-foreground/90">{msg.content}</p>
                  </div>
                </li>
              );
            })}
            <div ref={messagesEndRef} />
          </ul>
        )}
      </div>

      {/* Input */}
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

          <form
            onSubmit={onSendMessage}
            className="flex items-center gap-2 rounded-xl border border-border bg-input px-2 py-1.5 transition-colors focus-within:border-primary/50"
          >
            <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="h-4 w-4" />
            </button>
            <input
              ref={inputRef}
              value={messageDraft}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${selectedChannel ? `#${selectedChannel.name}` : "..."}`}
              disabled={!selectedChannelId}
              className="flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                <AtSign className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((p) => !p)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  showEmojiPicker
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Smile className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!messageDraft.trim() || pendingMutations.has("sendMessage")}
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
