import { useState, useRef, useEffect, useCallback } from "react";

// ─── Constantes ─────────────────────────────────────────────────

const MIME_CANDIDATES_VIDEO = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp8",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=h264",
  "video/webm",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

const MIME_CANDIDATES_AUDIO = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

const VIDEO_HIGH = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
const VIDEO_FALLBACK = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } };

const STATES = { IDLE: "idle", RECORDING: "recording", PAUSED: "paused", STOPPED: "stopped" };

// ─── Helpers ────────────────────────────────────────────────────

function bestMime(candidates) {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

function extFromMime(mime) {
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("video/mp4")) return "mp4";
  return "webm";
}

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function includesAudio(mode) { return mode === "audio" || mode === "audiovideo"; }
function includesVideo(mode) { return mode === "video" || mode === "audiovideo"; }

// ─── Composant ──────────────────────────────────────────────────

export default function MediaRecorderApp() {
  const [recState, setRecState] = useState(STATES.IDLE);
  const [mode, setMode] = useState("audiovideo");
  const [status, setStatus] = useState({ text: "Initialisation…", error: false });
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState("");
  const [selectedVideo, setSelectedVideo] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const mimeRef = useRef("");
  const liveRef = useRef(null);
  const playbackRef = useRef(null);
  const urlRef = useRef(null);

  // ── Status helper ──
  const info = (msg) => setStatus({ text: msg, error: false });
  const err = (msg) => setStatus({ text: msg, error: true });

  // ── Enumerate devices ──
  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      err("Ce navigateur ne supporte pas l'accès aux périphériques média.");
      return;
    }
    try {
      // Permission probe to get labels
      const tmp = await navigator.mediaDevices
        .getUserMedia({ audio: true, video: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => navigator.mediaDevices.getUserMedia({ video: true })));

      const devs = await navigator.mediaDevices.enumerateDevices();
      if (tmp) tmp.getTracks().forEach((t) => t.stop());

      const mics = devs.filter((d) => d.kind === "audioinput");
      const cams = devs.filter((d) => d.kind === "videoinput");
      setAudioDevices(mics);
      setVideoDevices(cams);
      if (mics.length) setSelectedAudio((prev) => prev || mics[0].deviceId);
      if (cams.length) setSelectedVideo((prev) => prev || cams[0].deviceId);
      info("Périphériques détectés. Prêt.");
    } catch (e) {
      err("Impossible d'accéder aux périphériques : " + e.message);
    }
  }, []);

  useEffect(() => {
    enumerate();
    const h = () => enumerate();
    navigator.mediaDevices?.addEventListener("devicechange", h);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", h);
  }, [enumerate]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // ── Acquire stream ──
  async function acquireStream() {
    const constraints = {};
    if (includesAudio(mode)) {
      constraints.audio = selectedAudio ? { deviceId: { exact: selectedAudio } } : true;
    } else {
      constraints.audio = false;
    }
    if (includesVideo(mode)) {
      constraints.video = { ...VIDEO_HIGH, ...(selectedVideo ? { deviceId: { exact: selectedVideo } } : {}) };
    } else {
      constraints.video = false;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      if (constraints.video && typeof constraints.video === "object") {
        constraints.video = { ...VIDEO_FALLBACK, ...(selectedVideo ? { deviceId: { exact: selectedVideo } } : {}) };
        streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        throw new Error("Flux média indisponible.");
      }
    }

    if (includesVideo(mode) && liveRef.current) {
      liveRef.current.srcObject = streamRef.current;
      liveRef.current.muted = true;
      liveRef.current.play().catch(() => {});
    }
  }

  function releaseStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (liveRef.current) liveRef.current.srcObject = null;
  }

  // ── Recording actions ──
  async function handleStart() {
    // Cleanup previous
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    blobRef.current = null;
    setPlaybackUrl(null);

    try {
      await acquireStream();
    } catch (e) {
      err("Erreur : " + e.message);
      releaseStream();
      return;
    }

    const candidates = includesVideo(mode) ? MIME_CANDIDATES_VIDEO : MIME_CANDIDATES_AUDIO;
    mimeRef.current = bestMime(candidates);

    const opts = {};
    if (mimeRef.current) opts.mimeType = mimeRef.current;

    try {
      recorderRef.current = new MediaRecorder(streamRef.current, opts);
    } catch (e) {
      err("MediaRecorder impossible : " + e.message);
      releaseStream();
      return;
    }

    chunksRef.current = [];

    recorderRef.current.ondataavailable = (e) => {
      if (e.data?.size > 0) chunksRef.current.push(e.data);
    };

    recorderRef.current.onerror = (e) => {
      err("Erreur enregistrement : " + (e.error?.message || "inconnue"));
      setRecState(STATES.STOPPED);
    };

    recorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current || "video/webm" });
      blobRef.current = blob;
      chunksRef.current = [];
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPlaybackUrl(url);
      setRecState(STATES.STOPPED);
      info("Enregistrement terminé. Relisez ou téléchargez.");
    };

    recorderRef.current.start(500);
    setRecState(STATES.RECORDING);
    info("Enregistrement en cours…");
  }

  function handlePause() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      setRecState(STATES.PAUSED);
      info("En pause.");
    }
  }

  function handleResume() {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      setRecState(STATES.RECORDING);
      info("Reprise.");
    }
  }

  function handleStop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    releaseStream();
  }

  function handleDownload() {
    if (!blobRef.current) return;
    const ext = extFromMime(mimeRef.current || "video/webm");
    const prefix = includesVideo(mode) ? "video" : "audio";
    const a = document.createElement("a");
    a.href = urlRef.current;
    a.download = `${prefix}_${ts()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Derived state ──
  const isActive = recState === STATES.RECORDING || recState === STATES.PAUSED;
  const hasBlob = !!playbackUrl;
  const showVideo = includesVideo(mode);

  // ── Indicator dot ──
  const dotColor =
    recState === STATES.RECORDING ? "bg-red-500 animate-pulse" :
    recState === STATES.PAUSED ? "bg-amber-400" :
    "bg-neutral-500";

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-start justify-center p-4 sm:p-8" style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div className="w-full max-w-xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-3 h-3 rounded-full ${dotColor} shrink-0`} />
          <h1 className="text-lg font-semibold tracking-tight">Enregistreur média</h1>
        </div>

        {/* Status */}
        <div className={`text-sm px-3 py-2 rounded-lg ${status.error ? "bg-red-950/60 text-red-300 border border-red-800/50" : "bg-neutral-900 text-neutral-400 border border-neutral-800/60"}`}>
          {status.text}
        </div>

        {/* Config selects */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            id="recordMode"
            label="Mode"
            value={mode}
            onChange={(v) => setMode(v)}
            disabled={isActive}
            options={[
              { value: "audio", label: "Audio" },
              { value: "video", label: "Vidéo" },
              { value: "audiovideo", label: "Audio + Vidéo" },
            ]}
          />
          <Select
            id="audioInputSelect"
            label="Micro"
            value={selectedAudio}
            onChange={setSelectedAudio}
            disabled={isActive || audioDevices.length === 0}
            options={audioDevices.length ? audioDevices.map((d, i) => ({ value: d.deviceId, label: d.label || `Micro ${i + 1}` })) : [{ value: "", label: "Aucun" }]}
          />
          <Select
            id="videoInputSelect"
            label="Caméra"
            value={selectedVideo}
            onChange={setSelectedVideo}
            disabled={isActive || videoDevices.length === 0}
            options={videoDevices.length ? videoDevices.map((d, i) => ({ value: d.deviceId, label: d.label || `Caméra ${i + 1}` })) : [{ value: "", label: "Aucune" }]}
          />
        </div>

        {/* Live preview */}
        {showVideo && (
          <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black aspect-video">
            <video ref={liveRef} className="w-full h-full object-contain" playsInline muted />
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          <Btn id="startRecordBtn" onClick={handleStart} disabled={isActive} accent>
            ● Démarrer
          </Btn>
          <Btn id="pauseRecordBtn" onClick={handlePause} disabled={recState !== STATES.RECORDING}>
            ❚❚ Pause
          </Btn>
          <Btn id="resumeRecordBtn" onClick={handleResume} disabled={recState !== STATES.PAUSED}>
            ▶ Reprendre
          </Btn>
          <Btn id="stopRecordBtn" onClick={handleStop} disabled={!isActive} danger>
            ■ Arrêter
          </Btn>
          <Btn id="downloadRecordBtn" onClick={handleDownload} disabled={!hasBlob}>
            ↓ Télécharger
          </Btn>
        </div>

        {/* Playback */}
        {playbackUrl && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Lecture</p>
            <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black">
              {showVideo ? (
                <video ref={playbackRef} src={playbackUrl} controls className="w-full" />
              ) : (
                <audio ref={playbackRef} src={playbackUrl} controls className="w-full py-4 px-2" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Select({ id, label, value, onChange, disabled, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Btn({ id, onClick, disabled, children, accent, danger }) {
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed";
  const variant = accent
    ? "bg-red-600 hover:bg-red-500 text-white"
    : danger
    ? "bg-neutral-800 hover:bg-red-900/60 text-red-300 border border-neutral-700"
    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700";
  return (
    <button id={id} onClick={onClick} disabled={disabled} className={`${base} ${variant}`}>
      {children}
    </button>
  );
}
