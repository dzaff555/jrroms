'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowLeft, AudioLines, LoaderCircle, Mic, MicOff, MoreVertical, Phone, PhoneOff } from 'lucide-react';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

interface CallParticipant {
  id: number;
  username: string;
  profile_photo: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string | null;
  joined_at: string;
  connection_version: number;
  is_muted: boolean;
}

interface CallSession {
  id: string;
  started_by: number;
  started_at: string;
}

interface CallSignal {
  id: number;
  sender_id: number;
  type: 'offer' | 'answer' | 'candidate';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

interface CallApiResponse {
  success: boolean;
  error?: string;
  data?: {
    call?: (CallSession & { participants: CallParticipant[] }) | null;
    ended?: boolean;
    featureEnabled?: boolean;
    kicked?: boolean;
    participants?: CallParticipant[];
    signals?: CallSignal[];
  };
}

interface RemoteStream {
  userId: number;
  username: string;
  profilePhoto: string | null;
  stream: MediaStream;
  trackRevision: number;
  trackIds: string[];
}

interface PeerConnectionState {
  connection: RTCPeerConnection;
  remoteConnectionVersion: number;
  remoteStream: MediaStream | null;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  negotiationTimer: number | null;
  restartTimer: number | null;
  restartAttempts: number;
}

interface GroupCallControlsProps {
  currentUserId: number;
  isAdmin: boolean;
}

interface GroupCallUiStatus {
  featureEnabled: boolean;
  hasCheckedCallState: boolean;
  isLoading: boolean;
  isJoined: boolean;
  isMinimized: boolean;
  joinPrompt: boolean;
  participantCount: number;
  hasCall: boolean;
  isAdmin: boolean;
}

type GroupCallAction = 'audio' | 'return' | 'toggle-feature';

const GROUP_CALL_ACTION_EVENT = 'jrroms:group-call-action';
const GROUP_CALL_STATUS_EVENT = 'jrroms:group-call-status';
const GROUP_CALL_STATUS_REQUEST_EVENT = 'jrroms:group-call-status-request';

export function GroupCallHeaderControls({ mode }: { mode: 'controls' | 'status' }) {
  const [isOpen, setOpen] = useState(false);
  const [status, setStatus] = useState<GroupCallUiStatus>({
    hasCheckedCallState: false,
    featureEnabled: true,
    isLoading: false,
    isJoined: false,
    isMinimized: false,
    joinPrompt: false,
    participantCount: 0,
    hasCall: false,
    isAdmin: false,
  });

  useEffect(() => {
    const handleStatus = (event: Event) => {
      setStatus((event as CustomEvent<GroupCallUiStatus>).detail);
    };
    window.addEventListener(GROUP_CALL_STATUS_EVENT, handleStatus);
    window.dispatchEvent(new Event(GROUP_CALL_STATUS_REQUEST_EVENT));
    return () => window.removeEventListener(GROUP_CALL_STATUS_EVENT, handleStatus);
  }, []);

  const trigger = (action: GroupCallAction) => {
    window.dispatchEvent(new CustomEvent<GroupCallAction>(GROUP_CALL_ACTION_EVENT, { detail: action }));
  };

  if (mode === 'status') {
    return status.isJoined && status.isMinimized ? (
      <button
        type="button"
        onClick={() => trigger('return')}
        className="mt-0.5 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
      >
        Anda dalam panggilan · Kembali
      </button>
    ) : null;
  }

  if (!status.featureEnabled && !status.isAdmin) return null;

  if (status.isJoined && !status.isAdmin) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Opsi telepon"
        aria-expanded={isOpen}
        title="Opsi telepon"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-[160] mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {status.featureEnabled && !status.isJoined && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger('audio');
              }}
              disabled={status.isLoading || !status.hasCheckedCallState}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {status.isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              {status.joinPrompt ? `Gabung telepon · ${status.participantCount}` : status.hasCall ? 'Gabung telepon' : 'Mulai telepon'}
            </button>
          )}
          {status.isAdmin && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger('toggle-feature');
              }}
              disabled={status.isLoading}
              className="flex w-full items-center px-3 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              {status.featureEnabled ? 'Matikan fitur telepon' : 'Aktifkan fitur telepon'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CallRestoreState {
  callId: string;
  signalCursor: number;
}

function getCallRestoreState(userId: number): CallRestoreState | null {
  try {
    const saved = sessionStorage.getItem(`group-call:${userId}`);
    if (!saved) return null;
    const state = JSON.parse(saved) as Partial<CallRestoreState>;
    return typeof state.callId === 'string' &&
      typeof state.signalCursor === 'number' &&
      Number.isSafeInteger(state.signalCursor) &&
      state.signalCursor >= 0
      ? { callId: state.callId, signalCursor: state.signalCursor }
      : null;
  } catch (error) {
    console.error('Failed to restore the previous group call:', error);
    return null;
  }
}

