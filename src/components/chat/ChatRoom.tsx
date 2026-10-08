'use client';

import React, { FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bell, BellOff, Check, ChevronDown, ChevronUp, Copy, Crop, Download, Headphones, ImagePlus, ListChecks, Loader2, MessageCircle, Mic, MoreVertical, Music2, Paperclip, Pause, Pencil, Play, Reply, RotateCcw, Search, Send, ShieldCheck, Smile, Star, Sticker, Trash2, Upload, Users, Volume2, VolumeX, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';
import { GroupCallControls } from '@/components/chat/GroupCallControls';
import { MAX_CHAT_AUDIO_SIZE, MAX_CHAT_PHOTO_SIZE, MAX_CHAT_VIDEO_SIZE } from '@/lib/chat/constants';
import {
  CHAT_NOTIFICATION_PREFERENCE_EVENT,
  getChatNotificationIcon,
  getChatNotificationPreference,
  getMutedChatSendersSnapshot,
  parseMutedChatSenderIds,
  setChatNotificationPreference,
  setMutedChatSenders,
} from '@/lib/chat/notification-preferences';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DrawingPoint {
  x: number;
  y: number;
}

interface DrawingStroke {
  color: string;
  points: DrawingPoint[];
}

interface VideoDrawing {
  width: number;
  height: number;
  strokes: DrawingStroke[];
}

interface CropInteraction {
  pointerId: number;
  mode: 'new' | 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  start: DrawingPoint;
  initialArea: CropArea | null;
}

function createEditedImage(
  imageSource: string,
  dimensions: { width: number; height: number },
  cropArea: CropArea | null,
  strokes: DrawingStroke[],
  mimeType: string,
  fileName: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const sourceX = cropArea ? Math.round(cropArea.x) : 0;
      const sourceY = cropArea ? Math.round(cropArea.y) : 0;
      const outputWidth = cropArea ? Math.round(cropArea.width) : dimensions.width;
      const outputHeight = cropArea ? Math.round(cropArea.height) : dimensions.height;
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Foto tidak dapat diproses di browser ini.'));
        return;
      }

      context.drawImage(image, sourceX, sourceY, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight);
      context.save();
      context.beginPath();
      context.rect(0, 0, outputWidth, outputHeight);
      context.clip();
      for (const stroke of strokes) {
        if (stroke.points.length < 1) continue;
        context.beginPath();
        context.strokeStyle = stroke.color;
        context.lineWidth = Math.max(4, dimensions.width / 180);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.moveTo(stroke.points[0].x - sourceX, stroke.points[0].y - sourceY);
        for (const point of stroke.points.slice(1)) {
          context.lineTo(point.x - sourceX, point.y - sourceY);
        }
        if (stroke.points.length === 1) {
          context.lineTo(stroke.points[0].x - sourceX + 0.1, stroke.points[0].y - sourceY + 0.1);
        }
        context.stroke();
      }
      context.restore();
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Hasil edit foto tidak dapat dibuat.'));
          return;
        }
        const editedName = `${fileName.replace(/\.[^.]+$/, '')}-edit.jpg`;
        resolve(new File([blob], editedName, { type: mimeType }));
      }, mimeType, 0.92);
    };
    image.onerror = () => reject(new Error('Foto tidak dapat dibuka untuk diedit.'));
    image.src = imageSource;
  });
}

interface RepliedMessage {
  id: number;
  sender_id: number;
  username: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER' | null;
  attendance_role: string | null;
  message: string | null;
  deleted_at: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_sticker?: boolean | number;
  is_voice_note?: boolean | number;
  audio_duration_seconds?: number;
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
  drawing_data?: string | null;
  is_sticker?: boolean | number;
  is_voice_note?: boolean | number;
  audio_duration_seconds?: number;
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
  searchTotal?: number;
}

interface FavoriteStickersApiResponse {
  success: boolean;
  data?: FavoriteSticker[];
  error?: string;
}

interface WallpaperApiResponse {
  success: boolean;
  data?: { media_url: string | null };
  error?: string;
}

function subscribeToChatNotificationPreference(onChange: () => void) {
  const handleChange = () => onChange();
  window.addEventListener('storage', handleChange);
  window.addEventListener(CHAT_NOTIFICATION_PREFERENCE_EVENT, handleChange);
  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(CHAT_NOTIFICATION_PREFERENCE_EVENT, handleChange);
  };
}

function getChatNotificationSupport() {
  return 'Notification' in window && 'serviceWorker' in navigator;
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
  return message.attendance_role || 'Staf';
}

function getChatMessageType(message: Pick<
  RepliedMessage,
  'message' | 'media_type' | 'is_sticker' | 'is_voice_note' | 'audio_duration_seconds'
>) {
  if (message.is_sticker) return 'Stiker';
  if (message.media_type?.startsWith('image/')) return 'Foto';
  if (message.media_type?.startsWith('video/')) return 'Video';
  if (message.media_type?.startsWith('audio/')) {
    const duration = formatAudioTime(message.audio_duration_seconds || 0);
    return message.is_voice_note ? `Pesan Suara (${duration})` : `audio (${duration})`;
  }
  return message.message ? 'Pesan teks' : 'Pesan';
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getNotificationMessage(message: ChatMessage) {
  if (message.message.trim()) return message.message.trim().slice(0, 180);
  return getChatMessageType(message);
}

function parseVideoDrawing(value: string | null | undefined): VideoDrawing | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      !Number.isSafeInteger(candidate.width) ||
      !Number.isSafeInteger(candidate.height) ||
      !Array.isArray(candidate.strokes)
    ) {
      return null;
    }
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (width < 1 || height < 1) return null;
    const strokes: DrawingStroke[] = [];
    for (const value of candidate.strokes) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
      const stroke = value as Record<string, unknown>;
      if (typeof stroke.color !== 'string' || !Array.isArray(stroke.points)) return null;
      const points: DrawingPoint[] = [];
      for (const value of stroke.points) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
        const point = value as Record<string, unknown>;
        if (typeof point.x !== 'number' || typeof point.y !== 'number') return null;
        points.push({ x: point.x, y: point.y });
      }
      strokes.push({ color: stroke.color, points });
    }
    return { width, height, strokes };
  } catch {
    return null;
  }
}

function VideoDrawingOverlay({
  drawing,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  drawing: VideoDrawing;
  className?: string;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  onPointerCancel?: React.PointerEventHandler<SVGSVGElement>;
}) {
  return (
    <svg
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden={onPointerDown ? undefined : true}
      aria-label={onPointerDown ? 'Coretan video' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {drawing.strokes.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={stroke.color}
          strokeWidth={Math.max(4, drawing.width / 180)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function readAudioDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const audio = document.createElement('audio');
    const sourceUrl = URL.createObjectURL(file);
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Durasi audio tidak dapat dibaca.'));
    }, 10_000);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(sourceUrl);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Durasi audio tidak valid.'));
        return;
      }
      resolve(Math.round(duration));
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Durasi audio tidak dapat dibaca oleh browser ini.'));
    };
    audio.src = sourceUrl;
  });
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

