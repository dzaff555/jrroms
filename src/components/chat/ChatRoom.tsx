'use client';

import React, { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Download, Headphones, Loader2, MessageCircle, Mic, MoreVertical, Paperclip, Pause, Play, Reply, RotateCcw, Send, ShieldCheck, Smile, Star, Trash2, Users, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';
import { MAX_CHAT_AUDIO_SIZE, MAX_CHAT_PHOTO_SIZE, MAX_CHAT_VIDEO_SIZE } from '@/lib/chat/constants';

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
  media_url?: string | null;
  media_type?: string | null;
  is_sticker?: boolean | number;
}

interface FavoriteSticker {
  id: number;
  image_type: string;
  source_message_id: number | null;
  media_url: string;
}

interface ChatApiResponse {
  success: boolean;
  data?: ChatMessage | ChatMessage[];
  error?: string;
  serverTime?: string;
  deletedCount?: number;
}

interface FavoriteStickersApiResponse {
  success: boolean;
  data?: FavoriteSticker[];
  error?: string;
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

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function ChatAudioPlayer({
  src,
  senderName,
  profilePhoto,
  onDownload,
  ownMessage,
  knownDuration,
}: {
  src: string;
  senderName: string;
  profilePhoto: string | null;
  onDownload: () => void;
  ownMessage: boolean;
  knownDuration?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration || 0);
  const [waveformHeights, setWaveformHeights] = useState<number[]>([]);
  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    let cancelled = false;
    let audioContext: AudioContext | null = null;

    const loadWaveform = async () => {
      try {
        const response = await fetch(src, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Gagal memuat audio untuk waveform (${response.status}).`);

        const audioData = await response.arrayBuffer();
        if (cancelled) return;
        audioContext = new AudioContext();
        const decodedAudio = await audioContext.decodeAudioData(audioData);
        if (cancelled) return;

        const sampleCount = decodedAudio.length;
        const channelData = Array.from(
          { length: decodedAudio.numberOfChannels },
          (_, channel) => decodedAudio.getChannelData(channel)
        );
        const bars = Array.from({ length: 36 }, (_, index) => {
          const start = Math.floor(index * sampleCount / 36);
          const end = Math.max(start + 1, Math.floor((index + 1) * sampleCount / 36));
          let peak = 0;
          for (const channel of channelData) {
            for (let sampleIndex = start; sampleIndex < Math.min(end, sampleCount); sampleIndex += 1) {
              peak = Math.max(peak, Math.abs(channel[sampleIndex]));
            }
          }
          return peak;
        });
        const maximumPeak = Math.max(...bars);
        setWaveformHeights(bars.map((peak) =>
          maximumPeak > 0 ? Math.round(4 + (peak / maximumPeak) * 20) : 4
        ));
        setDuration((currentDuration) => currentDuration || decodedAudio.duration);
      } catch (waveformError: unknown) {
        if (!cancelled) {
          console.error('[Chat audio waveform Error]:', waveformError);
        }
      } finally {
        if (audioContext && audioContext.state !== 'closed') {
          await audioContext.close();
        }
      }
    };

    void loadWaveform();
    return () => {
      cancelled = true;
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close();
      }
    };
  }, [src]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setHasPlaybackError(false);
      void audio.play().catch(() => {
        setIsPlaying(false);
        setHasPlaybackError(true);
      });
    } else {
      audio.pause();
    }
  };

  return (
    <div className={`flex w-72 max-w-full items-center gap-2 rounded-2xl p-2 ${
      ownMessage
        ? 'bg-white/10'
        : 'bg-slate-100 dark:bg-slate-800/80'
    }`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        controls={hasPlaybackError}
        className={hasPlaybackError ? 'mt-1 h-8 w-full' : 'hidden'}
        onError={() => setHasPlaybackError(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const mediaDuration = event.currentTarget.duration;
          if (Number.isFinite(mediaDuration) && mediaDuration > 0) setDuration(mediaDuration);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        {profilePhoto ? (
          <ProtectedProfilePhoto src={profilePhoto} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-amber-500 text-white">
            <Headphones className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-8 items-center gap-1">
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={`${isPlaying ? 'Jeda' : 'Putar'} audio dari ${senderName}`}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
              ownMessage
                ? 'text-emerald-300 hover:bg-white/10'
                : 'text-emerald-700 hover:bg-emerald-900/10 dark:text-emerald-300 dark:hover:bg-white/10'
            }`}
          >
            {isPlaying
              ? <Pause className="h-4 w-4 fill-current" />
              : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
          <div className="relative flex h-8 min-w-0 flex-1 items-center gap-[2px]">
            {Array.from({ length: 36 }, (_, index) => {
              const height = waveformHeights[index] ?? 4;
              return (
                <span
                  key={index}
                  className={`flex-1 rounded-full ${
                    index / 36 <= progress
                      ? 'bg-emerald-400'
                      : ownMessage
                        ? 'bg-blue-100/50'
                        : 'bg-emerald-800/35 dark:bg-emerald-100/40'
                  }`}
                  style={{ height }}
                />
              );
            })}
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => {
                const audio = audioRef.current;
                if (audio) audio.currentTime = Number(event.target.value);
              }}
              aria-label="Posisi audio"
              className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
            />
          </div>
        </div>
        <div className={`flex items-center justify-between text-[10px] ${
          ownMessage ? 'text-blue-100' : 'text-slate-600 dark:text-slate-300'
        }`}>
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDownload}
        aria-label={`Unduh audio dari ${senderName}`}
        title="Unduh audio"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
          ownMessage
            ? 'text-blue-100 hover:bg-white/10'
            : 'text-slate-600 hover:bg-emerald-950/10 dark:text-slate-200 dark:hover:bg-white/10'
        }`}
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

function renderMessageWithLinks(message: string, ownMessage: boolean) {
  const urlPattern = /https?:\/\/[^\s<>]+|(?:www\.)?[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+(?:\/[^\s<>]*)?/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of message.matchAll(urlPattern)) {
    const matchedUrl = match[0];
    const matchIndex = match.index;
    let linkText = matchedUrl.replace(/[.,!?;:]+$/, '');
    while (/[)\]}]$/.test(linkText)) {
      const closingCharacter = linkText.at(-1);
      const openingCharacter = closingCharacter === ')' ? '(' : closingCharacter === ']' ? '[' : '{';
      if (linkText.split(openingCharacter).length >= linkText.split(closingCharacter!).length) break;
      linkText = linkText.slice(0, -1);
    }

    if (!linkText) continue;
    if (matchIndex > lastIndex) parts.push(message.slice(lastIndex, matchIndex));

    const href = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
    let parsedUrl: URL | null = null;
    try {
      const candidateUrl = new URL(href);
      if (candidateUrl.protocol === 'http:' || candidateUrl.protocol === 'https:') {
        parsedUrl = candidateUrl;
      }
    } catch {
      parsedUrl = null;
    }

    if (parsedUrl) {
      parts.push(
        <a
          key={`${matchIndex}-${linkText}`}
          href={parsedUrl.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`break-all underline underline-offset-2 ${
            ownMessage
              ? 'text-blue-100 hover:text-white'
              : 'text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100'
          }`}
        >
          {linkText}
        </a>
      );
    } else {
      parts.push(linkText);
    }
    parts.push(matchedUrl.slice(linkText.length));
    lastIndex = matchIndex + matchedUrl.length;
  }

  if (lastIndex < message.length) parts.push(message.slice(lastIndex));
  return parts;
}

export function ChatRoom({ currentUserId, currentUserRole }: ChatRoomProps) {
  const isDeveloper = currentUserRole === 'DEVELOPER';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isVoiceRecordingPaused, setIsVoiceRecordingPaused] = useState(false);
  const [voiceRecordingDuration, setVoiceRecordingDuration] = useState(0);
  const [recordedVoiceDuration, setRecordedVoiceDuration] = useState(0);
  const [favoriteStickers, setFavoriteStickers] = useState<FavoriteSticker[]>([]);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [photoViewer, setPhotoViewer] = useState<{ url: string; senderName: string } | null>(null);
  const [videoViewer, setVideoViewer] = useState<{ url: string; senderName: string; message: ChatMessage } | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffset, setPhotoOffset] = useState({ x: 0, y: 0 });
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<ChatMessage | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const [isMessageSelectionMode, setIsMessageSelectionMode] = useState(false);
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
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceElapsedMsRef = useRef(0);
  const voiceSegmentStartedAtRef = useRef<number | null>(null);
  const attachmentPreviewUrlRef = useRef<string | null>(null);
  const photoViewerRef = useRef<HTMLDivElement>(null);
  const photoImageRef = useRef<HTMLImageElement>(null);
  const photoDragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const shouldScrollRef = useRef(true);
  const isLoadingMessagesRef = useRef(false);
  const initialMessagesLoadedRef = useRef(false);
  const initialScrollPositionedRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const messageActionsRef = useRef<HTMLDivElement>(null);

  const updateAttachment = useCallback((file: File | null) => {
    if (attachmentPreviewUrlRef.current) URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    const previewUrl = file ? URL.createObjectURL(file) : null;
    attachmentPreviewUrlRef.current = previewUrl;
    setAttachmentPreviewUrl(previewUrl);
    setAttachmentFile(file);
  }, []);

  const loadFavoriteStickers = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/stickers', { cache: 'no-store' });
      const result = await response.json() as FavoriteStickersApiResponse;
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || 'Gagal memuat stiker favorit.');
      }
      setFavoriteStickers(result.data);
    } catch (stickerError: unknown) {
      setError(stickerError instanceof Error ? stickerError.message : 'Gagal memuat stiker favorit.');
    }
  }, []);

  useEffect(() => () => {
    if (attachmentPreviewUrlRef.current) URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!isRecordingVoice || isVoiceRecordingPaused) return;
    const timer = window.setInterval(() => {
      const segmentStartedAt = voiceSegmentStartedAtRef.current;
      const elapsed = voiceElapsedMsRef.current +
        (segmentStartedAt === null ? 0 : performance.now() - segmentStartedAt);
      setVoiceRecordingDuration(Math.floor(elapsed / 1000));
    }, 200);
    return () => window.clearInterval(timer);
  }, [isRecordingVoice, isVoiceRecordingPaused]);

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

  useEffect(() => {
    if (!photoViewer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhotoViewer(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [photoViewer]);

  useEffect(() => {
    if (!videoViewer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVideoViewer(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoViewer]);

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
    const attachment = attachmentFile;
    if ((!message && !attachment) || isSending) return;

    setIsSending(true);
    setError(null);
    setDraft('');
    updateAttachment(null);
    const replyToId = replyTarget?.id ?? null;
    setReplyTarget(null);
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (attachment) {
        const form = new FormData();
        form.set('message', message);
        if (replyToId !== null) form.set('replyToId', String(replyToId));
        form.set('attachment', attachment);
        body = form;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({ message, replyToId });
      }
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers,
        body,
      });
      const result = await response.json() as ChatApiResponse;

      if (!response.ok || !result.success || !result.data || Array.isArray(result.data)) {
        throw new Error(result.error || 'Gagal mengirim pesan.');
      }

      shouldScrollRef.current = true;
      mergeMessages([result.data]);
      messageCursorRef.current = Math.max(messageCursorRef.current ?? 0, result.data.id);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      setRecordedVoiceDuration(0);
    } catch (sendError: unknown) {
      setDraft((currentDraft) => currentDraft || draft);
      if (attachment) updateAttachment(attachment);
      setReplyTarget((currentTarget) => currentTarget || replyTarget);
      setError(sendError instanceof Error ? sendError.message : 'Gagal mengirim pesan.');
    } finally {
      setIsSending(false);
    }
  };

  const startVoiceRecording = async () => {
    if (isSending || isRecordingVoice || attachmentFile) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Perekam suara tidak didukung di browser ini.');
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const segmentStartedAt = voiceSegmentStartedAtRef.current;
        const elapsedMs = voiceElapsedMsRef.current +
          (segmentStartedAt === null ? 0 : performance.now() - segmentStartedAt);
        const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));
        voiceElapsedMsRef.current = 0;
        voiceSegmentStartedAtRef.current = null;
        setVoiceRecordingDuration(durationSeconds);
        setRecordedVoiceDuration(durationSeconds);
        const recordedMimeType = recorder.mimeType.split(';')[0] || voiceChunksRef.current[0]?.type.split(';')[0] || 'audio/webm';
        const blob = new Blob(voiceChunksRef.current, { type: recordedMimeType });
        voiceChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        voiceRecorderRef.current = null;
        setIsRecordingVoice(false);
        setIsVoiceRecordingPaused(false);

        if (blob.size < 1) {
          setError('Rekaman suara kosong. Coba rekam kembali.');
          return;
        }
        if (blob.size > MAX_CHAT_AUDIO_SIZE) {
          setError('Ukuran voice note maksimal 15 MB. Rekam suara yang lebih pendek.');
          return;
        }

        const extensionByType: Record<string, string> = {
          'audio/mp4': 'm4a',
          'audio/ogg': 'ogg',
          'audio/webm': 'webm',
        };
        const extension = extensionByType[recordedMimeType];
        if (!extension) {
          setError('Format rekaman suara tidak didukung.');
          return;
        }
        updateAttachment(new File([blob], `voice-note.${extension}`, { type: recordedMimeType }));
      };

      voiceRecorderRef.current = recorder;
      voiceElapsedMsRef.current = 0;
      voiceSegmentStartedAtRef.current = performance.now();
      setVoiceRecordingDuration(0);
      setRecordedVoiceDuration(0);
      setIsVoiceRecordingPaused(false);
      recorder.start(250);
      setIsRecordingVoice(true);
    } catch (recordError: unknown) {
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      setError(
        recordError instanceof Error && recordError.name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak. Izinkan akses mikrofon lalu coba lagi.'
          : recordError instanceof Error
            ? `Gagal memulai rekaman suara: ${recordError.message}`
            : 'Gagal memulai rekaman suara.'
      );
    }
  };

  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const toggleVoiceRecordingPause = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      const segmentStartedAt = voiceSegmentStartedAtRef.current;
      if (segmentStartedAt !== null) {
        voiceElapsedMsRef.current += performance.now() - segmentStartedAt;
      }
      voiceSegmentStartedAtRef.current = null;
      recorder.pause();
      setVoiceRecordingDuration(Math.floor(voiceElapsedMsRef.current / 1000));
      setIsVoiceRecordingPaused(true);
    } else if (recorder.state === 'paused') {
      voiceSegmentStartedAtRef.current = performance.now();
      recorder.resume();
      setIsVoiceRecordingPaused(false);
    }
  };

  const handleSendSticker = async (source: { file: File } | { favoriteId: number }) => {
    if (isSending) return;

    setIsSending(true);
    setError(null);
    const replyToId = replyTarget?.id ?? null;
    setReplyTarget(null);
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if ('file' in source) {
        const form = new FormData();
        form.set('message', '');
        if (replyToId !== null) form.set('replyToId', String(replyToId));
        form.set('attachment', source.file);
        form.set('isSticker', 'true');
        body = form;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({ message: '', replyToId, stickerId: source.favoriteId });
      }

      const response = await fetch('/api/chat/messages', { method: 'POST', headers, body });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success || !result.data || Array.isArray(result.data)) {
        throw new Error(result.error || 'Gagal mengirim stiker.');
      }
      shouldScrollRef.current = true;
      mergeMessages([result.data]);
      messageCursorRef.current = Math.max(messageCursorRef.current ?? 0, result.data.id);
      setIsStickerPickerOpen(false);
    } catch (sendError: unknown) {
      setReplyTarget((currentTarget) => currentTarget || replyTarget);
      setError(sendError instanceof Error ? sendError.message : 'Gagal mengirim stiker.');
    } finally {
      setIsSending(false);
    }
  };

  const handleAddStickerToFavorites = async (messageId: number) => {
    setOpenMessageActionsId(null);
    setError(null);
    try {
      const response = await fetch('/api/chat/stickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menambahkan stiker ke favorit.');
      }
      await loadFavoriteStickers();
    } catch (stickerError: unknown) {
      setError(stickerError instanceof Error ? stickerError.message : 'Gagal menambahkan stiker ke favorit.');
    }
  };

  const handleRemoveFavoriteSticker = async (stickerId: number) => {
    setError(null);
    try {
      const response = await fetch(`/api/chat/stickers/${stickerId}`, { method: 'DELETE' });
      const result = await response.json() as { success: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menghapus stiker favorit.');
      }
      setFavoriteStickers((stickers) => stickers.filter((sticker) => sticker.id !== stickerId));
    } catch (stickerError: unknown) {
      setError(stickerError instanceof Error ? stickerError.message : 'Gagal menghapus stiker favorit.');
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
    setIsMessageSelectionMode(true);
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

  const handleDownloadPhoto = async () => {
    if (!photoViewer) return;

    try {
      const response = await fetch(photoViewer.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Gagal mengunduh foto.');

      const image = await response.blob();
      const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const extension = extensionByType[image.type];
      if (!extension) throw new Error('Format foto tidak didukung untuk diunduh.');

      const downloadUrl = URL.createObjectURL(image);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `foto-chat.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (downloadError: unknown) {
      setError(downloadError instanceof Error ? downloadError.message : 'Gagal mengunduh foto.');
    }
  };