function saveCallRestoreState(userId: number, state: CallRestoreState) {
  try {
    sessionStorage.setItem(`group-call:${userId}`, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save the group call for refresh recovery:', error);
  }
}

function clearCallRestoreState(userId: number, callId: string | null) {
  if (!callId) return;
  try {
    const key = `group-call:${userId}`;
    const saved = getCallRestoreState(userId);
    if (saved?.callId === callId) sessionStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear the restored group call state:', error);
  }
}

function participantsAreEqual(left: CallParticipant[], right: CallParticipant[]) {
  return left.length === right.length && left.every((participant, index) => (
    participant.id === right[index].id &&
    participant.username === right[index].username &&
    participant.profile_photo === right[index].profile_photo &&
    participant.role === right[index].role &&
    participant.attendance_role === right[index].attendance_role &&
    participant.joined_at === right[index].joined_at &&
    participant.connection_version === right[index].connection_version &&
    Boolean(participant.is_muted) === Boolean(right[index].is_muted)
  ));
}

function useSpeakingUsers(
  localStream: MediaStream | null,
  remoteStreams: RemoteStream[],
  isMuted: boolean
) {
  const [speakingUserIds, setSpeakingUserIds] = useState<number[]>([]);

  useEffect(() => {
    const sources = [
      ...(localStream && !isMuted ? [{ userId: 0, stream: localStream }] : []),
      ...remoteStreams.map(({ userId, stream }) => ({ userId, stream })),
    ].filter(({ stream }) => stream.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled));

    if (sources.length === 0) {
      const frameId = requestAnimationFrame(() => {
        setSpeakingUserIds((previous) => previous.length ? [] : previous);
      });
      return () => cancelAnimationFrame(frameId);
    }

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContext({ latencyHint: 'interactive' });
    } catch (audioError) {
      console.error('Failed to initialize group-call audio activity detection:', audioError);
      return;
    }

    const analysers = sources.map(({ userId, stream }) => {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      return { userId, analyser, samples: new Uint8Array(analyser.fftSize) };
    });
    void audioContext.resume().catch((audioError: unknown) => {
      console.error('Failed to activate call audio activity detection:', audioError);
    });

    let frameId = 0;
    let lastUpdate = 0;
    const detectSpeaking = (timestamp: number) => {
      if (timestamp - lastUpdate >= 100) {
        lastUpdate = timestamp;
        const activeUsers = analysers
          .filter(({ analyser, samples }) => {
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) {
              const amplitude = (sample - 128) / 128;
              sum += amplitude * amplitude;
            }
            return Math.sqrt(sum / samples.length) > 0.055;
          })
          .map(({ userId }) => userId)
          .sort((left, right) => left - right);

        setSpeakingUserIds((previous) => (
          previous.length === activeUsers.length &&
          previous.every((userId, index) => userId === activeUsers[index])
            ? previous
            : activeUsers
        ));
      }
      frameId = requestAnimationFrame(detectSpeaking);
    };
    frameId = requestAnimationFrame(detectSpeaking);

    return () => {
      cancelAnimationFrame(frameId);
      analysers.forEach(({ analyser }) => analyser.disconnect());
      void audioContext.close().catch((audioError: unknown) => {
        console.error('Failed to close call audio activity detection:', audioError);
      });
    };
  }, [isMuted, localStream, remoteStreams]);

  return speakingUserIds;
}

