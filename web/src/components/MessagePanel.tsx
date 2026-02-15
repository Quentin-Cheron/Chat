import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hash, Mic, Send } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef } from "react";

type Channel = {
  _id: string;
  name: string;
  type: "TEXT" | "VOICE";
};

type Member = {
  _id: string;
  userId: string;
  name: string;
  email: string;
};

type Message = {
  _id: string;
  _creationTime: number;
  channelId: string;
  authorId: string;
  content: string;
  authorName: string;
};

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

  return (
    <div className="flex min-w-0 flex-col border-r border-surface-3 bg-surface-base">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-surface-3 px-4 py-3">
        {isVoiceChannel ? (
          <Mic className="h-4 w-4 text-accent" />
        ) : (
          <Hash className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="truncate font-semibold text-foreground">{title}</span>
        {isVoiceChannel && isInThisVoiceChannel && (
          <Badge className="border-accent/30 bg-accent/15 text-[10px] text-accent">
            Live · {voiceParticipants.length}
          </Badge>
        )}
      </div>

      {/* Voice notice */}
      {isVoiceChannel && (
        <div className="border-b border-surface-3 bg-surface p-3 text-center text-xs text-muted-foreground">
          {isInThisVoiceChannel
            ? `Connected — ${voiceParticipants.length} participant(s)`
            : "Voice channel — join from the right panel"}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {isVoiceChannel
              ? "No messages in this voice channel."
              : "No messages yet. Say hello!"}
          </div>
        ) : (
          <ul className="space-y-1">
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const sameUser = prevMsg && prevMsg.authorId === msg.authorId;
              const time = new Date(msg._creationTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
                  key={msg._id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg px-2 py-0.5 hover:bg-surface-3",
                    {
                      "mt-3": !sameUser,
                    },
                  )}
                >
                  {/* Avatar */}
                  {!sameUser ? (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-4 text-xs font-bold text-foreground">
                      {(msg.authorName ?? "?").charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    {!sameUser && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {msg.authorName ?? "Unknown"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {time}
                        </span>
                      </div>
                    )}
                    <p className="break-words text-sm text-foreground/90">
                      {msg.content}
                    </p>
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
        <div className="border-t border-surface-3 p-3">
          <form onSubmit={onSendMessage} className="flex items-center gap-2">
            <input
              value={messageDraft}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              placeholder={`Message ${selectedChannel ? `#${selectedChannel.name}` : "..."}`}
              disabled={!selectedChannelId}
              className="h-10 flex-1 rounded-xl border border-surface-3 bg-surface-3 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSendMessage(e as unknown as FormEvent);
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                !messageDraft.trim() || pendingMutations.has("sendMessage")
              }
              className="h-10 w-10 shrink-0 p-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
