'use client';

import React, { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, MessageCircle, Reply, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react';

interface RepliedMessage {
  id: number;
  sender_id: number;
  username: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER' | null;
  attendance_role: string | null;
  message: string | null;
  deleted_at: string | null;
}

interface ChatMessage {
  id: number;
  sender_id: number;
  username: string;
  real_name: string | null;
  profile_photo: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string | null;
  message: string;
  deleted_at: string | null;
  created_at: string;
  profile_photo_loaded?: boolean | number;
  reply_to_id?: number | null;
  reply_to?: RepliedMessage | null;
}

interface ChatApiResponse {
  success: boolean;
  data?: ChatMessage | ChatMessage[];
  error?: string;
  serverTime?: string;
}

interface ChatRoomProps {
  currentUserId: number;
  currentUserRole: 'USER' | 'ADMIN' | 'DEVELOPER';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

function formatAccountRole(message: Pick<ChatMessage, 'role' | 'attendance_role'>) {
  if (message.role === 'ADMIN') return 'Administrator';
  if (message.role === 'DEVELOPER') return 'Developer';
  return message.attendance_role || 'Staff';
}

export function ChatRoom({ currentUserId, currentUserRole }: ChatRoomProps) {
  const isDeveloper = currentUserRole === 'DEVELOPER';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const profilePhotosRef = useRef(new Map<number, string | null>());
  const messageCursorRef = useRef<number | null>(null);
  const deletionCursorRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const shouldScrollRef = useRef(true);
  const isLoadingMessagesRef = useRef(false);
  const initialMessagesLoadedRef = useRef(false);
  const initialScrollPositionedRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);

  const mergeMessages = useCallback((incoming: ChatMessage[], replace = false) => {
    if (replace) profilePhotosRef.current.clear();
    const byId = new Map((replace ? [] : messagesRef.current).map((message) => [message.id, message]));
    for (const message of incoming) {
      if (message.profile_photo_loaded || message.profile_photo !== null) {
        profilePhotosRef.current.set(message.sender_id, message.profile_photo);
      }
      if (message.deleted_at) {
        byId.delete(message.id);
        for (const [id, existingMessage] of byId) {
          if (existingMessage.reply_to_id !== message.id || !existingMessage.reply_to) continue;
          byId.set(id, {
            ...existingMessage,
            reply_to: {
              ...existingMessage.reply_to,
              message: '',
              deleted_at: message.deleted_at,
            },
          });
        }
      } else {
        byId.set(message.id, message);
      }
    }
    const unique = Array.from(byId.values())
      .map((message) => ({
        ...message,
        profile_photo: message.profile_photo ?? profilePhotosRef.current.get(message.sender_id) ?? null,
      }))
      .sort((left, right) => left.id - right.id);
    const latest = unique.slice(-100);
    messagesRef.current = latest;
    setMessages(latest);
  }, []);

  const loadMessages = useCallback(async (signal?: AbortSignal, initial = false) => {
    if (isLoadingMessagesRef.current) return;
    isLoadingMessagesRef.current = true;

    try {
      const cursor = messageCursorRef.current;
      const params = new URLSearchParams();
      if (cursor !== null) params.set('after', String(cursor));
      if (deletionCursorRef.current) params.set('deletedAfter', deletionCursorRef.current);
      const queryString = params.toString();
      const url = queryString ? `/api/chat/messages?${queryString}` : '/api/chat/messages';
      const response = await fetch(url, { cache: 'no-store', signal });
      const result = await response.json() as ChatApiResponse;

      if (!response.ok || !result.success || !Array.isArray(result.data) || !result.serverTime) {
        throw new Error(result.error || 'Gagal memuat pesan chat.');
      }

      if (cursor === null) {
        initialMessagesLoadedRef.current = true;
        messageCursorRef.current = result.data.at(-1)?.id ?? 0;
      } else {
        messageCursorRef.current = result.data.reduce(
          (latestId, message) => Math.max(latestId, message.id),
          cursor
        );
      }
      deletionCursorRef.current = result.serverTime;
      mergeMessages(result.data, cursor === null);
      setError(null);
    } catch (loadError: unknown) {
      if (loadError instanceof Error && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat pesan chat.');
    } finally {
      isLoadingMessagesRef.current = false;
      if (initial) setIsLoading(false);
    }
  }, [mergeMessages]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => {
      void loadMessages(controller.signal, true);
    }, 0);
    const interval = window.setInterval(() => void loadMessages(controller.signal), 4000);

    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    };
  }, [loadMessages]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (isLoading || !initialMessagesLoadedRef.current || !container) return;

    if (!initialScrollPositionedRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollPositionedRef.current = true;
    } else if (shouldScrollRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [isLoading, messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;

    setIsSending(true);
    setError(null);
    setDraft('');
    const replyToId = replyTarget?.id ?? null;
    setReplyTarget(null);
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, replyToId }),
      });
      const result = await response.json() as ChatApiResponse;

      if (!response.ok || !result.success || !result.data || Array.isArray(result.data)) {
        throw new Error(result.error || 'Gagal mengirim pesan.');
      }

      shouldScrollRef.current = true;
      mergeMessages([result.data]);
      messageCursorRef.current = Math.max(messageCursorRef.current ?? 0, result.data.id);
    } catch (sendError: unknown) {
      setDraft((currentDraft) => currentDraft || draft);
      setReplyTarget((currentTarget) => currentTarget || replyTarget);
      setError(sendError instanceof Error ? sendError.message : 'Gagal mengirim pesan.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (isDeveloper || !window.confirm('Hapus pesan ini untuk semua pengguna?') || deletingMessageId !== null) return;

    setDeletingMessageId(message.id);
    setError(null);
    try {
      const response = await fetch(`/api/chat/messages/${message.id}`, { method: 'DELETE' });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menghapus pesan.');
      }

      mergeMessages([{ ...message, message: '', deleted_at: new Date().toISOString() }]);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Gagal menghapus pesan.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const isOwnMessage = (message: ChatMessage) => message.sender_id === currentUserId;
  const getProfileHref = (message: ChatMessage) =>
    currentUserRole === 'ADMIN' ? `/admin/users/${message.sender_id}` : `/staff/${message.sender_id}`;

  const handleReply = (message: ChatMessage) => {
    setReplyTarget(message);
    composerRef.current?.focus();
  };

  const handleQuotedMessageClick = (messageId: number) => {
    const target = document.getElementById(`chat-message-${messageId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1500);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <section className="flex h-[calc(100dvh-9rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#161b22]">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-700">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-white">Chat Staff &amp; Admin</h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Grup bersama untuk staff dan admin JRR</p>
        </div>
        <div className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:flex dark:bg-emerald-900/30 dark:text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Grup internal
        </div>
      </header>

      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-6 dark:bg-[#0d1117]"
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        aria-live="polite"
        aria-label="Riwayat pesan chat"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat pesan...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <MessageCircle className="h-7 w-7" />
            </div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Mulai obrolan</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              {isDeveloper
                ? 'Belum ada pesan di grup staff dan admin.'
                : 'Kirim pesan pertama untuk memulai percakapan dengan staff dan admin.'}
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const ownMessage = isOwnMessage(message);
            const canDelete = !isDeveloper && (ownMessage || currentUserRole === 'ADMIN');
            const senderName = message.username;
            const profileHref = getProfileHref(message);

            return (
              <div
                key={message.id}
                id={`chat-message-${message.id}`}
                className={`flex scroll-m-4 rounded-xl transition-colors duration-500 ${
                  ownMessage ? 'justify-end' : 'justify-start'
                } ${highlightedMessageId === message.id ? 'bg-blue-100/70 dark:bg-blue-900/30' : ''}`}
              >
                <div className="flex max-w-[92%] items-end gap-2 sm:max-w-[80%]">
                  <Link
                    href={profileHref}
                    aria-label={`Lihat profil ${senderName}`}
                    title={`Lihat profil ${senderName}`}
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600 ring-1 ring-slate-300 transition hover:ring-blue-500 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
                  >
                    {message.profile_photo ? (
                      <Image
                        src={message.profile_photo}
                        alt=""
                        width={32}
                        height={32}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">{senderName.charAt(0)}</span>
                    )}
                  </Link>
                  <article className={`min-w-0 rounded-2xl px-3.5 py-2.5 shadow-sm ${
                    ownMessage
                      ? 'rounded-br-sm bg-blue-600 text-white'
                      : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#161b22] dark:text-slate-100'
                  }`}>
                    {message.reply_to && (
                      <button
                        type="button"
                        onClick={() => handleQuotedMessageClick(message.reply_to!.id)}
                        disabled={Boolean(message.reply_to.deleted_at)}
                        className="mb-2 block w-full rounded-lg border-l-2 border-blue-400 bg-black/5 px-2.5 py-1.5 text-left transition hover:bg-black/10 disabled:cursor-default disabled:hover:bg-black/5 dark:bg-white/5 dark:hover:bg-white/10"
                        aria-label={`Balasan untuk ${message.reply_to.username || 'pesan yang dihapus'}`}
                      >
                        <span className={`block truncate text-[11px] font-bold ${
                          ownMessage ? 'text-blue-100' : 'text-blue-700 dark:text-blue-300'
                        }`}>
                          {message.reply_to.deleted_at
                            ? 'Pesan telah dihapus'
                            : `${message.reply_to.username || 'Pengguna'} - ${formatAccountRole({
                                role: message.reply_to.role || 'USER',
                                attendance_role: message.reply_to.attendance_role,
                              })}`}
                        </span>
                        <span className={`block truncate text-xs ${
                          ownMessage ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'
                        }`}>
                          {message.reply_to.deleted_at
                            ? 'Pesan ini sudah tidak tersedia'
                            : message.reply_to.message}
                        </span>
                      </button>
                    )}
                    <div className="mb-1 flex items-center gap-1.5">
                      <Link
                        href={profileHref}
                        className={`max-w-48 truncate text-xs font-bold hover:underline ${
                          ownMessage ? 'text-blue-50' : 'text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {senderName}
                      </Link>
                      <span className={`truncate text-[10px] ${ownMessage ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        - {formatAccountRole(message)}
                      </span>
                      {message.role === 'ADMIN' && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          Admin
                        </span>
                      )}
                      {ownMessage && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-blue-100">Anda</span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.message}</p>
                    <time
                      className={`mt-1 block text-right text-[10px] ${ownMessage ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}
                      dateTime={message.created_at}
                      title={new Date(message.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                    >
                      {formatMessageTime(message.created_at)}
                    </time>
                  </article>
                  <button
                    type="button"
                    onClick={() => handleReply(message)}
                    aria-label={`Balas pesan dari ${senderName}`}
                    title={`Balas ${senderName}`}
                    className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                  >
                    <Reply className="h-4 w-4" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteMessage(message)}
                      disabled={deletingMessageId !== null}
                      aria-label={`Hapus pesan dari ${senderName}`}
                      title={ownMessage ? 'Hapus pesan untuk semua' : 'Admin: hapus pesan untuk semua'}
                      className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                    >
                      {deletingMessageId === message.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div role="alert" className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3 sm:px-5 sm:py-4 dark:border-slate-700 dark:bg-[#161b22]">
        {replyTarget && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border-l-4 border-blue-500 bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Membalas {replyTarget.username} - {formatAccountRole(replyTarget)}
              </p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-300">{replyTarget.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              aria-label="Batal membalas"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 sm:gap-3">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            maxLength={2000}
            rows={1}
            placeholder="Tulis pesan..."
            aria-label="Tulis pesan"
            className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-[#0d1117] dark:text-white"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            aria-label="Kirim pesan"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-[#161b22]"
          >
            {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </section>
  );
}