  const handleDownloadVideo = async (message: ChatMessage) => {
    if (!message.media_url) return;

    try {
      const response = await fetch(message.media_url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Gagal mengunduh video.');

      const video = await response.blob();
      const extensionByType: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
      };
      const extension = extensionByType[message.media_type || video.type];
      if (!extension) throw new Error('Format video tidak didukung untuk diunduh.');

      const downloadUrl = URL.createObjectURL(video);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `video-chat-${message.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (downloadError: unknown) {
      setError(downloadError instanceof Error ? downloadError.message : 'Gagal mengunduh video.');
    }
  };

  const handleDownloadAudio = async (message: ChatMessage) => {
    if (!message.media_url) return;

    try {
      const response = await fetch(message.media_url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Gagal mengunduh audio.');

      const audio = await response.blob();
      const extensionByType: Record<string, string> = {
        'audio/aac': 'aac',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
        'audio/webm': 'webm',
      };
      const extension = extensionByType[message.media_type || audio.type];
      if (!extension) throw new Error('Format audio tidak didukung untuk diunduh.');

      const downloadUrl = URL.createObjectURL(audio);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `audio-chat-${message.id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (downloadError: unknown) {
      setError(downloadError instanceof Error ? downloadError.message : 'Gagal mengunduh audio.');
    }
  };

  const changePhotoZoom = (amount: number) => {
    setPhotoZoom((zoom) => {
      const nextZoom = Math.min(4, Math.max(1, Math.round((zoom + amount) * 10) / 10));
      if (nextZoom === 1) setPhotoOffset({ x: 0, y: 0 });
      return nextZoom;
    });
  };

  const handlePhotoPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (photoZoom <= 1 || event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    photoDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: photoOffset.x,
      offsetY: photoOffset.y,
    };
    setIsDraggingPhoto(true);
  };

  const handlePhotoPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = photoDragRef.current;
    const container = photoViewerRef.current;
    const image = photoImageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !container || !image) return;