const ParticipantTile = memo(function ParticipantTile({
  name,
  profilePhoto,
  stream,
  trackRevision = 0,
  isSpeaking,
  isMuted = false,
  isLocal = false,
  isAdmin = false,
  onModerate,
  isModerating = false,
}: {
  name: string;
  profilePhoto: string | null;
  stream: MediaStream | null;
  trackRevision?: number;
  isSpeaking: boolean;
  isMuted?: boolean;
  isLocal?: boolean;
  isAdmin?: boolean;
  onModerate?: (action: 'mute' | 'unmute' | 'kick') => void;
  isModerating?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isLocal || !stream?.getAudioTracks().length) return;

    audio.srcObject = stream;
    const attemptPlayback = () => {
      if (!audio.paused) return;
      void audio.play().then(() => {
        setAudioPlaybackBlocked(false);
      }).catch((playError: unknown) => {
        if (playError instanceof DOMException && playError.name === 'NotAllowedError') {
          setAudioPlaybackBlocked(true);
          return;
        }
        if (!(playError instanceof DOMException && playError.name === 'AbortError')) {
          console.error('Failed to play remote group-call audio:', playError);
        }
      });
    };
    const playAudio = () => {
      attemptPlayback();
    };
    const tracks = stream.getAudioTracks();
    tracks.forEach((track) => track.addEventListener('unmute', playAudio));
    window.addEventListener('pointerdown', attemptPlayback);
    window.addEventListener('keydown', attemptPlayback);
    playAudio();

    return () => {
      tracks.forEach((track) => track.removeEventListener('unmute', playAudio));
      window.removeEventListener('pointerdown', attemptPlayback);
      window.removeEventListener('keydown', attemptPlayback);
      audio.pause();
      audio.srcObject = null;
    };
  }, [isLocal, stream, trackRevision]);

  return (
    <div
      className={`relative aspect-video min-h-48 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-slate-900 transition-[border-color,box-shadow] duration-150 dark:border-white/10 dark:bg-slate-900 dark:text-white sm:min-h-0 ${
        isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_22px_rgba(52,211,153,0.3)]'
          : ''
      }`}
      aria-label={`${name}${isSpeaking ? ' sedang berbicara' : ''}`}
    >
      {!isLocal && stream?.getAudioTracks().length ? (
        <>
          <audio ref={audioRef} autoPlay playsInline className="sr-only" />
          {audioPlaybackBlocked && (
            <button
              type="button"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                void audio.play().then(() => setAudioPlaybackBlocked(false)).catch((playError: unknown) => {
                  console.error('Failed to enable remote group-call audio:', playError);
                });
              }}
              className="absolute right-2 top-2 z-10 rounded-full bg-amber-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 shadow-lg"
            >
              Aktifkan suara {name}
            </button>
          )}
        </>
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <div className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-xl font-bold sm:h-20 sm:w-20 sm:text-2xl ${
          isSpeaking ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-white'
        }`}>
          {profilePhoto ? (
            <ProtectedProfilePhoto src={profilePhoto} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>
      </div>
      <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 truncate rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow sm:bottom-3 sm:left-3 sm:px-3 dark:bg-black/65 dark:text-white">
        <span className="truncate">{name}</span>
        {isMuted === true && (
          <span
            className="inline-flex shrink-0"
            role="img"
            aria-label="Mikrofon mati"
            title="Mikrofon mati"
          >
            <MicOff className="h-3.5 w-3.5 text-rose-700 dark:text-rose-300" />
          </span>
        )}
      </span>
      {isSpeaking && (
        <span className="absolute right-2 top-2 rounded-full bg-emerald-500/90 px-2 py-1 text-[10px] font-bold text-white sm:right-3 sm:top-3">
          Berbicara
        </span>
      )}
      {isAdmin && !isLocal && onModerate && (
        <div className="absolute bottom-2 right-2 z-20 sm:bottom-3 sm:right-3">
          <button
            type="button"
            onClick={() => setIsActionsOpen((open) => !open)}
            aria-label={`Opsi peserta ${name}`}
            aria-expanded={isActionsOpen}
            disabled={isModerating}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 transition hover:bg-slate-300 disabled:opacity-50 dark:bg-black/70 dark:text-white dark:hover:bg-black"
          >
            {isModerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </button>
          {isActionsOpen && (
            <div className="absolute bottom-10 right-0 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setIsActionsOpen(false);
                  onModerate(isMuted ? 'unmute' : 'mute');
                }}
                disabled={isModerating}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:text-white dark:hover:bg-slate-800"
              >
                {isMuted ? 'Nyalakan mikrofon' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsActionsOpen(false);
                  onModerate('kick');
                }}
                disabled={isModerating}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-slate-800"
              >
                Keluarkan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

async function postCallAction(body: Record<string, unknown>) {
  const response = await fetch('/api/chat/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json() as CallApiResponse;
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Panggilan tidak dapat diperbarui.');
  }
  return result;
}

async function postSignal(
  callId: string,
  targetId: number,
  type: CallSignal['type'],
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit
) {
  await postCallAction({ action: 'signal', callId, targetId, type, payload });
}

function hasLocalOffer(connection: RTCPeerConnection) {
  return connection.signalingState === 'have-local-offer';
}

function getMediaSectionCount(sdp: string | undefined) {
  return sdp?.match(/^m=/gm)?.length ?? 0;
}

export function GroupCallControls({ currentUserId, isAdmin }: GroupCallControlsProps) {
  const pathname = usePathname();
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const previousPathnameRef = useRef(pathname);
  const [restoreState] = useState<CallRestoreState | null>(() =>
    typeof window === 'undefined' ? null : getCallRestoreState(currentUserId)
  );
  const [hasLoadedRestoreState] = useState(() => typeof window !== 'undefined');
  const [call, setCall] = useState<CallSession | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [hasCheckedCallState, setHasCheckedCallState] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [peerConnectionStates, setPeerConnectionStates] = useState<Record<number, RTCPeerConnectionState>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVoiceIsolationEnabled, setIsVoiceIsolationEnabled] = useState(true);
  const [isVoiceIsolationOpen, setIsVoiceIsolationOpen] = useState(false);
  const [isCallFeatureEnabled, setIsCallFeatureEnabled] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isRestoringCall, setIsRestoringCall] = useState(false);
  const [moderatingParticipantId, setModeratingParticipantId] = useState<number | null>(null);
  const [isAdminCallMenuOpen, setIsAdminCallMenuOpen] = useState(false);
  const [kickNotice, setKickNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peersRef = useRef(new Map<number, PeerConnectionState>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<CallSession | null>(null);
  const joinedRef = useRef(false);
  const lastSignalIdRef = useRef(0);
  const pollingRef = useRef(false);
  const hasCheckedCallStateRef = useRef(false);
  const restoreAttemptCallIdRef = useRef<string | null>(null);
  const remoteStreamsRef = useRef(new Map<number, RemoteStream>());
  const isCallFeatureEnabledRef = useRef(true);
  const voiceIsolationMenuRef = useRef<HTMLDivElement>(null);
  const speakingUsers = useSpeakingUsers(localStream, remoteStreams, isMuted);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname && isJoined && call) {
      setIsCallMinimized(true);
    }
    previousPathnameRef.current = pathname;
  }, [call, isJoined, pathname]);

  useEffect(() => {
    if (!isVoiceIsolationOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !voiceIsolationMenuRef.current?.contains(event.target)) {
        setIsVoiceIsolationOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsVoiceIsolationOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isVoiceIsolationOpen]);

  const closePeerConnections = useCallback(() => {
    for (const peer of peersRef.current.values()) {
      if (peer.negotiationTimer !== null) window.clearTimeout(peer.negotiationTimer);
      if (peer.restartTimer !== null) window.clearTimeout(peer.restartTimer);
      peer.connection.close();
    }
    peersRef.current.clear();
    setPeerConnectionStates({});
    setRemoteStreams([]);
    remoteStreamsRef.current.clear();
  }, []);

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const leaveCall = useCallback(async (notifyServer = true) => {
    const activeCall = callRef.current;
    joinedRef.current = false;
    callRef.current = null;
    setIsJoined(false);
    setIsCallMinimized(false);
    setCall(null);
    setParticipants([]);
    closePeerConnections();
    stopLocalMedia();
    setIsMuted(true);
    setIsVoiceIsolationEnabled(true);
    setIsVoiceIsolationOpen(false);
    clearCallRestoreState(currentUserId, activeCall?.id ?? null);
    if (notifyServer && activeCall) {
      try {
        await postCallAction({ action: 'leave', callId: activeCall.id });
      } catch (leaveError) {
        console.error('Failed to leave group call:', leaveError);
        setError(leaveError instanceof Error ? leaveError.message : 'Gagal keluar dari panggilan.');
      }
    }
  }, [closePeerConnections, currentUserId, stopLocalMedia]);

  const ensurePeerConnection = useCallback((peer: CallParticipant, activeCall: CallSession) => {
    const existing = peersRef.current.get(peer.id);
    if (existing?.remoteConnectionVersion === peer.connection_version) return existing;
    if (existing) {
      if (existing.negotiationTimer !== null) window.clearTimeout(existing.negotiationTimer);
      if (existing.restartTimer !== null) window.clearTimeout(existing.restartTimer);
      existing.connection.close();
      peersRef.current.delete(peer.id);
      remoteStreamsRef.current.delete(peer.id);
      setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
    }

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      bundlePolicy: 'max-bundle',
      iceCandidatePoolSize: 4,
    });
    const peerState: PeerConnectionState = {
      connection,
      remoteConnectionVersion: peer.connection_version,
      remoteStream: null,
      polite: currentUserId > peer.id,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      negotiationTimer: null,
      restartTimer: null,
      restartAttempts: 0,
    };
    peersRef.current.set(peer.id, peerState);
    setPeerConnectionStates((current) => ({ ...current, [peer.id]: connection.connectionState }));

    for (const track of localStreamRef.current?.getTracks() || []) {
      connection.addTrack(track, localStreamRef.current!);
    }

    connection.onicecandidate = (event) => {
      if (event.candidate && joinedRef.current) {
        void postSignal(activeCall.id, peer.id, 'candidate', event.candidate.toJSON()).catch((signalError: unknown) => {
          console.error('Failed to send call network candidate:', signalError);
          setError(signalError instanceof Error ? signalError.message : 'Koneksi panggilan gagal.');
        });
      }
    };

    connection.ontrack = (event) => {
      const stream = event.streams[0] || peerState.remoteStream || new MediaStream();
      peerState.remoteStream = stream;
      if (!stream.getTracks().some((track) => track.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      const previousRemote = remoteStreamsRef.current.get(peer.id);
      const trackIds = stream.getTracks().map((track) => track.id);
      const isNewTrack = !previousRemote?.trackIds.includes(event.track.id);
      if (!isNewTrack && previousRemote) return;
      const remote = {
        userId: peer.id,
        username: peer.username,
        profilePhoto: peer.profile_photo,
        stream,
        trackRevision: (previousRemote?.trackRevision ?? 0) + 1,
        trackIds,
      };
      remoteStreamsRef.current.set(peer.id, remote);
      setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
    };

    const negotiate = async () => {
      peerState.negotiationTimer = null;
      if (!joinedRef.current || connection.connectionState === 'closed') return;
      if (!connection.remoteDescription && currentUserId > peer.id) return;
      if (connection.signalingState !== 'stable' || peerState.makingOffer) {
        peerState.negotiationTimer = window.setTimeout(() => void negotiate(), 300);
        return;
      }
      try {
        peerState.makingOffer = true;
        await connection.setLocalDescription();
        if (connection.localDescription) {
          await postSignal(activeCall.id, peer.id, 'offer', connection.localDescription.toJSON());
        }
      } catch (negotiationError) {
        console.error('Failed to negotiate group call:', negotiationError);
        setError(`Tidak dapat menghubungkan audio dengan ${peer.username}. Mencoba kembali...`);
        if (hasLocalOffer(connection)) {
          await connection.setLocalDescription({ type: 'rollback' }).catch((rollbackError: unknown) => {
            console.error('Failed to roll back the unsent group-call offer:', rollbackError);
          });
        }
        peerState.negotiationTimer = window.setTimeout(() => void negotiate(), 1500);
      } finally {
        peerState.makingOffer = false;
      }
    };
    connection.onnegotiationneeded = () => void negotiate();

    const restartIce = async () => {
      peerState.restartTimer = null;
      if (!joinedRef.current || connection.connectionState === 'closed') return;
      if (currentUserId > peer.id) return;
      if (peerState.restartAttempts >= 3) {
        setError(`Koneksi audio dengan ${peer.username} gagal. Coba keluar lalu bergabung kembali.`);
        return;
      }
      if (connection.signalingState !== 'stable' || peerState.makingOffer) {
        peerState.restartTimer = window.setTimeout(() => void restartIce(), 1000);
        return;
      }

      peerState.restartAttempts += 1;
      peerState.makingOffer = true;
      try {
        const offer = await connection.createOffer({ iceRestart: true });
        await connection.setLocalDescription(offer);
        if (connection.localDescription) {
          await postSignal(activeCall.id, peer.id, 'offer', connection.localDescription.toJSON());
        }
      } catch (restartError) {
        console.error(`Failed to restart group-call connection with ${peer.username}:`, restartError);
        if (hasLocalOffer(connection)) {
          await connection.setLocalDescription({ type: 'rollback' }).catch((rollbackError: unknown) => {
            console.error('Failed to roll back the unsent ICE restart offer:', rollbackError);
          });
        }
        peerState.restartTimer = window.setTimeout(() => void restartIce(), 1500 * peerState.restartAttempts);
      } finally {
        peerState.makingOffer = false;
      }
    };

    connection.onconnectionstatechange = () => {
      setPeerConnectionStates((current) => ({ ...current, [peer.id]: connection.connectionState }));
      if (connection.connectionState === 'connected') {
        peerState.restartAttempts = 0;
        if (peerState.restartTimer !== null) {
          window.clearTimeout(peerState.restartTimer);
          peerState.restartTimer = null;
        }
      } else if (connection.connectionState === 'failed') {
        if (peerState.restartTimer !== null) window.clearTimeout(peerState.restartTimer);
        void restartIce();
      } else if (connection.connectionState === 'disconnected') {
        if (peerState.restartTimer !== null) window.clearTimeout(peerState.restartTimer);
        peerState.restartTimer = window.setTimeout(() => {
          peerState.restartTimer = null;
          if (connection.connectionState === 'disconnected') void restartIce();
        }, 3500);
      } else if (connection.connectionState === 'closed') {
        if (peerState.negotiationTimer !== null) window.clearTimeout(peerState.negotiationTimer);
        if (peerState.restartTimer !== null) window.clearTimeout(peerState.restartTimer);
        remoteStreamsRef.current.delete(peer.id);
        setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
      }
    };
    return peerState;
  }, [currentUserId]);

  const handleSignal = useCallback(async (signal: CallSignal, peer: CallParticipant, activeCall: CallSession) => {
    const peerState = ensurePeerConnection(peer, activeCall);
    const { connection } = peerState;

    if (signal.type === 'candidate') {
      const candidate = signal.payload as RTCIceCandidateInit;
      if (connection.remoteDescription) await connection.addIceCandidate(candidate);
      else peerState.pendingCandidates.push(candidate);
      return;
    }

    const description = signal.payload as RTCSessionDescriptionInit;
    const previousRemoteDescription = connection.remoteDescription;
    if (
      description.type === 'offer' &&
      previousRemoteDescription &&
      getMediaSectionCount(description.sdp) < getMediaSectionCount(previousRemoteDescription.sdp)
    ) {
      console.warn('Ignoring a stale group-call offer with fewer media sections.');
      return;
    }

    const isRepeatedOffer = description.type === 'offer' &&
      previousRemoteDescription?.type === 'offer' &&
      previousRemoteDescription.sdp === description.sdp &&
      connection.signalingState === 'have-remote-offer';
    const collision = description.type === 'offer' && !isRepeatedOffer &&
      (peerState.makingOffer || connection.signalingState === 'have-local-offer');
    peerState.ignoreOffer = !peerState.polite && collision;
    if (peerState.ignoreOffer) return;

    if (description.type === 'answer' && connection.signalingState !== 'have-local-offer') return;
    if (description.type === 'offer' && !isRepeatedOffer) {
      if (collision && connection.signalingState === 'have-local-offer') {
        await connection.setLocalDescription({ type: 'rollback' });
      }
      await connection.setRemoteDescription(description);
    } else if (description.type === 'answer') {
      if (connection.signalingState !== 'have-local-offer') return;
      await connection.setRemoteDescription(description);
    }

    while (peerState.pendingCandidates.length) {
      const candidate = peerState.pendingCandidates[0];
      try {
        await connection.addIceCandidate(candidate);
      } catch (candidateError) {
        console.warn('Discarding an invalid queued group-call candidate:', candidateError);
      }
      peerState.pendingCandidates.shift();
    }

    if (description.type === 'offer') {
      await connection.setLocalDescription();
      if (connection.localDescription) {
        await postSignal(activeCall.id, peer.id, 'answer', connection.localDescription.toJSON());
      }
    }
  }, [ensurePeerConnection]);

  const pollCall = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const activeCall = callRef.current;
      const params = new URLSearchParams();
      if (activeCall) {
        params.set('callId', activeCall.id);
        params.set('after', String(lastSignalIdRef.current));
      } else if (!hasCheckedCallStateRef.current) {
        if (restoreState) params.set('restoreCallId', restoreState.callId);
      }
      const response = await fetch(`/api/chat/call?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json() as CallApiResponse;
      if (!response.ok || !result.success) throw new Error(result.error || 'Gagal memeriksa panggilan.');
      const featureEnabled = result.data?.featureEnabled !== false;
      isCallFeatureEnabledRef.current = featureEnabled;
      setIsCallFeatureEnabled(featureEnabled);

      if (!activeCall) {
        hasCheckedCallStateRef.current = true;
        setHasCheckedCallState(true);
        if (result.data?.kicked) {
          setKickNotice(true);
          clearCallRestoreState(currentUserId, restoreState?.callId ?? null);
          setIsCallMinimized(false);
          setCall(null);
          setParticipants([]);
          return;
        }
        const discoveredCall = result.data?.call;
        if (discoveredCall) {
          setCall((current) => current?.id === discoveredCall.id ? current : discoveredCall);
          setParticipants((current) => participantsAreEqual(current, discoveredCall.participants)
            ? current
            : discoveredCall.participants);
        } else {
          setCall((current) => current === null ? current : null);
          setParticipants((current) => current.length === 0 ? current : []);
        }
        return;
      }

      if (!featureEnabled) {
        await leaveCall(false);
        return;
      }

      if (result.data?.kicked) {
        setKickNotice(true);
        await leaveCall(false);
        return;
      }

      if (result.data?.ended) {
        await leaveCall(false);
        return;
      }

      const nextParticipants = result.data?.participants || [];
      setParticipants((current) => participantsAreEqual(current, nextParticipants) ? current : nextParticipants);
      const currentParticipant = nextParticipants.find((participant) => participant.id === currentUserId);
      if (currentParticipant && Boolean(currentParticipant.is_muted) !== isMuted) {
        const shouldMute = Boolean(currentParticipant.is_muted);
        localStreamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = !shouldMute;
        });
        setIsMuted(shouldMute);
      }
      const activeParticipantIds = new Set(nextParticipants.map((participant) => participant.id));
      let removedParticipant = false;
      for (const [participantId, peerState] of peersRef.current) {
        if (activeParticipantIds.has(participantId)) continue;
        if (peerState.negotiationTimer !== null) window.clearTimeout(peerState.negotiationTimer);
        if (peerState.restartTimer !== null) window.clearTimeout(peerState.restartTimer);
        peerState.connection.close();
        peersRef.current.delete(participantId);
        remoteStreamsRef.current.delete(participantId);
        removedParticipant = true;
      }
      if (removedParticipant) {
        setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
        setPeerConnectionStates((current) => Object.fromEntries(
          Object.entries(current).filter(([participantId]) => activeParticipantIds.has(Number(participantId)))
        ));
      }
      for (const participant of nextParticipants) {
        if (participant.id !== currentUserId) ensurePeerConnection(participant, activeCall);
      }

      for (const signal of result.data?.signals || []) {
        const peer = nextParticipants.find((participant) => participant.id === signal.sender_id);
        if (!peer) {
          lastSignalIdRef.current = Math.max(lastSignalIdRef.current, signal.id);
          saveCallRestoreState(currentUserId, {
            callId: activeCall.id,
            signalCursor: lastSignalIdRef.current,
          });
          continue;
        }
        try {
          await handleSignal(signal, peer, activeCall);
          lastSignalIdRef.current = Math.max(lastSignalIdRef.current, signal.id);
          saveCallRestoreState(currentUserId, {
            callId: activeCall.id,
            signalCursor: lastSignalIdRef.current,
          });
        } catch (signalError) {
          if (signal.type === 'candidate') {
            console.warn('Discarding an invalid group-call network candidate:', signalError);
            lastSignalIdRef.current = Math.max(lastSignalIdRef.current, signal.id);
            saveCallRestoreState(currentUserId, {
              callId: activeCall.id,
              signalCursor: lastSignalIdRef.current,
            });
          } else {
            console.error('Failed to process group call signal; it will be retried:', signalError);
            setError(`Menyambungkan audio dengan ${peer.username}...`);
            break;
          }
        }
      }
    } catch (pollError) {
      if (joinedRef.current) {
        console.error('Failed to poll group call:', pollError);
        setError(pollError instanceof Error ? pollError.message : 'Gagal menyinkronkan panggilan.');
      }
    } finally {
      pollingRef.current = false;
    }
  }, [currentUserId, ensurePeerConnection, handleSignal, isMuted, leaveCall, restoreState]);

  useEffect(() => {
    if (!hasLoadedRestoreState) return;
    const timer = window.setTimeout(() => void pollCall(), 0);
    const interval = window.setInterval(() => void pollCall(), 2000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void pollCall();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasLoadedRestoreState, pollCall]);

  useEffect(() => {
    const peers = peersRef.current;
    return () => {
      joinedRef.current = false;
      for (const peer of peers.values()) {
        if (peer.negotiationTimer !== null) window.clearTimeout(peer.negotiationTimer);
        if (peer.restartTimer !== null) window.clearTimeout(peer.restartTimer);
        peer.connection.close();
      }
      peers.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const joinCall = useCallback(async (callToJoin: CallSession) => {
    if (isStarting) return;
    setIsStarting(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser ini tidak mendukung akses mikrofon dan kamera.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      const joining = await postCallAction({ action: 'join', callId: callToJoin.id });
      if (!joining.success) throw new Error(joining.error || 'Tidak dapat bergabung ke panggilan.');
      saveCallRestoreState(currentUserId, {
        callId: callToJoin.id,
        signalCursor: restoreState?.callId === callToJoin.id ? restoreState.signalCursor : 0,
      });
      localStreamRef.current = stream;
      callRef.current = callToJoin;
      joinedRef.current = true;
      lastSignalIdRef.current = restoreState?.callId === callToJoin.id ? restoreState.signalCursor : 0;
      setLocalStream(stream);
      setCall(callToJoin);
      setIsMuted(true);
      setIsJoined(true);
      setIsCallMinimized(false);
      await pollCall();
    } catch (joinError) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setError(joinError instanceof Error ? joinError.message : 'Tidak dapat memulai panggilan.');
    } finally {
      setIsStarting(false);
    }
  }, [currentUserId, isStarting, pollCall, restoreState]);

  const startCall = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser ini tidak mendukung akses mikrofon dan kamera.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const result = await postCallAction({ action: 'start' });
      const startedCall = result.data?.call;
      if (!startedCall) throw new Error(result.error || 'Server tidak mengembalikan sesi panggilan.');
      saveCallRestoreState(currentUserId, { callId: startedCall.id, signalCursor: 0 });
      callRef.current = startedCall;
      joinedRef.current = true;
      lastSignalIdRef.current = 0;
      setCall(startedCall);
      setIsMuted(true);
      setIsJoined(true);
      setIsCallMinimized(false);
      await pollCall();
    } catch (startError) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setError(startError instanceof Error ? startError.message : 'Tidak dapat memulai panggilan.');
    } finally {
      setIsStarting(false);
    }
  }, [currentUserId, isStarting, pollCall]);

  useEffect(() => {
    if (!hasCheckedCallState || !call || isJoined || !restoreState) return;
    if (restoreState.callId !== call.id) return;
    if (!participants.some((participant) => participant.id === currentUserId)) return;
    if (restoreAttemptCallIdRef.current === call.id) return;

    restoreAttemptCallIdRef.current = call.id;
    setIsRestoringCall(true);
    void joinCall(call).finally(() => setIsRestoringCall(false));
  }, [call, currentUserId, hasCheckedCallState, isJoined, joinCall, participants, restoreState]);

  useEffect(() => {
    if (hasCheckedCallState && !call && restoreState) {
      clearCallRestoreState(currentUserId, restoreState.callId);
    }
  }, [call, currentUserId, hasCheckedCallState, restoreState]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    const activeCall = callRef.current;
    if (activeCall) {
      void postCallAction({ action: 'set-mute', callId: activeCall.id, isMuted: nextMuted }).catch((muteError: unknown) => {
        console.error('Failed to update group-call microphone status:', muteError);
        setError(muteError instanceof Error ? muteError.message : 'Gagal memperbarui status mikrofon.');
      });
    }
  };

  const setVoiceIsolation = async (enabled: boolean) => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) {
      setError('Mikrofon tidak tersedia untuk mengubah Voice Isolation.');
      return;
    }
    if (!audioTrack.getCapabilities().noiseSuppression) {
      setError('Browser ini tidak mendukung Voice Isolation untuk mikrofon.');
      return;
    }
    try {
      await audioTrack.applyConstraints({ noiseSuppression: enabled });
      setIsVoiceIsolationEnabled(enabled);
    } catch (isolationError) {
      console.error('Failed to update group-call voice isolation:', isolationError);
      setError(isolationError instanceof Error
        ? isolationError.message
        : 'Gagal mengubah Voice Isolation.');
    }
  };

  const moderateParticipant = async (participant: CallParticipant, moderation: 'mute' | 'unmute' | 'kick') => {
    const activeCall = callRef.current;
    if (!activeCall || !isAdmin || participant.id === currentUserId) return;
    setModeratingParticipantId(participant.id);
    try {
      await postCallAction({
        action: 'moderate',
        callId: activeCall.id,
        targetId: participant.id,
        moderation: moderation === 'unmute' ? 'mute' : moderation,
        ...(moderation !== 'kick' ? { isMuted: moderation === 'mute' } : {}),
      });
      if (moderation === 'kick') {
        const peer = peersRef.current.get(participant.id);
        if (peer) {
          if (peer.negotiationTimer !== null) window.clearTimeout(peer.negotiationTimer);
          if (peer.restartTimer !== null) window.clearTimeout(peer.restartTimer);
          peer.connection.close();
          peersRef.current.delete(participant.id);
        }
        remoteStreamsRef.current.delete(participant.id);
        setParticipants((current) => current.filter((item) => item.id !== participant.id));
        setRemoteStreams(Array.from(remoteStreamsRef.current.values()));
        setPeerConnectionStates((current) => {
          const next = { ...current };
          delete next[participant.id];
          return next;
        });
      } else {
        setParticipants((current) => current.map((item) => (
          item.id === participant.id ? { ...item, is_muted: moderation === 'mute' } : item
        )));
      }
    } catch (moderationError) {
      console.error('Failed to moderate group-call participant:', moderationError);
      setError(moderationError instanceof Error ? moderationError.message : 'Gagal memperbarui peserta panggilan.');
    } finally {
      setModeratingParticipantId(null);
    }
  };

  const callInProgress = Boolean(call);
  const isCallParticipant = participants.some((participant) => participant.id === currentUserId);
  const joinPrompt = callInProgress && !isJoined && !isCallParticipant;
  const toggleCallFeature = useCallback(async () => {
    const enabled = !isCallFeatureEnabledRef.current;
    setIsStarting(true);
    try {
      await postCallAction({ action: 'toggle-feature', enabled });
      isCallFeatureEnabledRef.current = enabled;
      setIsCallFeatureEnabled(enabled);
      if (!enabled && callRef.current) await leaveCall(false);
    } catch (toggleError) {
      console.error('Failed to change group-call feature state:', toggleError);
      setError(toggleError instanceof Error ? toggleError.message : 'Gagal mengubah fitur telepon.');
    } finally {
      setIsStarting(false);
    }
  }, [leaveCall]);

  useEffect(() => {
    const currentStatus: GroupCallUiStatus = {
      featureEnabled: isCallFeatureEnabled,
      hasCheckedCallState,
      isLoading: isStarting || isRestoringCall,
      isJoined,
      isMinimized: isCallMinimized,
      joinPrompt,
      participantCount: participants.length,
      hasCall: Boolean(call),
      isAdmin,
    };
    const publishStatus = () => {
      window.dispatchEvent(new CustomEvent<GroupCallUiStatus>(GROUP_CALL_STATUS_EVENT, { detail: currentStatus }));
    };
    const handleAction = (event: Event) => {
      const action = (event as CustomEvent<GroupCallAction>).detail;
      if (action === 'return') {
        setIsCallMinimized(false);
        return;
      }
      if (action === 'toggle-feature') {
        void toggleCallFeature();
        return;
      }
      const activeCall = callRef.current;
      if (activeCall) void joinCall(activeCall);
      else void startCall();
    };
    window.addEventListener(GROUP_CALL_ACTION_EVENT, handleAction);
    window.addEventListener(GROUP_CALL_STATUS_REQUEST_EVENT, publishStatus);
    publishStatus();
    return () => {
      window.removeEventListener(GROUP_CALL_ACTION_EVENT, handleAction);
      window.removeEventListener(GROUP_CALL_STATUS_REQUEST_EVENT, publishStatus);
    };
  }, [
    call,
    hasCheckedCallState,
    isAdmin,
    isCallFeatureEnabled,
    isCallMinimized,
    isJoined,
    isRestoringCall,
    isStarting,
    leaveCall,
    joinCall,
    joinPrompt,
    participants.length,
    startCall,
    toggleCallFeature,
  ]);
  const participantsConnecting = isJoined
    ? participants.filter((participant) => {
        if (participant.id === currentUserId) return false;
        const hasRemoteAudio = remoteStreams
          .find((remote) => remote.userId === participant.id)
          ?.stream.getAudioTracks()
          .some((track) => track.readyState === 'live');
        return peerConnectionStates[participant.id] !== 'connected' || !hasRemoteAudio;
      })
    : [];

  return (
    <>
      {kickNotice && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed right-4 top-4 z-[240] flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-2xl dark:border-amber-700 dark:bg-slate-900 dark:text-white"
        >
          <span className="min-w-0 flex-1">Anda dikeluarkan dari sesi telepon.</span>
          <button
            type="button"
            onClick={() => setKickNotice(false)}
            aria-label="Tutup notifikasi"
            className="shrink-0 text-lg leading-none text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            ×
          </button>
        </div>
      )}
      {isJoined && call && isCallMinimized &&
        pathname !== '/chat' && pathname !== '/admin/chat' && pathname !== '/developer/chat' && (
          <div className="fixed bottom-4 right-4 z-[190] flex items-center gap-3 rounded-full border border-emerald-200 bg-white px-4 py-2 shadow-xl dark:border-emerald-800 dark:bg-slate-900">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Anda dalam panggilan · {participants.length} anggota
            </span>
            {isAdmin && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAdminCallMenuOpen((open) => !open)}
                  aria-label="Opsi telepon admin"
                  aria-expanded={isAdminCallMenuOpen}
                  title="Opsi telepon admin"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {isAdminCallMenuOpen && (
                  <div className="absolute bottom-full right-0 z-[220] mb-2 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdminCallMenuOpen(false);
                        void toggleCallFeature();
                      }}
                      className="w-full px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      Matikan fitur telepon
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCallMinimized(false)}
              aria-label="Kembali ke panggilan"
              title="Kembali ke panggilan"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
            >
              <Phone className="h-4 w-4" />
            </button>
          </div>
        )}

      {error && (
        <div className="fixed bottom-24 left-1/2 z-[220] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-rose-200 bg-white p-3 text-sm text-rose-700 shadow-xl dark:border-rose-900 dark:bg-[#161b22] dark:text-rose-300">
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Tutup pesan error" className="shrink-0">
              ×
            </button>
          </div>
        </div>
      )}

      {isJoined && call && (
        <div className={`fixed inset-0 z-[200] flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-white ${
          isCallMinimized ? 'invisible pointer-events-none' : ''
        }`}>
          {participantsConnecting.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed left-1/2 top-20 z-[210] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-blue-200 bg-white/95 px-4 py-3 text-slate-900 shadow-2xl backdrop-blur dark:border-blue-400/30 dark:bg-slate-900/95 dark:text-white"
            >
              <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-blue-300" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Menghubungkan suara...</span>
                <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
                  Menunggu {participantsConnecting.map((participant) => participant.username).join(', ')}
                </span>
              </span>
            </div>
          )}
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsCallMinimized(true)}
                aria-label="Kembali ke chat tanpa menutup telepon"
                title="Kembali ke chat tanpa menutup telepon"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-sm font-bold sm:text-base">Telepon grup</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{participants.length} anggota terhubung</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAdminCallMenuOpen((open) => !open)}
                    aria-label="Opsi telepon admin"
                    aria-expanded={isAdminCallMenuOpen}
                    title="Opsi telepon admin"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {isAdminCallMenuOpen && (
                    <div className="absolute right-0 top-full z-[220] mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminCallMenuOpen(false);
                          void toggleCallFeature();
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-white/10"
                      >
                        Matikan fitur telepon
                      </button>
                    </div>
                  )}
                </div>
              )}
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                Panggilan aktif
              </span>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] content-start gap-3 overflow-y-auto overscroll-contain bg-slate-50 p-3 dark:bg-slate-950 sm:gap-4 sm:p-6">
            <ParticipantTile
              name={participants.find((participant) => participant.id === currentUserId)?.username ?? 'Anda'}
              profilePhoto={participants.find((participant) => participant.id === currentUserId)?.profile_photo ?? null}
              stream={localStream}
              isSpeaking={speakingUsers.includes(0)}
              isMuted={isMuted}
              isLocal
            />
            {remoteStreams.map((remote) => (
              <ParticipantTile
                key={remote.userId}
                name={remote.username}
                profilePhoto={remote.profilePhoto}
                stream={remote.stream}
                trackRevision={remote.trackRevision}
                isSpeaking={speakingUsers.includes(remote.userId)}
                isMuted={Boolean(participants.find((participant) => participant.id === remote.userId)?.is_muted)}
                isAdmin={isAdmin && remote.userId !== currentUserId}
                isModerating={moderatingParticipantId === remote.userId}
                onModerate={(action) => {
                  const participant = participants.find((item) => item.id === remote.userId);
                  if (participant) void moderateParticipant(participant, action);
                }}
              />
            ))}
            {participants.filter((participant) =>
              participant.id !== currentUserId && !remoteStreams.some((remote) => remote.userId === participant.id)
            ).map((participant) => (
              <ParticipantTile
                key={participant.id}
                name={participant.username}
                profilePhoto={participant.profile_photo}
                stream={null}
                isSpeaking={speakingUsers.includes(participant.id)}
                isMuted={Boolean(participant.is_muted)}
                isAdmin={isAdmin && participant.id !== currentUserId}
                isModerating={moderatingParticipantId === participant.id}
                onModerate={(action) => void moderateParticipant(participant, action)}
              />
            ))}
          </div>

          <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-950">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Nyalakan mikrofon' : 'Matikan mikrofon'}
              aria-pressed={isMuted}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                isMuted ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
              }`}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <div className="relative" ref={voiceIsolationMenuRef}>
              <button
                type="button"
                onClick={() => setIsVoiceIsolationOpen((open) => !open)}
                aria-label="Opsi Voice Isolation"
                aria-expanded={isVoiceIsolationOpen}
                title="Opsi Voice Isolation"
                className={`flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                  isVoiceIsolationEnabled
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
                }`}
              >
                <AudioLines className="h-5 w-5" />
                <span className="hidden sm:inline">Voice Isolation</span>
                <span className="text-xs uppercase">{isVoiceIsolationEnabled ? 'On' : 'Off'}</span>
              </button>
              {isVoiceIsolationOpen && (
                <div
                  role="group"
                  aria-label="Voice Isolation"
                  className="absolute bottom-full left-1/2 z-[230] mb-3 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <p className="text-sm font-semibold">Voice Isolation</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Mengurangi suara latar pada mikrofon Anda.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void setVoiceIsolation(true)}
                      aria-pressed={isVoiceIsolationEnabled}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        isVoiceIsolationEnabled
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      onClick={() => void setVoiceIsolation(false)}
                      aria-pressed={!isVoiceIsolationEnabled}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        !isVoiceIsolationEnabled
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      Off
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void leaveCall()}
              aria-label="Tutup telepon"
              title="Tutup telepon"
              className="flex h-12 w-16 items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-700"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </footer>
        </div>
      )}
    </>
  );
}