function renderMessageWithLinks(message: string, ownMessage: boolean, composer = false) {
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
          className={composer
            ? 'text-blue-600 dark:text-blue-300'
            : `break-all rounded-sm px-0.5 underline underline-offset-2 ${
                ownMessage
                  ? 'bg-blue-800/50 text-blue-100 hover:bg-blue-800/80 hover:text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60 dark:hover:text-blue-100'
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
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [isJumpingToMessage, setIsJumpingToMessage] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentAudioDuration, setAttachmentAudioDuration] = useState(0);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isMediaComposerOpen, setIsMediaComposerOpen] = useState(false);
  const [isCroppingAttachment, setIsCroppingAttachment] = useState(false);
  const [isDrawingAttachment, setIsDrawingAttachment] = useState(false);
  const [isMediaVideoPlaying, setIsMediaVideoPlaying] = useState(false);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [displayMediaSize, setDisplayMediaSize] = useState<{ width: number; height: number } | null>(null);
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>([]);
  const [drawingColor, setDrawingColor] = useState('#ff3b30');
  const [isVoiceNoteAttachment, setIsVoiceNoteAttachment] = useState(false);
  const [isReadingAudioDuration, setIsReadingAudioDuration] = useState(false);
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
  const [swipingMessage, setSwipingMessage] = useState<{ messageId: number; deltaX: number } | null>(null);
  const [stickerFavoritePromptId, setStickerFavoritePromptId] = useState<number | null>(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState<number | null>(null);
  const [messageActionsPosition, setMessageActionsPosition] = useState<{ top: number; left: number } | null>(null);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [pendingSendPreview, setPendingSendPreview] = useState<string | null>(null);
  const isChatNotificationsEnabled = useSyncExternalStore(
    subscribeToChatNotificationPreference,
    () => getChatNotificationPreference(currentUserId),
    () => false
  );
  const isChatNotificationsSupported = useSyncExternalStore(
    () => () => {},
    getChatNotificationSupport,
    () => false
  );
  const mutedChatSendersSnapshot = useSyncExternalStore(
    subscribeToChatNotificationPreference,
    () => getMutedChatSendersSnapshot(currentUserId),
    () => '[]'
  );
  const mutedChatSenderIds = parseMutedChatSenderIds(mutedChatSendersSnapshot);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [chatWallpaperUrl, setChatWallpaperUrl] = useState<string | null>(null);
  const [isWallpaperSettingsOpen, setIsWallpaperSettingsOpen] = useState(false);
  const [isWallpaperLoading, setIsWallpaperLoading] = useState(true);
  const [isWallpaperSaving, setIsWallpaperSaving] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const profilePhotosRef = useRef(new Map<number, string | null>());
  const messageCursorRef = useRef<number | null>(null);
  const deletionCursorRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerLayerRef = useRef<HTMLDivElement>(null);
  const composerHighlightRef = useRef<HTMLDivElement>(null);
  const mediaCaptionRef = useRef<HTMLTextAreaElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const messageSearchInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const pendingSearchJumpMessageIdRef = useRef<number | null>(null);
  const preserveSearchJumpPositionRef = useRef(false);
  const ignoreProgrammaticChatScrollRef = useRef(false);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceElapsedMsRef = useRef(0);
  const voiceSegmentStartedAtRef = useRef<number | null>(null);
  const attachmentPreviewUrlRef = useRef<string | null>(null);
  const mediaVideoRef = useRef<HTMLVideoElement>(null);
  const audioDurationRequestRef = useRef(0);
  const photoViewerRef = useRef<HTMLDivElement>(null);
  const photoImageRef = useRef<HTMLImageElement>(null);
  const photoDragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const replySwipeRef = useRef<{
    pointerId: number;
    messageId: number;
    startX: number;
    startY: number;
    deltaX: number;
    isHorizontal: boolean;
  } | null>(null);
  const suppressPhotoClickRef = useRef<number | null>(null);
  const shouldScrollRef = useRef(true);
  const isLoadingMessagesRef = useRef(false);
  const initialMessagesLoadedRef = useRef(false);
  const initialScrollPositionedRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const messageActionsRef = useRef<HTMLDivElement>(null);
  const messageActionsMenuRef = useRef<HTMLDivElement>(null);
  const notificationSettingsRef = useRef<HTMLDivElement>(null);
  const stickerFavoritePromptRef = useRef<HTMLDivElement>(null);
  const drawingPointerRef = useRef<number | null>(null);
  const cropInteractionRef = useRef<CropInteraction | null>(null);

  useEffect(() => {
    if (!isAttachmentMenuOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !attachmentMenuRef.current?.contains(event.target)) {
        setIsAttachmentMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [isAttachmentMenuOpen]);

  useEffect(() => {
    if (!isNotificationSettingsOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationSettingsRef.current?.contains(event.target)) {
        setIsNotificationSettingsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [isNotificationSettingsOpen]);

  useEffect(() => {
    if (stickerFavoritePromptId === null) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !stickerFavoritePromptRef.current?.contains(event.target)) {
        setStickerFavoritePromptId(null);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [stickerFavoritePromptId]);

  const updateAttachment = useCallback((file: File | null) => {
    audioDurationRequestRef.current += 1;
    if (attachmentPreviewUrlRef.current) URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    const previewUrl = file ? URL.createObjectURL(file) : null;
    attachmentPreviewUrlRef.current = previewUrl;
    setAttachmentPreviewUrl(previewUrl);
    setAttachmentFile(file);
    setAttachmentAudioDuration(0);
    setIsVoiceNoteAttachment(false);
    setIsReadingAudioDuration(false);
  }, []);

  const handleAttachmentFile = (file: File | null) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const isImage = file.type.startsWith('image/');
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
      ].includes(file.type)
    ) {
      setError('Format lampiran tidak didukung.');
      return;
    }

    setError(null);
    setIsAttachmentMenuOpen(false);
    setDrawingStrokes([]);
    setImageDimensions(null);
    setDisplayMediaSize(null);
    setIsMediaVideoPlaying(false);
    if (isAudio) {
      const requestId = ++audioDurationRequestRef.current;
      setIsReadingAudioDuration(true);
      void readAudioDuration(file)
        .then((duration) => {
          if (requestId !== audioDurationRequestRef.current) return;
          updateAttachment(file);
          setAttachmentAudioDuration(duration);
        })
        .catch((audioError: unknown) => {
          if (requestId === audioDurationRequestRef.current) {
            setError(audioError instanceof Error ? audioError.message : 'Durasi audio tidak dapat dibaca.');
          }
        })
        .finally(() => {
          if (requestId === audioDurationRequestRef.current) setIsReadingAudioDuration(false);
        });
      return;
    }

    updateAttachment(file);
    if (isImage || isVideo) {
      setIsMediaComposerOpen(true);
      setIsCroppingAttachment(false);
      setIsDrawingAttachment(false);
      setCropArea(null);
      setDrawingStrokes([]);
      setImageDimensions(null);
    }
  };

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
    if (!isMediaComposerOpen || !imageDimensions) {
      return;
    }

    const resizeMedia = () => {
      const scale = Math.min(
        (window.innerWidth * 0.9) / imageDimensions.width,
        (window.innerHeight * 0.68) / imageDimensions.height,
        1,
      );
      setDisplayMediaSize({
        width: Math.max(1, Math.round(imageDimensions.width * scale)),
        height: Math.max(1, Math.round(imageDimensions.height * scale)),
      });
    };

    const resizeFrame = window.requestAnimationFrame(resizeMedia);
    window.addEventListener('resize', resizeMedia);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener('resize', resizeMedia);
    };
  }, [imageDimensions, isMediaComposerOpen]);

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

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 128;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    if (composerLayerRef.current) {
      composerLayerRef.current.style.height = `${textarea.offsetHeight}px`;
    }
    if (composerHighlightRef.current) {
      composerHighlightRef.current.scrollTop = textarea.scrollTop;
    }
  }, [draft]);

  useLayoutEffect(() => {
    const textarea = mediaCaptionRef.current;
    if (!isMediaComposerOpen || !textarea) return;

    textarea.style.height = 'auto';
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 128;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [draft, isMediaComposerOpen]);

  useLayoutEffect(() => {
    if (openMessageActionsId === null) return;
    const messagesContainer = messagesContainerRef.current;

    const updatePosition = () => {
      const trigger = messageActionsRef.current?.querySelector('button');
      const menu = messageActionsMenuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 8;
      const messageRow = trigger.closest('[id^="chat-message-"]');
      const isOutgoing = messageRow?.classList.contains('justify-end') ?? false;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const desiredTop = spaceBelow >= menuRect.height + margin
        ? triggerRect.bottom + 4
        : Math.max(margin, triggerRect.top - menuRect.height - 4);
      const top = Math.min(window.innerHeight - menuRect.height - margin, desiredTop);
      const preferredLeft = isOutgoing
        ? triggerRect.left - menuRect.width - 4
        : triggerRect.right + 4;
      const fallbackLeft = isOutgoing
        ? triggerRect.right + 4
        : triggerRect.left - menuRect.width - 4;
      const left = preferredLeft >= margin && preferredLeft + menuRect.width <= window.innerWidth - margin
        ? preferredLeft
        : Math.min(window.innerWidth - menuRect.width - margin, Math.max(margin, fallbackLeft));
      setMessageActionsPosition({ top, left });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !messageActionsRef.current?.contains(target) &&
        !messageActionsMenuRef.current?.contains(target)
      ) {
        setOpenMessageActionsId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMessageActionsId(null);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    messagesContainer?.addEventListener('scroll', updatePosition);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      messagesContainer?.removeEventListener('scroll', updatePosition);
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

  const mergeMessages = useCallback((incoming: ChatMessage[], replace = false, maxMessages = 100) => {
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
    const latest = unique.slice(-maxMessages);
    messagesRef.current = latest;
    setMessages(latest);
  }, []);

  const handleChatNotificationsToggle = async () => {
    if (!isChatNotificationsSupported) {
      setError('Notifikasi perangkat tidak didukung oleh browser ini.');
      return;
    }
    if (isChatNotificationsEnabled) {
      setChatNotificationPreference(currentUserId, false);
      setError(null);
      return;
    }

    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        throw new Error('Izin notifikasi ditolak. Ubah izin situs di pengaturan browser untuk mengaktifkannya.');
      }

      await navigator.serviceWorker.register('/chat-notification-sw.js');
      setChatNotificationPreference(currentUserId, true);
      setError(null);
    } catch (notificationError: unknown) {
      setError(notificationError instanceof Error
        ? notificationError.message
        : 'Gagal mengaktifkan notifikasi chat.');
    }
  };

  const showChatNotification = useCallback(async (message: ChatMessage) => {
    if (
      !isChatNotificationsEnabled ||
      Notification.permission !== 'granted' ||
      (document.visibilityState === 'visible' && document.hasFocus()) ||
      message.sender_id === currentUserId ||
      parseMutedChatSenderIds(getMutedChatSendersSnapshot(currentUserId)).includes(message.sender_id)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const icon = await getChatNotificationIcon(message.profile_photo);
      const chatPath = currentUserRole === 'ADMIN'
        ? '/admin/chat'
        : currentUserRole === 'DEVELOPER'
          ? '/developer/chat'
          : '/chat';
      await registration.showNotification('Chat Staf & Admin', {
        body: `${message.username}: ${getNotificationMessage(message)}`,
        ...(icon ? { icon } : {}),
        tag: `staff-admin-chat-${message.id}`,
        data: { url: chatPath },
      });
    } catch (notificationError: unknown) {
      console.error('[Chat Device Notification Error]:', notificationError);
      setError(notificationError instanceof Error
        ? notificationError.message
        : 'Gagal menampilkan notifikasi chat di perangkat.');
    }
  }, [currentUserId, currentUserRole, isChatNotificationsEnabled]);

  const handleToggleMutedChatSender = (senderId: number) => {
    try {
      const currentMutedIds = parseMutedChatSenderIds(getMutedChatSendersSnapshot(currentUserId));
      const isMuted = currentMutedIds.includes(senderId);
      setMutedChatSenders(
        currentUserId,
        isMuted
          ? currentMutedIds.filter((mutedSenderId) => mutedSenderId !== senderId)
          : [...currentMutedIds, senderId]
      );
      setError(null);
    } catch (muteError: unknown) {
      setError(muteError instanceof Error
        ? muteError.message
        : 'Gagal memperbarui pengaturan notifikasi pengirim.');
    }
  };

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
        if (document.visibilityState !== 'visible' || !document.hasFocus()) {
          for (const message of result.data) {
            if (message.id > cursor && message.sender_id !== currentUserId) {
              void showChatNotification(message);
            }
          }
        }
      }
      deletionCursorRef.current = result.serverTime;
      mergeMessages(result.data, cursor === null);
      if (
        document.visibilityState === 'visible' &&
        (cursor === null || result.data.some((message) => message.id > cursor))
      ) {
        const lastReadMessageId = result.data.reduce((latestId, message) => Math.max(latestId, message.id), cursor ?? 0);
        void fetch('/api/chat/unread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastReadMessageId }),
        })
          .then(async (readResponse) => {
            const readResult = await readResponse.json() as { success: boolean; error?: string };
            if (!readResponse.ok || !readResult.success) {
              throw new Error(readResult.error || 'Gagal memperbarui status pesan terbaca.');
            }
          })
          .catch((readError: unknown) => {
            console.error('[Chat Read Status Error]:', readError);
            setError(readError instanceof Error ? readError.message : 'Gagal memperbarui status pesan terbaca.');
          });
      }
      setError(null);
    } catch (loadError: unknown) {
      if (loadError instanceof Error && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat pesan chat.');
    } finally {
      isLoadingMessagesRef.current = false;
      if (initial) setIsLoading(false);
    }
  }, [currentUserId, mergeMessages, showChatNotification]);

  const handleJumpToSearchMessage = async (messageId: number) => {
    setIsJumpingToMessage(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/messages?around=${messageId}`, { cache: 'no-store' });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || 'Gagal membuka pesan yang ditemukan.');
      }

      const contextMessages = result.data;
      if (!contextMessages.some((message) => message.id === messageId)) {
        throw new Error('Pesan yang ditemukan sudah tidak tersedia.');
      }
      mergeMessages([...contextMessages, ...messagesRef.current], false, 200);
      pendingSearchJumpMessageIdRef.current = messageId;
      preserveSearchJumpPositionRef.current = true;
      shouldScrollRef.current = false;
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchTotal(0);
      setIsSearchingMessages(false);
    } catch (jumpError: unknown) {
      setError(jumpError instanceof Error ? jumpError.message : 'Gagal membuka pesan yang ditemukan.');
    } finally {
      setIsJumpingToMessage(false);
    }
  };

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

  useEffect(() => {
    let isMounted = true;
    const loadWallpaper = async () => {
      try {
        const response = await fetch('/api/chat/wallpaper', { cache: 'no-store' });
        const result = await response.json() as WallpaperApiResponse;
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Gagal memuat wallpaper chat.');
        }
        if (isMounted) setChatWallpaperUrl(result.data.media_url);
      } catch (wallpaperError: unknown) {
        if (isMounted) {
          setError(wallpaperError instanceof Error ? wallpaperError.message : 'Gagal memuat wallpaper chat.');
        }
      } finally {
        if (isMounted) setIsWallpaperLoading(false);
      }
    };
    void loadWallpaper();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const term = searchQuery.trim();
    if (!isSearchOpen || !term) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams({ search: term });
      void fetch(`/api/chat/messages?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = await response.json() as ChatApiResponse;
          if (!response.ok || !result.success || !Array.isArray(result.data)) {
            throw new Error(result.error || 'Gagal mencari pesan chat.');
          }
          setSearchResults(result.data);
          setSearchTotal(result.searchTotal || 0);
          setSearchMatchIndex(Math.max(0, result.data.length - 1));
          setError(null);
        })
        .catch((searchError: unknown) => {
          if (searchError instanceof Error && searchError.name === 'AbortError') return;
          setError(searchError instanceof Error ? searchError.message : 'Gagal mencari pesan chat.');
          setSearchResults([]);
          setSearchTotal(0);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingMessages(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isSearchOpen, searchQuery]);

  useEffect(() => {
    if (!isSearchOpen || searchQuery.trim()) return;
    messageSearchInputRef.current?.focus();
  }, [isSearchOpen, searchQuery]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (isLoading || isWallpaperSettingsOpen || isSearchOpen || !initialMessagesLoadedRef.current || !container) return;

    const pendingJumpMessageId = pendingSearchJumpMessageIdRef.current;
    if (pendingJumpMessageId !== null) {
      const target = document.getElementById(`chat-message-${pendingJumpMessageId}`);
      if (!target) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = container.scrollTop + targetRect.top - containerRect.top;
      ignoreProgrammaticChatScrollRef.current = true;
      container.scrollTop = Math.max(0, targetTop - (container.clientHeight - target.clientHeight) / 2);
      window.setTimeout(() => {
        ignoreProgrammaticChatScrollRef.current = false;
      }, 300);
      pendingSearchJumpMessageIdRef.current = null;
      window.setTimeout(() => {
        setHighlightedMessageId(pendingJumpMessageId);
        if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1800);
      }, 0);
      return;
    }

    if (preserveSearchJumpPositionRef.current && !shouldScrollRef.current) return;
    preserveSearchJumpPositionRef.current = false;

    if (!initialScrollPositionedRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollPositionedRef.current = true;
    } else if (shouldScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [isLoading, isWallpaperSettingsOpen, isSearchOpen, messages]);

  useLayoutEffect(() => {
    if (!isSearchOpen || searchResults.length === 0) return;
    const container = messagesContainerRef.current;
    const match = searchResults[searchMatchIndex];
    const target = document.getElementById(`chat-message-${match.id}`);
    if (!container || !target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = container.scrollTop + targetRect.top - containerRect.top;
    container.scrollTop = Math.max(0, targetTop - (container.clientHeight - target.clientHeight) / 2);
  }, [isSearchOpen, searchMatchIndex, searchResults]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    const attachment = attachmentFile;
    const audioDuration = attachment?.type.startsWith('audio/') ? attachmentAudioDuration : 0;
    const isVoiceNote = attachment?.type.startsWith('audio/') && isVoiceNoteAttachment;
    if ((!message && !attachment) || isSending || isReadingAudioDuration) return;

    const attachmentPreview = attachment?.type.startsWith('image/')
      ? 'Foto'
      : attachment?.type.startsWith('video/')
        ? 'Video'
        : attachment?.type.startsWith('audio/')
          ? isVoiceNote ? 'Pesan suara' : 'Audio'
          : '';
    setPendingSendPreview(message || attachmentPreview);
    setIsSending(true);
    setError(null);
    setDraft('');
    updateAttachment(null);
    setIsMediaComposerOpen(false);
    setIsCroppingAttachment(false);
    setIsDrawingAttachment(false);
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
        if (attachment.type.startsWith('audio/')) {
          form.set('audioDurationSeconds', String(audioDuration));
          form.set('isVoiceNote', String(isVoiceNote));
        }
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
      setDrawingStrokes([]);
      setImageDimensions(null);
    } catch (sendError: unknown) {
      setDraft((currentDraft) => currentDraft || draft);
      if (attachment) {
        updateAttachment(attachment);
        setAttachmentAudioDuration(audioDuration);
        setIsVoiceNoteAttachment(Boolean(isVoiceNote));
        if (attachment.type.startsWith('image/') || attachment.type.startsWith('video/')) {
          setIsMediaComposerOpen(true);
        }
      }
      setReplyTarget((currentTarget) => currentTarget || replyTarget);
      setError(sendError instanceof Error ? sendError.message : 'Gagal mengirim pesan.');
    } finally {
      setIsSending(false);
      setPendingSendPreview(null);
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
          setError('Ukuran pesan suara maksimal 15 MB. Rekam suara yang lebih pendek.');
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
        setAttachmentAudioDuration(durationSeconds);
        setIsVoiceNoteAttachment(true);
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

  const handleSendSticker = async (
    source: { file: File } | { favoriteId: number },
    replyToId = replyTarget?.id ?? null,
  ) => {
    if (isSending) return;

    setPendingSendPreview('Stiker');
    setIsSending(true);
    setError(null);
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
      setReplyTarget((currentTarget) => currentTarget?.id === replyToId ? null : currentTarget);
      setIsStickerPickerOpen(false);
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Gagal mengirim stiker.');
    } finally {
      setIsSending(false);
      setPendingSendPreview(null);
    }
  };

  const handleAddStickerToFavorites = async (messageId: number) => {
    setOpenMessageActionsId(null);
    setStickerFavoritePromptId(null);
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

    mergeMessages([{ ...message, message: '', deleted_at: new Date().toISOString() }]);
    setPendingDeleteMessage(null);
    setDeletingMessageId(message.id);
    setError(null);
    try {
      const response = await fetch(`/api/chat/messages/${message.id}`, { method: 'DELETE' });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menghapus pesan.');
      }

    } catch (deleteError: unknown) {
      mergeMessages([message]);
      setError(deleteError instanceof Error ? deleteError.message : 'Gagal menghapus pesan.');
      void loadMessages();
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

    const messagesToDelete = selectedMessages;
    const previousSelectedMessageIds = selectedMessageIds;
    const wasSelectionMode = isMessageSelectionMode;
    mergeMessages(messagesToDelete.map((message) => ({
      ...message,
      message: '',
      deleted_at: new Date().toISOString(),
    })));
    setSelectedMessageIds([]);
    setIsMessageSelectionMode(false);
    setPendingBulkDelete(false);
    setDeletingMessageId(-1);
    setError(null);
    try {
      const response = await fetch('/api/chat/messages/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: messagesToDelete.map((message) => message.id) }),
      });
      const result = await response.json() as ChatApiResponse;
      if (!response.ok || !result.success || typeof result.deletedCount !== 'number') {
        throw new Error(result.error || 'Gagal menghapus pesan.');
      }

    } catch (deleteError: unknown) {
      mergeMessages(messagesToDelete);
      setSelectedMessageIds(previousSelectedMessageIds);
      setIsMessageSelectionMode(wasSelectionMode);
      setError(deleteError instanceof Error ? deleteError.message : 'Gagal menghapus pesan.');
      void loadMessages();
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

  const handleCopyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.message);
      setOpenMessageActionsId(null);
      setError(null);
    } catch (copyError: unknown) {
      setError(copyError instanceof Error ? copyError.message : 'Gagal menyalin pesan.');
    }
  };

  const handleReplySwipeStart = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    const target = event.target;
    const isPhotoPreview = target instanceof Element &&
      target.closest('button[aria-label^="Perbesar foto dari "]');
    const isVideoPreview = target instanceof Element &&
      target.closest('button[aria-label^="Putar video dari "]');
    const isSticker = target instanceof Element &&
      target.closest('button[aria-label^="Opsi stiker dari "]');
    const isOtherInteractiveTarget = target instanceof Element &&
      target.closest('button, a, input, textarea, video, audio, [role="slider"]');
    if (
      event.button !== 0 ||
      isOtherInteractiveTarget && !isPhotoPreview && !isVideoPreview && !isSticker
    ) {
      return;
    }
    replySwipeRef.current = {
      pointerId: event.pointerId,
      messageId: message.id,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      isHorizontal: false,
    };
  };

  const handleReplySwipeMove = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    const gesture = replySwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.messageId !== message.id) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.isHorizontal) {
      if (Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
      const swipeDirectionAllowed = isOwnMessage(message) ? deltaX < 0 : deltaX > 0;
      if (!swipeDirectionAllowed) return;
      gesture.isHorizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    gesture.deltaX = deltaX;
    setSwipingMessage({
      messageId: message.id,
      deltaX: Math.sign(deltaX) * Math.min(Math.abs(deltaX), 76),
    });
  };

  const finishReplySwipe = (event: React.PointerEvent<HTMLDivElement>, message: ChatMessage, cancelled = false) => {
    const gesture = replySwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.messageId !== message.id) return;

    replySwipeRef.current = null;
    setSwipingMessage(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!cancelled && gesture.isHorizontal && Math.abs(gesture.deltaX) >= 56) {
      suppressPhotoClickRef.current = message.id;
      window.setTimeout(() => {
        if (suppressPhotoClickRef.current === message.id) suppressPhotoClickRef.current = null;
      }, 500);
      handleReply(message);
    }
  };

  const handlePhotoPreviewClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    message: ChatMessage
  ) => {
    if (suppressPhotoClickRef.current === message.id) {
      suppressPhotoClickRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    suppressPhotoClickRef.current = null;
    setPhotoZoom(1);
    setPhotoOffset({ x: 0, y: 0 });
    setPhotoViewer({ url: message.media_url!, senderName: message.username });
  };

  const handleVideoPreviewClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    message: ChatMessage,
    senderName: string,
  ) => {
    if (suppressPhotoClickRef.current === message.id) {
      suppressPhotoClickRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setVideoViewer({
      url: message.media_url!,
      senderName,
      message,
    });
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
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
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

  const handleWallpaperUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Format wallpaper harus JPEG, PNG, GIF, atau WebP.');
      return;
    }
    if (file.size < 1 || file.size > MAX_CHAT_PHOTO_SIZE) {
      setError('Ukuran wallpaper maksimal 5 MB.');
      return;
    }

    setIsWallpaperSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('wallpaper', file);
      const response = await fetch('/api/chat/wallpaper', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json() as WallpaperApiResponse;
      if (!response.ok || !result.success || !result.data?.media_url) {
        throw new Error(result.error || 'Gagal menyimpan wallpaper chat.');
      }
      setChatWallpaperUrl(result.data.media_url);
    } catch (wallpaperError: unknown) {
      setError(wallpaperError instanceof Error ? wallpaperError.message : 'Gagal menyimpan wallpaper chat.');
    } finally {
      setIsWallpaperSaving(false);
      if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
    }
  };

  const handleResetWallpaper = async () => {
    setIsWallpaperSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/chat/wallpaper', { method: 'DELETE' });
      const result = await response.json() as WallpaperApiResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal mengatur wallpaper ke bawaan.');
      }
      setChatWallpaperUrl(null);
    } catch (wallpaperError: unknown) {
      setError(wallpaperError instanceof Error ? wallpaperError.message : 'Gagal mengatur wallpaper ke bawaan.');
    } finally {
      setIsWallpaperSaving(false);
    }
  };

  const handleApplyPhotoEdit = async (cropSelection: CropArea | null, strokes: DrawingStroke[]) => {
    if (!attachmentPreviewUrl || !attachmentFile || !imageDimensions) return;
    setError(null);
    try {
      const editedFile = await createEditedImage(
        attachmentPreviewUrl,
        imageDimensions,
        cropSelection,
        strokes,
        'image/jpeg',
        attachmentFile.name,
      );
      if (editedFile.size < 1 || editedFile.size > MAX_CHAT_PHOTO_SIZE) {
        throw new Error('Ukuran foto hasil edit maksimal 5 MB.');
      }
      setImageDimensions(null);
      setDisplayMediaSize(null);
      updateAttachment(editedFile);
      setIsCroppingAttachment(false);
      setIsDrawingAttachment(false);
      setCropArea(null);
      setDrawingStrokes([]);
    } catch (editError: unknown) {
      setError(editError instanceof Error ? editError.message : 'Foto tidak dapat diedit.');
    }
  };

  const getDrawingPoint = (event: React.PointerEvent<SVGSVGElement>): DrawingPoint | null => {
    const svg = event.currentTarget;
    const bounds = svg.getBoundingClientRect();
    if (!imageDimensions || bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: (event.clientX - bounds.left) * imageDimensions.width / bounds.width,
      y: (event.clientY - bounds.top) * imageDimensions.height / bounds.height,
    };
  };

  const handleCropPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!imageDimensions || event.button !== 0) return;
    event.preventDefault();
    const point = getDrawingPoint(event);
    if (!point) return;

    const target = event.target as SVGElement;
    const requestedMode = target.dataset.cropMode;
    const mode: CropInteraction['mode'] =
      requestedMode === 'move' ||
      requestedMode === 'n' || requestedMode === 's' || requestedMode === 'e' || requestedMode === 'w' ||
      requestedMode === 'ne' || requestedMode === 'nw' || requestedMode === 'se' || requestedMode === 'sw'
        ? requestedMode
        : 'new';
    const initialArea = mode === 'new' ? null : cropArea;
    cropInteractionRef.current = { pointerId: event.pointerId, mode, start: point, initialArea };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === 'new') {
      setCropArea({ x: point.x, y: point.y, width: 0, height: 0 });
    }
  };

  const handleCropPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = cropInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || !imageDimensions) return;
    const point = getDrawingPoint(event);
    if (!point) return;
    const imageWidth = imageDimensions.width;
    const imageHeight = imageDimensions.height;

    if (interaction.mode === 'move' && interaction.initialArea) {
      const { initialArea } = interaction;
      setCropArea({
        ...initialArea,
        x: Math.min(imageWidth - initialArea.width, Math.max(0, initialArea.x + point.x - interaction.start.x)),
        y: Math.min(imageHeight - initialArea.height, Math.max(0, initialArea.y + point.y - interaction.start.y)),
      });
      return;
    }

    const initialArea = interaction.initialArea ?? {
      x: interaction.start.x,
      y: interaction.start.y,
      width: 0,
      height: 0,
    };
    let left = initialArea.x;
    let right = initialArea.x + initialArea.width;
    let top = initialArea.y;
    let bottom = initialArea.y + initialArea.height;

    if (interaction.mode === 'new') {
      left = Math.min(interaction.start.x, point.x);
      right = Math.max(interaction.start.x, point.x);
      top = Math.min(interaction.start.y, point.y);
      bottom = Math.max(interaction.start.y, point.y);
    } else {
      if (interaction.mode.includes('w')) left = Math.min(point.x, right - 1);
      if (interaction.mode.includes('e')) right = Math.max(point.x, left + 1);
      if (interaction.mode.includes('n')) top = Math.min(point.y, bottom - 1);
      if (interaction.mode.includes('s')) bottom = Math.max(point.y, top + 1);
      left = Math.max(0, left);
      top = Math.max(0, top);
      right = Math.min(imageWidth, right);
      bottom = Math.min(imageHeight, bottom);
    }

    setCropArea({
      x: Math.max(0, left),
      y: Math.max(0, top),
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    });
  };

  const handleCropPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (cropInteractionRef.current?.pointerId !== event.pointerId) return;
    cropInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const isShowingSearchResults = isSearchOpen && searchQuery.trim().length > 0;
  const displayedMessages = isShowingSearchResults ? searchResults : messages;
  const videoViewerDrawing = parseVideoDrawing(videoViewer?.message.drawing_data);
  const ownSendingAvatar = messages.slice().reverse().find((message) => message.sender_id === currentUserId);
  const notificationSendersById = new Map<number, { id: number; name: string }>();
  for (const message of messages) {
    if (message.sender_id !== currentUserId) {
      notificationSendersById.set(message.sender_id, {
        id: message.sender_id,
        name: message.username,
      });
    }
  }
  for (const senderId of mutedChatSenderIds) {
    if (!notificationSendersById.has(senderId)) {
      notificationSendersById.set(senderId, { id: senderId, name: `Pengirim #${senderId}` });
    }
  }
  const notificationSenders = Array.from(notificationSendersById.values())
    .sort((left, right) => left.name.localeCompare(right.name, 'id'));

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent"
      style={chatWallpaperUrl ? {
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.18)), url("${chatWallpaperUrl}")`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
      } : undefined}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-slate-700 dark:bg-[#161b22]">
        {isWallpaperSettingsOpen ? (
          <button
            type="button"
            onClick={() => setIsWallpaperSettingsOpen(false)}
            aria-label="Kembali ke chat"
            title="Kembali ke chat"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            <Users className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-white">
            {isWallpaperSettingsOpen ? 'Pengaturan wallpaper' : 'Chat Staf & Admin'}
          </h1>
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {isWallpaperSettingsOpen ? 'Wallpaper ini hanya terlihat oleh akun Anda' : 'Grup bersama untuk staf dan administrator JRR'}
            </p>
            {isCallMinimized && !isWallpaperSettingsOpen && (
              <button
                type="button"
                onClick={() => setIsCallMinimized(false)}
                className="mt-0.5 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
              >
                Anda dalam panggilan · Kembali
              </button>
            )}
          </div>
        </div>
        {!isWallpaperSettingsOpen && (
          <>
            <div className="relative shrink-0" ref={notificationSettingsRef}>
              <button
                type="button"
                onClick={() => setIsNotificationSettingsOpen((open) => !open)}
                aria-label="Pengaturan notifikasi chat"
                aria-expanded={isNotificationSettingsOpen}
                aria-controls="chat-notification-settings"
                title="Pengaturan notifikasi chat"
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                  isChatNotificationsEnabled
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300'
                }`}
              >
                {isChatNotificationsEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </button>
              {isNotificationSettingsOpen && (
                <div
                  id="chat-notification-settings"
                  className="absolute right-0 top-full z-[140] mt-2 max-h-[min(70dvh,32rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#161b22]"
                >
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Pengaturan notifikasi</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Pengaturan ini hanya berlaku untuk akun Anda.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleChatNotificationsToggle()}
                    disabled={!isChatNotificationsSupported}
                    aria-pressed={isChatNotificationsEnabled}
                    className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800/70"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Notifikasi chat di perangkat
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        {isChatNotificationsSupported
                          ? isChatNotificationsEnabled ? 'Aktif' : 'Nonaktif'
                          : 'Tidak didukung browser ini'}
                      </span>
                    </span>
                    {isChatNotificationsEnabled
                      ? <Bell className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                      : <BellOff className="h-5 w-5 shrink-0 text-slate-400" />}
                  </button>
                  <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Notifikasi per pengirim
                    </h3>
                    {notificationSenders.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {notificationSenders.map((sender) => {
                          const isMuted = mutedChatSenderIds.includes(sender.id);
                          return (
                            <button
                              key={sender.id}
                              type="button"
                              onClick={() => handleToggleMutedChatSender(sender.id)}
                              aria-pressed={isMuted}
                              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                {sender.name}
                              </span>
                              <span className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${
                                isMuted
                                  ? 'text-slate-500 dark:text-slate-400'
                                  : 'text-emerald-700 dark:text-emerald-300'
                              }`}>
                                {isMuted
                                  ? <><VolumeX className="h-4 w-4" /> Dibisukan</>
                                  : <><Volume2 className="h-4 w-4" /> Aktif</>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Belum ada pengirim lain di percakapan.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(true);
                setSearchQuery('');
                setSearchResults([]);
                setSearchTotal(0);
                setSearchMatchIndex(0);
                setIsSearchingMessages(false);
              }}
              aria-label="Cari pesan"
              title="Cari pesan"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsWallpaperSettingsOpen(true)}
              aria-label="Ubah wallpaper chat"
              title="Ubah wallpaper chat"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <GroupCallControls
              currentUserId={currentUserId}
              isCallMinimized={isCallMinimized}
              onCallMinimizedChange={setIsCallMinimized}
            />
            <div className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:flex dark:bg-emerald-900/30 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Grup internal
            </div>
          </>
        )}
      </header>

      {isSearchOpen && !isWallpaperSettingsOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-[#161b22] sm:px-6">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={messageSearchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSearchQuery(value);
                setSearchResults([]);
                setSearchTotal(0);
                setSearchMatchIndex(0);
                setIsSearchingMessages(value.trim().length > 0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchTotal(0);
                  setIsSearchingMessages(false);
                }
              }}
              maxLength={200}
              placeholder="Cari teks dalam pesan..."
              aria-label="Cari pesan"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-[#0d1117] dark:text-slate-100 dark:focus:border-blue-700 dark:focus:ring-blue-950"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="min-w-14 text-center text-xs tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">
              {isSearchingMessages
                ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                : searchQuery.trim()
                  ? searchTotal > 100
                    ? `${searchMatchIndex + 1} / 100+`
                    : searchTotal > 0
                      ? `${searchMatchIndex + 1} / ${searchTotal}`
                      : '0 hasil'
                  : 'Cari'}
            </span>
            <button
              type="button"
              onClick={() => setSearchMatchIndex((index) => (
                searchResults.length ? (index - 1 + searchResults.length) % searchResults.length : index
              ))}
              disabled={searchResults.length < 2 || isSearchingMessages}
              aria-label="Hasil sebelumnya"
              title="Hasil sebelumnya"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSearchMatchIndex((index) => (
                searchResults.length ? (index + 1) % searchResults.length : index
              ))}
              disabled={searchResults.length < 2 || isSearchingMessages}
              aria-label="Hasil berikutnya"
              title="Hasil berikutnya"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
                setSearchResults([]);
                setSearchTotal(0);
                setIsSearchingMessages(false);
              }}
              aria-label="Tutup pencarian"
              title="Tutup pencarian"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isWallpaperSettingsOpen && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-8 dark:bg-[#0d1117]">
          <div className="mx-auto w-full max-w-lg">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Wallpaper chat grup</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Pilih tampilan latar belakang chat. Pengaturan ini hanya berlaku untuk akun Anda.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handleResetWallpaper()}
                disabled={isWallpaperLoading || isWallpaperSaving}
                aria-pressed={!chatWallpaperUrl}
                className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-white p-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#161b22] ${
                  !chatWallpaperUrl
                    ? 'border-blue-500 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
                }`}
              >
                <span className="flex h-16 w-full items-center justify-center rounded-xl bg-slate-50 text-xs font-medium text-slate-500 dark:bg-[#0d1117] dark:text-slate-400">
                  Default / kosong
                </span>
                <span>{!chatWallpaperUrl ? 'Sedang digunakan' : 'Gunakan bawaan'}</span>
              </button>
              <button
                type="button"
                onClick={() => wallpaperInputRef.current?.click()}
                disabled={isWallpaperLoading || isWallpaperSaving}
                className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  chatWallpaperUrl
                    ? 'border-blue-500 bg-white text-blue-700 dark:bg-[#161b22] dark:text-blue-300'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-[#161b22] dark:text-slate-200 dark:hover:border-blue-500'
                }`}
              >
                {chatWallpaperUrl ? (
                  <span
                    className="h-16 w-full rounded-xl bg-cover bg-center"
                    style={{ backgroundImage: `url("${chatWallpaperUrl}")` }}
                    aria-label="Pratinjau wallpaper kustom"
                  />
                ) : (
                  <span className="flex h-16 w-full items-center justify-center rounded-xl bg-slate-50 text-slate-400 dark:bg-[#0d1117]">
                    <ImagePlus className="h-6 w-6" />
                  </span>
                )}
                <span className="inline-flex items-center gap-2">
                  {isWallpaperSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isWallpaperSaving ? 'Menyimpan...' : chatWallpaperUrl ? 'Ganti gambar' : 'Atur gambar kustom'}
                </span>
              </button>
            </div>
            <input
              ref={wallpaperInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(event) => void handleWallpaperUpload(event.currentTarget.files?.[0])}
            />
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Format JPEG, PNG, GIF, atau WebP. Ukuran maksimal 5 MB.
            </p>
            {isWallpaperLoading && (
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat pengaturan wallpaper...
              </p>
            )}
          </div>
        </div>
      )}

      {!isWallpaperSettingsOpen && isMessageSelectionMode && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
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

      <div className={`relative min-h-0 flex-1 ${isWallpaperSettingsOpen ? 'hidden' : ''}`}>
        <div
          ref={messagesContainerRef}
          className="h-full space-y-3 overflow-y-auto overscroll-contain bg-transparent px-3 py-4 sm:px-6"
          onScroll={(event) => {
            const element = event.currentTarget;
            const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
            setShowScrollToBottom(distanceFromBottom >= 80);
            if (ignoreProgrammaticChatScrollRef.current) return;
            preserveSearchJumpPositionRef.current = false;
            shouldScrollRef.current = distanceFromBottom < 80;
          }}
          aria-live="polite"
          aria-label="Riwayat pesan chat"
        >
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat pesan...
          </div>
        ) : isShowingSearchResults && isSearchingMessages ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Mencari pesan...
          </div>
        ) : isShowingSearchResults && searchResults.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Search className="mb-3 h-8 w-8 text-slate-400" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Tidak ada pesan yang cocok</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Coba kata atau kalimat lain.</p>
          </div>
        ) : displayedMessages.length === 0 && pendingSendPreview === null ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <MessageCircle className="h-7 w-7" />
            </div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Mulai obrolan</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              {isDeveloper
                ? 'Belum ada pesan di grup staf dan administrator.'
                : 'Kirim pesan pertama untuk memulai percakapan dengan staf dan administrator.'}
            </p>
          </div>
        ) : (
          <>
          {displayedMessages.map((message) => {
            const ownMessage = isOwnMessage(message);
            const canDelete = canDeleteMessage(message);
            const isSelected = selectedMessageIds.includes(message.id);
            const senderName = message.username;
            const profileHref = getProfileHref(message);
            const videoDrawing = parseVideoDrawing(message.drawing_data);

            return (
              <div
                key={message.id}
                id={`chat-message-${message.id}`}
                className={`relative flex touch-pan-y scroll-m-4 rounded-xl transition-colors duration-500 ${
                  ownMessage ? 'justify-end' : 'justify-start'
                } ${isMessageSelectionMode ? 'pl-8' : ''} ${
                  isSearchOpen && searchResults[searchMatchIndex]?.id === message.id
                    ? 'bg-amber-200/70 dark:bg-amber-900/40'
                    : isSelected
                      ? 'bg-rose-100/70 dark:bg-rose-950/30'
                      : highlightedMessageId === message.id
                        ? 'bg-blue-100/70 dark:bg-blue-900/30'
                        : ''
                }`}
                onPointerDown={(event) => handleReplySwipeStart(event, message)}
                onPointerMove={(event) => handleReplySwipeMove(event, message)}
                onPointerUp={(event) => finishReplySwipe(event, message)}
                onPointerCancel={(event) => finishReplySwipe(event, message, true)}
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
                <div
                  className={`flex max-w-[92%] items-end gap-2 transition-transform duration-150 sm:max-w-[80%] ${
                  ownMessage
                    ? 'flex-row-reverse'
                    : message.is_sticker
                      ? 'flex-row'
                      : ''
                  } ${swipingMessage?.messageId === message.id ? '!transition-none' : ''}`}
                  style={{
                    transform: swipingMessage?.messageId === message.id
                      ? `translateX(${swipingMessage.deltaX}px)`
                      : undefined,
                  }}
                >
                  {(!message.is_sticker || message.media_url) && (
                    <Link
                      href={profileHref}
                      aria-label={`Lihat profil ${senderName}`}
                      title={`Lihat profil ${senderName}`}
                      className={`h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600 ring-1 ring-slate-300 transition hover:ring-blue-500 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600 ${
                        message.is_sticker ? 'mb-1' : ''
                      }`}
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
                    ? `min-w-0 ${
                        message.reply_to
                          ? `flex w-[min(18rem,70vw)] flex-col items-center rounded-2xl p-2 shadow-sm ${
                              ownMessage
                                ? 'bg-blue-600 text-white'
                                : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#161b22] dark:text-slate-100'
                            }`
                          : ''
                      }`
                    : `min-w-0 rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        ownMessage
                          ? 'rounded-br-sm bg-blue-600 text-white'
                          : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#161b22] dark:text-slate-100'
                      }`}>
                    {message.reply_to && (
                      <button
                        type="button"
                        onClick={() => handleQuotedMessageClick(message.reply_to!.id)}
                        disabled={Boolean(message.reply_to.deleted_at)}
                        className={`mb-2 block w-full rounded-lg border-l-2 border-blue-400 px-2.5 py-1.5 text-left transition disabled:cursor-default ${
                          message.is_sticker
                            ? `max-w-72 ${
                                ownMessage
                                  ? 'bg-blue-700 hover:bg-blue-800 disabled:hover:bg-blue-700'
                                  : 'bg-slate-100 hover:bg-slate-200 disabled:hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 dark:disabled:hover:bg-slate-800'
                              }`
                            : 'bg-black/5 hover:bg-black/10 disabled:hover:bg-black/5 dark:bg-white/5 dark:hover:bg-white/10 dark:disabled:hover:bg-white/5'
                        }`}
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
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[10px] font-semibold ${
                              ownMessage ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              {message.reply_to.deleted_at
                                ? 'Pesan tidak tersedia'
                                : getChatMessageType(message.reply_to)}
                            </span>
                            {!message.reply_to.deleted_at && message.reply_to.message && (
                              <span className={`block truncate text-xs ${
                                ownMessage ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'
                              }`}>
                                {message.reply_to.message}
                              </span>
                            )}
                          </span>
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
                          onClick={(event) => handleVideoPreviewClick(event, message, senderName)}
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
                          {videoDrawing && (
                            <VideoDrawingOverlay
                              drawing={videoDrawing}
                              className="pointer-events-none absolute inset-0 h-full w-full"
                            />
                          )}
                          <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/40 transition group-hover:scale-110 group-hover:bg-black/75">
                            <Play className="ml-1 h-7 w-7 fill-current" />
                          </span>
                        </button>
                      </div>
                    )}
                    {message.media_url && message.media_type?.startsWith('image/') && (
                      message.is_sticker ? (
                        <div
                          ref={stickerFavoritePromptId === message.id ? stickerFavoritePromptRef : null}
                          className={message.reply_to ? 'mx-auto' : ''}
                        >
                          <button
                            type="button"
                            aria-label={`Opsi stiker dari ${senderName}`}
                            aria-expanded={stickerFavoritePromptId === message.id}
                            onClick={() => {
                              if (suppressPhotoClickRef.current === message.id) {
                                suppressPhotoClickRef.current = null;
                                return;
                              }
                              setStickerFavoritePromptId((currentId) =>
                                currentId === message.id ? null : message.id
                              );
                            }}
                            className="relative block h-[clamp(7rem,16vw,14rem)] w-[clamp(7rem,16vw,14rem)] max-w-[70vw] overflow-hidden"
                          >
                            <Image
                              src={message.media_url}
                              alt={`Stiker dari ${senderName}`}
                              fill
                              unoptimized
                              draggable={false}
                              sizes="(min-width: 1280px) 224px, (min-width: 768px) 16vw, 112px"
                              className="pointer-events-none select-none object-contain"
                            />
                          </button>
                          {stickerFavoritePromptId === message.id && (
                            <button
                              type="button"
                              onClick={() => void handleAddStickerToFavorites(message.id)}
                              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-blue-700 shadow-md transition hover:bg-blue-50 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
                            >
                              <Star className="h-4 w-4" />
                              Tambahkan stiker ke favorit
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => handlePhotoPreviewClick(event, message)}
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
                            draggable={false}
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
                  {isShowingSearchResults && (
                    <button
                      type="button"
                      onClick={() => void handleJumpToSearchMessage(message.id)}
                      disabled={isJumpingToMessage}
                      aria-label={`Ke pesan dari ${senderName}`}
                      title="Buka pesan di percakapan"
                      className="mb-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:border-blue-900 dark:bg-[#161b22] dark:text-blue-300 dark:hover:bg-blue-950/40"
                    >
                      {isJumpingToMessage
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <ArrowRight className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">Ke pesan</span>
                    </button>
                  )}
                  <div
                    ref={openMessageActionsId === message.id ? messageActionsRef : null}
                    className="relative mb-1 shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMessageActionsPosition(null);
                        setOpenMessageActionsId((openId) => openId === message.id ? null : message.id);
                      }}
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
                    {openMessageActionsId === message.id && createPortal(
                      <div
                        ref={messageActionsMenuRef}
                        className="fixed z-[130] max-h-[min(75dvh,32rem)] w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-[#161b22]"
                        style={{
                          top: messageActionsPosition?.top ?? 0,
                          left: messageActionsPosition?.left ?? 0,
                          visibility: messageActionsPosition ? 'visible' : 'hidden',
                        }}
                      >
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
                        {message.message.trim() && !message.media_url && (
                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(message)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Copy className="h-4 w-4" />
                            Salin
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
                      </div>,
                      document.body
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {pendingSendPreview !== null && !isShowingSearchResults && (
            <div className="flex justify-end rounded-xl" role="status" aria-label="Mengirim pesan">
              <div className="flex max-w-[92%] flex-row-reverse items-end gap-2 sm:max-w-[80%]">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-blue-600/30 text-xs font-bold uppercase text-blue-200 ring-1 ring-slate-300 dark:ring-slate-600">
                  {ownSendingAvatar?.profile_photo ? (
                    <ProtectedProfilePhoto
                      src={ownSendingAvatar.profile_photo}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      {ownSendingAvatar?.username.charAt(0) || 'S'}
                    </span>
                  )}
                </div>
                <Loader2
                  className="mb-2 h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-300"
                  aria-hidden="true"
                />
                <article className="min-w-0 max-w-full rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-sm text-white opacity-80 shadow-sm">
                  <p className="break-words">{pendingSendPreview}</p>
                </article>
              </div>
            </div>
          )}
          </>
        )}
      </div>
      {showScrollToBottom && !isLoading && !isShowingSearchResults && (
        <button
          type="button"
          onClick={() => {
            const container = messagesContainerRef.current;
            if (!container) return;
            shouldScrollRef.current = true;
            preserveSearchJumpPositionRef.current = false;
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          }}
          aria-label="Gulir ke pesan terbaru"
          title="Gulir ke pesan terbaru"
          className="absolute bottom-4 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-lg transition hover:bg-white dark:border-slate-600 dark:bg-[#1c222b]/95 dark:text-slate-200 dark:hover:bg-[#252c35]"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
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
            <div className="relative inline-flex max-h-full max-w-full">
              <video
                src={videoViewer.url}
                controls
                autoPlay
                playsInline
                className="max-h-[calc(100dvh-5rem)] max-w-[95vw] rounded-lg"
                aria-label={`Video dari ${videoViewer.senderName}`}
              />
              {videoViewerDrawing && (
                <VideoDrawingOverlay
                  drawing={videoViewerDrawing}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {!isWallpaperSettingsOpen && (
      <form onSubmit={handleSubmit} className={`${isMediaComposerOpen ? 'z-[200]' : 'z-10'} relative shrink-0 bg-transparent px-2 pb-2 pt-2 sm:px-4 sm:pb-3`}>
        {replyTarget && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border-l-4 border-blue-500 bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Membalas {replyTarget.username} - {formatAccountRole(replyTarget)}
              </p>
              <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {getChatMessageType(replyTarget)}
              </p>
              {replyTarget.message && (
                <p className="truncate text-xs text-slate-600 dark:text-slate-300">{replyTarget.message}</p>
              )}
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
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {replyTarget ? 'Pilih stiker untuk membalas' : 'Stiker favorit'}
              </h2>
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
                      onClick={() => void handleSendSticker(
                        { favoriteId: sticker.id },
                        replyTarget?.id ?? null,
                      )}
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
        {attachmentPreviewUrl && attachmentFile && (!isMediaComposerOpen || attachmentFile.type.startsWith('audio/')) && (
          <div className="mb-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-[#0d1117]">
            {attachmentFile.type.startsWith('audio/') ? (
              <ChatAudioPlayer
                src={attachmentPreviewUrl}
                senderName="Pratinjau pesan suara"
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
        <div className="flex items-end gap-1 rounded-full border-0 bg-white/95 p-1.5 shadow-lg shadow-slate-900/10 backdrop-blur-md dark:bg-[#1c222b]/95 sm:gap-2">
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
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
            className="sr-only"
            aria-label="Pilih foto atau video untuk dikirim"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              handleAttachmentFile(file);
            }}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mp4,audio/webm,audio/ogg,audio/mpeg,audio/wav,audio/aac"
            className="sr-only"
            aria-label="Pilih audio untuk dikirim"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              handleAttachmentFile(file);
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
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
              isStickerPickerOpen
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
            }`}
          >
            <Smile className="h-5 w-5" />
          </button>
          <div ref={attachmentMenuRef} className="relative shrink-0">
            {isAttachmentMenuOpen && (
              <div
                role="menu"
                aria-label="Pilihan lampiran"
                className="absolute bottom-14 left-0 z-40 w-48 rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-[#1b1b1b] dark:text-white"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => attachmentInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                >
                  <ImagePlus className="h-4 w-4 text-sky-400" />
                  Foto &amp; Video
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => audioInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                >
                  <Music2 className="h-4 w-4 text-orange-400" />
                  Audio
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  title="Polling belum tersedia"
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-slate-400 dark:text-slate-500"
                >
                  <ListChecks className="h-4 w-4 text-amber-400" />
                  Polling
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAttachmentMenuOpen(false);
                    stickerInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                >
                  <Sticker className="h-4 w-4 text-emerald-400" />
                  Stiker baru
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsAttachmentMenuOpen((open) => !open)}
              disabled={isSending}
              aria-label="Buka pilihan lampiran"
              aria-expanded={isAttachmentMenuOpen}
              aria-haspopup="menu"
              title="Lampirkan"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition disabled:opacity-50 ${
                isAttachmentMenuOpen
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
              }`}
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </div>
          <div ref={composerLayerRef} className="relative min-h-10 min-w-0 flex-1">
            <div
              ref={composerHighlightRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-2.5 text-sm leading-5 text-slate-900 dark:text-white"
            >
              {draft ? <>{renderMessageWithLinks(draft, true, true)}{' '}</> : null}
            </div>
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              onScroll={(event) => {
                if (composerHighlightRef.current) {
                  composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
              disabled={isRecordingVoice}
              maxLength={2000}
              rows={1}
              placeholder="Tulis pesan..."
              aria-label="Tulis pesan"
              className="relative z-10 max-h-32 min-h-10 w-full resize-none !border-0 !bg-transparent px-2 py-2.5 text-sm leading-5 !text-transparent caret-slate-900 outline-none selection:bg-blue-200/60 selection:text-transparent placeholder:text-slate-500 focus:outline-none dark:caret-white dark:placeholder:text-slate-400"
            />
          </div>
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
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
            aria-label={isRecordingVoice ? 'Selesai merekam pesan suara' : 'Rekam pesan suara'}
            title={isRecordingVoice ? 'Selesai merekam' : 'Rekam pesan suara'}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isRecordingVoice
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
            }`}
          >
            {isRecordingVoice ? <X className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="submit"
            disabled={(!draft.trim() && !attachmentFile) || isSending || isRecordingVoice || isReadingAudioDuration}
            aria-label="Kirim pesan"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-[#161b22]"
          >
            {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        {isMediaComposerOpen && attachmentFile && attachmentPreviewUrl && (
          <div
            className="fixed inset-0 z-[150] flex select-none flex-col bg-white text-slate-900 dark:bg-[#111111] dark:text-white"
            role="dialog"
            aria-modal="true"
            aria-label={attachmentFile.type.startsWith('video/') ? 'Pratinjau video sebelum dikirim' : 'Edit foto sebelum dikirim'}
          >
            <div className="flex h-14 shrink-0 items-center justify-between px-3 sm:px-6">
              <button
                type="button"
                onClick={() => {
                  updateAttachment(null);
                  setIsMediaComposerOpen(false);
                  setIsCroppingAttachment(false);
                  setIsDrawingAttachment(false);
                  setDrawingStrokes([]);
                }}
                disabled={isSending}
                aria-label="Batalkan lampiran"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:text-slate-900 disabled:opacity-50 dark:text-white/80 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              {attachmentFile.type.startsWith('image/') ? (
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCroppingAttachment((active) => !active);
                      setIsDrawingAttachment(false);
                      if (!isCroppingAttachment && imageDimensions && !cropArea) {
                        setCropArea({ x: 0, y: 0, ...imageDimensions });
                      }
                    }}
                    aria-label={isCroppingAttachment ? 'Tutup alat potong' : 'Potong foto'}
                    title="Potong"
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                      isCroppingAttachment
                        ? 'text-blue-600 dark:text-blue-300'
                        : 'text-slate-600 hover:text-slate-900 dark:text-white/80 dark:hover:text-white'
                    }`}
                  >
                    <Crop className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawingAttachment((active) => !active);
                      setIsCroppingAttachment(false);
                    }}
                    aria-label={isDrawingAttachment ? 'Selesai mencoret' : 'Coret foto'}
                    title="Coret"
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                      isDrawingAttachment
                        ? 'text-blue-600 dark:text-blue-300'
                        : 'text-slate-600 hover:text-slate-900 dark:text-white/80 dark:hover:text-white'
                    }`}
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  {!isCroppingAttachment && !isDrawingAttachment && (
                    <span className="hidden px-2 text-xs text-slate-500 dark:text-white/60 sm:inline">Edit foto</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const video = mediaVideoRef.current;
                      if (!video) return;
                      if (video.paused) void video.play().catch((playError: unknown) => {
                        setError(playError instanceof Error ? playError.message : 'Video tidak dapat diputar.');
                      });
                      else video.pause();
                    }}
                    aria-label={isMediaVideoPlaying ? 'Jeda video' : 'Putar video'}
                    title={isMediaVideoPlaying ? 'Jeda video' : 'Putar video'}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:text-slate-900 dark:text-white/80 dark:hover:text-white"
                  >
                    {isMediaVideoPlaying
                      ? <Pause className="h-5 w-5" />
                      : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isCroppingAttachment) {
                    if (imageDimensions) setCropArea({ x: 0, y: 0, ...imageDimensions });
                  } else if (isDrawingAttachment) {
                    setDrawingStrokes([]);
                  } else {
                    setDraft('');
                  }
                }}
                disabled={isSending || (!isCroppingAttachment && !isDrawingAttachment && !draft)}
                aria-label={isCroppingAttachment ? 'Atur ulang potongan' : isDrawingAttachment ? 'Hapus semua coretan' : 'Hapus teks'}
                title={isCroppingAttachment ? 'Atur ulang potongan' : isDrawingAttachment ? 'Hapus coretan' : 'Hapus teks'}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-visible border-0 bg-transparent px-3 pb-3 shadow-none">
              {attachmentFile.type.startsWith('video/') ? (
                <div
                  className="relative shrink-0"
                  style={displayMediaSize ? { width: displayMediaSize.width, height: displayMediaSize.height } : undefined}
                >
                  <video
                    ref={mediaVideoRef}
                    src={attachmentPreviewUrl}
                    controls
                    playsInline
                    onLoadedMetadata={(event) => {
                      setImageDimensions({
                        width: event.currentTarget.videoWidth,
                        height: event.currentTarget.videoHeight,
                      });
                    }}
                    onPlay={() => setIsMediaVideoPlaying(true)}
                    onPause={() => setIsMediaVideoPlaying(false)}
                    className="block h-full w-full rounded-sm object-fill"
                    aria-label="Video yang akan dikirim"
                  />
                </div>
              ) : (
                <div
                  className={`relative shrink-0 ${isCroppingAttachment ? 'z-20' : ''} ${displayMediaSize ? '' : 'inline-block max-h-[68dvh] max-w-[90vw]'}`}
                  style={displayMediaSize ? { width: displayMediaSize.width, height: displayMediaSize.height } : undefined}
                >
                  <Image
                    src={attachmentPreviewUrl}
                    alt="Foto yang akan dikirim"
                    width={imageDimensions?.width || 1}
                    height={imageDimensions?.height || 1}
                    unoptimized
                    priority
                    draggable={false}
                    onLoad={(event) => {
                      const dimensions = {
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      };
                      setImageDimensions(dimensions);
                      setCropArea((area) => area ?? { x: 0, y: 0, ...dimensions });
                    }}
                    className={displayMediaSize
                      ? 'absolute inset-0 h-full w-full select-none object-fill'
                      : 'block max-h-[68dvh] max-w-[90vw] select-none object-contain'}
                  />
                  {(isDrawingAttachment || isCroppingAttachment) && imageDimensions && displayMediaSize && (
                    <svg
                      viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full touch-none select-none overflow-visible"
                      aria-label={isCroppingAttachment ? 'Area potong bebas' : 'Area coretan foto'}
                      onPointerDown={isCroppingAttachment ? handleCropPointerDown : (event) => {
                          if (event.button !== 0) return;
                          event.preventDefault();
                          const point = getDrawingPoint(event);
                          if (!point) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          drawingPointerRef.current = event.pointerId;
                          setDrawingStrokes((current) => [...current, { color: drawingColor, points: [point] }]);
                        }}
                      onPointerMove={isCroppingAttachment ? handleCropPointerMove : (event) => {
                          if (drawingPointerRef.current !== event.pointerId) return;
                          const point = getDrawingPoint(event);
                          if (!point) return;
                          setDrawingStrokes((current) => {
                            if (!current.length) return current;
                            const next = [...current];
                            const last = next[next.length - 1];
                            next[next.length - 1] = { ...last, points: [...last.points, point] };
                            return next;
                          });
                        }}
                      onPointerUp={isCroppingAttachment ? handleCropPointerEnd : (event) => {
                          if (drawingPointerRef.current !== event.pointerId) return;
                          drawingPointerRef.current = null;
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }
                        }}
                      onPointerCancel={isCroppingAttachment ? handleCropPointerEnd : () => {
                          drawingPointerRef.current = null;
                        }}
                    >
                      {isCroppingAttachment && cropArea && (
                        <>
                          <path
                            d={`M0 0H${imageDimensions.width}V${imageDimensions.height}H0Z M${cropArea.x} ${cropArea.y}h${cropArea.width}v${cropArea.height}h-${cropArea.width}Z`}
                            fill="rgba(0,0,0,0.58)"
                            fillRule="evenodd"
                            data-crop-mode="new"
                          />
                          {cropArea.width > 0 && cropArea.height > 0 && (
                            <>
                              <rect
                                x={cropArea.x}
                                y={cropArea.y}
                                width={cropArea.width}
                                height={cropArea.height}
                                fill="rgba(255,255,255,0.05)"
                                stroke="white"
                                strokeWidth={Math.max(2, Math.max(imageDimensions.width, imageDimensions.height) / 500)}
                                data-crop-mode="move"
                              />
                              {[
                                { mode: 'nw', x: cropArea.x, y: cropArea.y },
                                { mode: 'n', x: cropArea.x + cropArea.width / 2, y: cropArea.y },
                                { mode: 'ne', x: cropArea.x + cropArea.width, y: cropArea.y },
                                { mode: 'e', x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2 },
                                { mode: 'se', x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height },
                                { mode: 's', x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height },
                                { mode: 'sw', x: cropArea.x, y: cropArea.y + cropArea.height },
                                { mode: 'w', x: cropArea.x, y: cropArea.y + cropArea.height / 2 },
                              ].map((handle) => (
                                <circle
                                  key={handle.mode}
                                  cx={handle.x}
                                  cy={handle.y}
                                  r={Math.max(8, Math.max(imageDimensions.width, imageDimensions.height) / 70)}
                                  fill="white"
                                  stroke="#111111"
                                  strokeWidth={Math.max(2, Math.max(imageDimensions.width, imageDimensions.height) / 500)}
                                  data-crop-mode={handle.mode}
                                  vectorEffect="non-scaling-stroke"
                                />
                              ))}
                            </>
                          )}
                        </>
                      )}
                      {drawingStrokes.map((stroke, index) => (
                        <polyline
                          key={index}
                          points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')}
                          fill="none"
                          stroke={stroke.color}
                          strokeWidth={Math.max(4, imageDimensions.width / 180)}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  )}
                </div>
              )}
            </div>

            <div className="relative z-10 -mt-px shrink-0 border-0 bg-white px-3 pb-4 pt-3 shadow-none before:pointer-events-none before:absolute before:inset-x-0 before:-top-px before:h-1 before:bg-inherit before:content-[''] dark:bg-[#111111] sm:px-6">
              {isCroppingAttachment && (
                <p className="mx-auto mb-3 max-w-2xl border-0 bg-transparent text-center text-xs text-slate-500 shadow-none dark:text-white/65">
                  Tarik sisi atau sudut bingkai untuk mengatur ukuran crop. Tarik bagian tengah untuk memindahkannya.
                </p>
              )}
              {isDrawingAttachment && (
                <div className="mx-auto mb-3 flex max-w-2xl items-center justify-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-white/65">Warna pena</span>
                  {['#ff3b30', '#ffd60a', '#34c759', '#0a84ff', '#ffffff'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDrawingColor(color)}
                      aria-label={`Pilih warna ${color}`}
                      aria-pressed={drawingColor === color}
                      className={`h-6 w-6 rounded-full border-2 ${drawingColor === color ? 'border-slate-900 ring-2 ring-slate-900/25 dark:border-white dark:ring-white/40' : 'border-slate-400 dark:border-white/35'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setDrawingStrokes((strokes) => strokes.slice(0, -1))}
                    disabled={drawingStrokes.length === 0}
                    className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:text-white/80 dark:hover:bg-white/10"
                    aria-label="Urungkan coretan terakhir"
                    title="Urungkan"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex w-full items-center gap-1 rounded-full bg-slate-100 p-1.5 shadow-sm sm:gap-2 dark:bg-[#1c222b]">
                <textarea
                  ref={mediaCaptionRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  maxLength={2000}
                  rows={1}
                  placeholder="Ketik pesan"
                  aria-label="Tambahkan keterangan media"
                  className="max-h-32 min-h-10 min-w-0 flex-1 resize-none !rounded-none !border-0 !bg-transparent px-2 py-2.5 text-sm text-slate-900 outline-none placeholder:!text-slate-500 focus:!border-0 focus:!ring-0 dark:text-slate-100 dark:placeholder:!text-slate-400"
                />
                {isCroppingAttachment || (isDrawingAttachment && attachmentFile.type.startsWith('image/')) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isCroppingAttachment) void handleApplyPhotoEdit(cropArea, drawingStrokes);
                      else void handleApplyPhotoEdit(null, drawingStrokes);
                    }}
                    disabled={isSending || (isCroppingAttachment && (!cropArea || cropArea.width < 1 || cropArea.height < 1)) || (isDrawingAttachment && drawingStrokes.length === 0)}
                    aria-label={isCroppingAttachment ? 'Terapkan potongan foto' : 'Terapkan coretan foto'}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Check className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={(!draft.trim() && !attachmentFile) || isSending || isReadingAudioDuration}
                    aria-label="Kirim media"
                    title="Kirim"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 fill-current" />}
                  </button>
                )}
              </div>
              {error && <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-rose-300">{error}</p>}
            </div>
          </div>
        )}
      </form>
      )}
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