    const fitScale = Math.min(
      container.clientWidth / image.naturalWidth,
      container.clientHeight / image.naturalHeight
    );
    const maxX = Math.max(0, (image.naturalWidth * fitScale * photoZoom - container.clientWidth) / 2);
    const maxY = Math.max(0, (image.naturalHeight * fitScale * photoZoom - container.clientHeight) / 2);
    const x = drag.offsetX + event.clientX - drag.x;
    const y = drag.offsetY + event.clientY - drag.y;
    setPhotoOffset({
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    });
  };

  const handlePhotoPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (photoDragRef.current?.pointerId !== event.pointerId) return;
    photoDragRef.current = null;
    setIsDraggingPhoto(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
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

      {isMessageSelectionMode && (
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
              onClick={() => {
                setSelectedMessageIds([]);
                setIsMessageSelectionMode(false);
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Batal pilih
            </button>
            <button
              type="button"
              onClick={() => setPendingBulkDelete(true)}
              disabled={deletingMessageId !== null || selectedMessages.length === 0}
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
                className={`relative flex scroll-m-4 rounded-xl transition-colors duration-500 ${
                  ownMessage ? 'justify-end' : 'justify-start'
                } ${isMessageSelectionMode ? 'pl-8' : ''} ${isSelected ? 'bg-rose-100/70 dark:bg-rose-950/30' : highlightedMessageId === message.id ? 'bg-blue-100/70 dark:bg-blue-900/30' : ''}`}
              >
                {isMessageSelectionMode && canDelete && (
                  <button
                    type="button"
                    onClick={() => handleToggleMessageSelection(message.id)}
                    aria-label={`${isSelected ? 'Batalkan pilihan' : 'Pilih'} pesan dari ${senderName}`}
                    role="checkbox"
                    aria-checked={isSelected}
                    className={`absolute left-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded border transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-400 bg-white/80 text-transparent hover:border-emerald-500 dark:border-slate-500 dark:bg-[#161b22]'
                    }`}
                  >
                    <span className="text-sm font-bold leading-none">✓</span>
                  </button>
                )}
                <div className="flex max-w-[92%] items-end gap-2 sm:max-w-[80%]">
                  {!message.is_sticker && (
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
                  )}
                  <article className={message.is_sticker
                    ? 'min-w-0'
                    : `min-w-0 rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        ownMessage
                          ? 'rounded-br-sm bg-blue-600 text-white'
                          : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#161b22] dark:text-slate-100'
                      }`}>
                    {!message.is_sticker && message.reply_to && (
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
                    {!message.is_sticker && <div className="mb-1 flex items-center gap-1.5">
                      <Link
                        href={profileHref}
                        className={`max-w-48 truncate text-xs font-bold hover:underline ${
                          ownMessage ? 'text-blue-50' : 'text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {senderName}
                      </Link>
                    </div>}
                    {message.media_url && message.media_type?.startsWith('audio/') && (
                      <ChatAudioPlayer
                        src={message.media_url}
                        senderName={senderName}
                        profilePhoto={message.profile_photo}
                        onDownload={() => void handleDownloadAudio(message)}
                        ownMessage={ownMessage}
                      />
                    )}
                    {message.media_url && message.media_type?.startsWith('video/') && (
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={() => setVideoViewer({
                            url: message.media_url!,
                            senderName,
                            message,
                          })}
                          className="group relative flex h-36 w-56 max-w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900 sm:h-44 sm:w-72"
                          aria-label={`Putar video dari ${senderName}`}
                        >
                          <video
                            src={message.media_url}
                            playsInline
                            preload="metadata"
                            className="absolute inset-0 h-full w-full object-contain"
                            aria-hidden="true"
                          />
                          <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/40 transition group-hover:scale-110 group-hover:bg-black/75">
                            <Play className="ml-1 h-7 w-7 fill-current" />
                          </span>
                        </button>
                      </div>
                    )}
                    {message.media_url && message.media_type?.startsWith('image/') && (
                      message.is_sticker ? (
                        <div className="relative h-28 w-28 overflow-hidden">
                          <Image
                            src={message.media_url}
                            alt={`Stiker dari ${senderName}`}
                            fill
                            unoptimized
                            sizes="112px"
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoZoom(1);
                            setPhotoOffset({ x: 0, y: 0 });
                            setPhotoViewer({ url: message.media_url!, senderName });
                          }}
                          className="mb-2 block overflow-hidden rounded-lg"
                          aria-label={`Perbesar foto dari ${senderName}`}
                        >
                          <Image
                            src={message.media_url}
                            alt={`Foto yang dikirim ${senderName}`}
                            width={640}
                            height={480}
                            unoptimized
                            className="h-auto max-h-80 w-auto max-w-full object-contain"
                          />
                        </button>
                      )
                    )}
                    {message.message && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {renderMessageWithLinks(message.message, ownMessage)}
                      </p>
                    )}
                    {!message.is_sticker && <div className="mt-1 flex items-center justify-between gap-3">
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
                    </div>}
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
                        {message.is_sticker && (
                          <button
                            type="button"
                            onClick={() => void handleAddStickerToFavorites(message.id)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
                          >
                            <Star className="h-4 w-4" />
                            Tambahkan ke favorit
                          </button>
                        )}
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
                              setIsMessageSelectionMode(true);
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

      {photoViewer && (
        <div
          className="fixed inset-0 z-[110] flex flex-col bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto yang dikirim ${photoViewer.senderName}`}
          onClick={() => setPhotoViewer(null)}
        >
          <div className="flex h-14 shrink-0 items-center justify-end gap-2 px-4">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                changePhotoZoom(-0.25);
              }}
              disabled={photoZoom <= 1}
              aria-label="Perkecil foto"
              title="Perkecil"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <span className="min-w-12 text-center text-xs font-medium text-white/80">
              {Math.round(photoZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                changePhotoZoom(0.25);
              }}
              disabled={photoZoom >= 4}
              aria-label="Perbesar foto"
              title="Perbesar"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setPhotoZoom(1);
                setPhotoOffset({ x: 0, y: 0 });
              }}
              disabled={photoZoom === 1}
              aria-label="Ukuran asli foto"
              title="Ukuran asli"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleDownloadPhoto();
              }}
              aria-label="Unduh foto"
              title="Unduh foto"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setPhotoViewer(null)}
              aria-label="Tutup foto"
              title="Tutup"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            ref={photoViewerRef}
            className={`relative min-h-0 flex-1 overflow-hidden p-3 ${
              photoZoom > 1 ? (isDraggingPhoto ? 'cursor-grabbing' : 'cursor-grab') : ''
            }`}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handlePhotoPointerDown}
            onPointerMove={handlePhotoPointerMove}
            onPointerUp={handlePhotoPointerEnd}
            onPointerCancel={handlePhotoPointerEnd}
            onWheel={(event) => {
              event.preventDefault();
              changePhotoZoom(event.deltaY < 0 ? 0.1 : -0.1);
            }}
          >
            <Image
              src={photoViewer.url}
              alt={`Foto yang dikirim ${photoViewer.senderName}`}
              ref={photoImageRef}
              fill
              unoptimized
              sizes="100vw"
              className="object-contain transition-transform duration-150"
              draggable={false}
              style={{ transform: `translate(${photoOffset.x}px, ${photoOffset.y}px) scale(${photoZoom})` }}
            />
          </div>
        </div>
      )}

      {videoViewer && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label={`Video dari ${videoViewer.senderName}`}
          onClick={() => setVideoViewer(null)}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
            <span className="truncate text-sm font-semibold text-white">{videoViewer.senderName}</span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDownloadVideo(videoViewer.message);
                }}
                aria-label="Unduh video"
                title="Unduh video"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setVideoViewer(null)}
                aria-label="Tutup video"
                title="Tutup video"
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/15"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <video
              src={videoViewer.url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-lg"
              aria-label={`Video dari ${videoViewer.senderName}`}
            />
          </div>
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
        {isStickerPickerOpen && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#0d1117]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Stiker favorit</h2>
              <button
                type="button"
                onClick={() => stickerInputRef.current?.click()}
                disabled={isSending}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                Tambah dari gambar
              </button>
            </div>
            {favoriteStickers.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                Belum ada stiker favorit. Pilih gambar atau simpan stiker dari chat.
              </p>
            ) : (
              <div className="grid max-h-48 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-7">
                {favoriteStickers.map((sticker) => (
                  <div key={sticker.id} className="relative aspect-square">
                    <button
                      type="button"
                      onClick={() => void handleSendSticker({ favoriteId: sticker.id })}
                      disabled={isSending}
                      className="relative h-full w-full overflow-hidden disabled:opacity-50"
                      aria-label="Kirim stiker favorit"
                    >
                      <Image
                        src={sticker.media_url}
                        alt="Stiker favorit"
                        fill
                        unoptimized
                        sizes="64px"
                        className="object-contain"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveFavoriteSticker(sticker.id)}
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800/80 text-white hover:bg-rose-600"
                      aria-label="Hapus stiker dari favorit"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {attachmentPreviewUrl && attachmentFile && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-[#0d1117]">
            {attachmentFile.type.startsWith('audio/') ? (
              <ChatAudioPlayer
                src={attachmentPreviewUrl}
                senderName="Pratinjau voice note"
                profilePhoto={null}
                ownMessage
                knownDuration={recordedVoiceDuration}
                onDownload={() => {
                  const link = document.createElement('a');
                  link.href = attachmentPreviewUrl;
                  link.download = attachmentFile.name;
                  link.click();
                }}
              />
            ) : attachmentFile.type.startsWith('video/') ? (
              <video
                src={attachmentPreviewUrl}
                controls
                playsInline
                preload="metadata"
                className="h-20 w-28 rounded-lg bg-black object-cover"
                aria-label="Pratinjau video yang akan dikirim"
              />
            ) : (
              <Image
                src={attachmentPreviewUrl}
                alt="Pratinjau foto yang akan dikirim"
                width={96}
                height={96}
                unoptimized
                className="h-20 w-20 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{attachmentFile.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {attachmentFile.type.startsWith('video/')
                  ? 'Video siap dikirim · Maksimal 15 MB'
                  : attachmentFile.type.startsWith('audio/')
                    ? 'Audio siap dikirim · Maksimal 15 MB'
                    : 'Foto siap dikirim · Maksimal 5 MB'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                updateAttachment(null);
                setRecordedVoiceDuration(0);
                if (attachmentInputRef.current) attachmentInputRef.current.value = '';
              }}
              disabled={isSending}
              aria-label="Hapus lampiran dari pesan"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 sm:gap-3">
          <input
            ref={stickerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            aria-label="Pilih gambar untuk stiker"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              if (!file) return;
              if (file.size < 1 || file.size > MAX_CHAT_PHOTO_SIZE) {
                setError('Ukuran gambar stiker maksimal 5 MB.');
                return;
              }
              if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
                setError('Format gambar stiker harus JPEG, PNG, GIF, atau WebP.');
                return;
              }
              setError(null);
              void handleSendSticker({ file });
            }}
          />
          <input
            ref={attachmentInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mp4,audio/webm,audio/ogg,audio/mpeg,audio/wav,audio/aac"
            className="sr-only"
            aria-label="Pilih foto atau video untuk dikirim"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              if (!file) return;
              const isVideo = file.type.startsWith('video/');
              const isAudio = file.type.startsWith('audio/');
              const maxSize = isVideo
                ? MAX_CHAT_VIDEO_SIZE
                : isAudio
                  ? MAX_CHAT_AUDIO_SIZE
                  : MAX_CHAT_PHOTO_SIZE;
              if (file.size > maxSize) {
                setError(isVideo
                  ? 'Ukuran video maksimal 15 MB.'
                  : isAudio
                    ? 'Ukuran audio maksimal 15 MB.'
                    : 'Ukuran foto maksimal 5 MB.');
                return;
              }
              if (
                ![
                  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                  'video/mp4', 'video/webm',
                  'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac',
                ]
                  .includes(file.type)
              ) {
                setError('Format lampiran tidak didukung.');
                return;
              }
              setError(null);
              updateAttachment(file);
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!isStickerPickerOpen) void loadFavoriteStickers();
              setIsStickerPickerOpen(!isStickerPickerOpen);
            }}
            disabled={isSending}
            aria-label="Buka stiker favorit"
            aria-expanded={isStickerPickerOpen}
            title="Stiker"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
              isStickerPickerOpen
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
            }`}
          >
            <Smile className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={isSending}
            aria-label="Kirim foto, video, atau audio"
            title="Kirim foto, video, atau audio"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={isRecordingVoice}
            maxLength={2000}
            rows={1}
            placeholder="Tulis pesan..."
            aria-label="Tulis pesan"
            className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-[#0d1117] dark:text-white"
          />
          {isRecordingVoice && (
            <>
              <span className="hidden whitespace-nowrap text-xs font-semibold text-rose-600 sm:inline dark:text-rose-300">
                {isVoiceRecordingPaused ? 'Dijeda' : 'Merekam'} · {formatAudioTime(voiceRecordingDuration)}
              </span>
              <button
                type="button"
                onClick={toggleVoiceRecordingPause}
                aria-label={isVoiceRecordingPaused ? 'Lanjutkan rekaman' : 'Jeda rekaman'}
                title={isVoiceRecordingPaused ? 'Lanjutkan rekaman' : 'Jeda rekaman'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
              >
                {isVoiceRecordingPaused
                  ? <Play className="h-5 w-5 fill-current" />
                  : <Pause className="h-5 w-5 fill-current" />}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (isRecordingVoice) stopVoiceRecording();
              else void startVoiceRecording();
            }}
            disabled={!isRecordingVoice && (isSending || Boolean(attachmentFile))}
            aria-label={isRecordingVoice ? 'Selesai merekam voice note' : 'Rekam voice note'}
            title={isRecordingVoice ? 'Selesai merekam' : 'Rekam voice note'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isRecordingVoice
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
            }`}
          >
            {isRecordingVoice ? <X className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="submit"
            disabled={(!draft.trim() && !attachmentFile) || isSending || isRecordingVoice}
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
