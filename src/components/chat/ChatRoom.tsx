'use client';

import React, { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Loader2, MessageCircle, MoreVertical, Reply, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

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
  deletedCount?: number;
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
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<ChatMessage | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState<number | null>(null);
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
  const messageActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openMessageActionsId === null) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!messageActionsRef.current?.contains(event.target as Node)) {
        setOpenMessageActionsId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMessageActionsId(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMessageActionsId]);

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
    if (isDeveloper || deletingMessageId !== null) return;

    setDeletingMessageId(message.id);
    setError(null);
    try {
      const response = await fetch(`/api/chat/messages/${message.id}`, { method: 'DELETE' });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menghapus pesan.');
      }

      mergeMessages([{ ...message, message: '', deleted_at: new Date().toISOString() }]);
      setPendingDeleteMessage(null);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Gagal menghapus pesan.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleToggleMessageSelection = (messageId: number) => {
    setSelectedMessageIds((selectedIds) =>
      selectedIds.includes(messageId)
        ? selectedIds.filter((selectedId) => selectedId !== messageId)
        : [...selectedIds, messageId]
    );
  };

  const handleSelectAllDeletableMessages = () => {
    setSelectedMessageIds(messages.filter(canDeleteMessage).map((message) => message.id));
  };

  const handleBulkDeleteMessages = async () => {
    if (isDeveloper || selectedMessages.length === 0 || deletingMessageId !== null) return;

    setDeletingMessageId(-1);
    setError(null);
    try {
      const response = await fetch('/api/chat/messages/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedMessages.map((message) => message.id) }),
      });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success || typeof result.deletedCount !== 'number') {
        throw new Error(result.error || 'Gagal menghapus pesan.');
      }

      const deletedAt = new Date().toISOString();
      mergeMessages(selectedMessages.map((message) => ({ ...message, message: '', deleted_at: deletedAt })));
      setSelectedMessageIds([]);
      setPendingBulkDelete(false);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Gagal menghapus pesan.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const isOwnMessage = (message: ChatMessage) => message.sender_id === currentUserId;
  const canDeleteMessage = (message: ChatMessage) =>
    !isDeveloper && (isOwnMessage(message) || currentUserRole === 'ADMIN');
  const selectedMessages = messages.filter((message) => selectedMessageIds.includes(message.id));
  const getProfileHref = (message: ChatMessage) =>
    currentUserRole === 'ADMIN' ? `/admin/users/${message.sender_id}` : `/staff/${message.sender_id}`;

  const handleReply = (message: ChatMessage) => {
    setOpenMessageActionsId(null);
    setReplyTarget(message);
    composerRef.current?.focus();
  };

  const handleSelectAllMessages = () => {
    setSelectedMessageIds(messages.map((message) => message.id));
    setOpenMessageActionsId(null);
  };

  const handleQuotedMessageClick = (messageId: number) => {
    const target = document.getElementById(`chat-message-${messageId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1500);
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
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

      {selectedMessages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
            {selectedMessages.length} pesan dipilih
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {selectedMessages.length < messages.filter(canDeleteMessage).length && (
              <button
                type="button"
                onClick={handleSelectAllDeletableMessages}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50"
              >
                Pilih semua yang bisa dihapus
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedMessageIds([])}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Batal pilih
            </button>
            <button
              type="button"
              onClick={() => setPendingBulkDelete(true)}
              disabled={deletingMessageId !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus dipilih
            </button>
          </div>
        </div>
      )}

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
            const canDelete = canDeleteMessage(message);
            const isSelected = selectedMessageIds.includes(message.id);
            const senderName = message.username;
            const profileHref = getProfileHref(message);

            return (
              <div
                key={message.id}
                id={`chat-message-${message.id}`}
                className={`flex scroll-m-4 rounded-xl transition-colors duration-500 ${
                  ownMessage ? 'justify-end' : 'justify-start'
                } ${isSelected ? 'bg-rose-100/70 dark:bg-rose-950/30' : highlightedMessageId === message.id ? 'bg-blue-100/70 dark:bg-blue-900/30' : ''}`}
              >
                <div className="flex max-w-[92%] items-end gap-2 sm:max-w-[80%]">
                  <Link
                    href={profileHref}
                    aria-label={`Lihat profil ${senderName}`}
                    title={`Lihat profil ${senderName}`}
                    className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600 ring-1 ring-slate-300 transition hover:ring-blue-500 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
                  >
                    {message.profile_photo ? (
                      <ProtectedProfilePhoto
                        src={message.profile_photo}
                        alt=""
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
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.message}</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`truncate text-[10px] ${ownMessage ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {formatAccountRole(message)}
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
                      <time
                        className={`shrink-0 text-[10px] ${ownMessage ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}
                        dateTime={message.created_at}
                        title={new Date(message.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                      >
                        {formatMessageTime(message.created_at)}
                      </time>
                    </div>
                  </article>
                  <div
                    ref={openMessageActionsId === message.id ? messageActionsRef : null}
                    className="relative mb-1 shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenMessageActionsId((openId) => openId === message.id ? null : message.id)}
                      aria-label={`Aksi pesan dari ${senderName}`}
                      aria-haspopup="true"
                      aria-expanded={openMessageActionsId === message.id}
                      title="Aksi pesan"
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                        isSelected
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMessageActionsId === message.id && (
                      <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#161b22]">
                        <button
                          type="button"
                          onClick={() => handleReply(message)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Reply className="h-4 w-4" />
                          Balas pesan
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              handleToggleMessageSelection(message.id);
                              setOpenMessageActionsId(null);
                            }}
                            disabled={deletingMessageId !== null}
                            aria-pressed={isSelected}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <span className="flex h-4 w-4 items-center justify-center rounded border border-current">
                              {isSelected && <span className="h-2 w-2 rounded-sm bg-current" />}
                            </span>
                            {isSelected ? 'Batalkan pilihan' : 'Pilih pesan'}
                          </button>
                        )}
                        {currentUserRole === 'ADMIN' && selectedMessageIds.length < messages.length && (
                          <button
                            type="button"
                            onClick={handleSelectAllMessages}
                            disabled={deletingMessageId !== null}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <ListChecks className="h-4 w-4" />
                            Pilih semua pesan di chat
                          </button>
                        )}
                        {canDelete && (
                          <>
                            <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                            <button
                              type="button"
                              onClick={() => {
                                setPendingDeleteMessage(message);
                                setOpenMessageActionsId(null);
                              }}
                              disabled={deletingMessageId !== null}
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              {deletingMessageId === message.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                              Hapus pesan untuk semua
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
      {(pendingDeleteMessage || pendingBulkDelete) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && deletingMessageId === null) {
              setPendingDeleteMessage(null);
              setPendingBulkDelete(false);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-message-title"
            aria-describedby="delete-chat-message-description"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#161b22]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 id="delete-chat-message-title" className="text-base font-bold text-slate-900 dark:text-white">
                  {pendingBulkDelete ? `Hapus ${selectedMessages.length} pesan?` : 'Hapus pesan?'}
                </h2>
                <p id="delete-chat-message-description" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {pendingBulkDelete
                    ? 'Pesan yang dipilih akan dihapus untuk semua pengguna dan tindakan ini tidak dapat dibatalkan.'
                    : 'Pesan ini akan dihapus untuk semua pengguna dan tindakan ini tidak dapat dibatalkan.'}
                </p>
                {pendingDeleteMessage && !pendingBulkDelete && (
                  <p className="mt-3 line-clamp-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-[#0d1117] dark:text-slate-300">
                    {pendingDeleteMessage.message}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDeleteMessage(null);
                  setPendingBulkDelete(false);
                }}
                disabled={deletingMessageId !== null}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingBulkDelete) {
                    void handleBulkDeleteMessages();
                  } else if (pendingDeleteMessage) {
                    void handleDeleteMessage(pendingDeleteMessage);
                  }
                }}
                disabled={deletingMessageId !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingMessageId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
                {pendingBulkDelete ? `Hapus ${selectedMessages.length} pesan` : 'Hapus untuk semua'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
