import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";

// Add SpeechSDK to window type for TypeScript
declare global {
  interface Window {
    SpeechSDK: any;
  }
}

const Avatar = forwardRef(function Avatar(_props, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [status, setStatus] = useState("");
  const [showTransparent, setShowTransparent] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const [userInput, setUserInput] = useState("");
  const avatarSynthesizerRef = useRef<any>(null);
  const peerConnectionRef = useRef<any>(null);

  // Avatar config
  const avatarCharacter = "lisa";
  const avatarStyle = "casual-sitting";

  // Avatar speaking logic
  const speakWithAvatar = async (text: string) => {
    if (!avatarSynthesizerRef.current) {
      setStatus("Avatar synthesizer not initialized");
      console.warn("[DEBUG] Avatar synthesizer not initialized");
      return;
    }
    // Interrupt any current speech before starting new one
    try {
      await avatarSynthesizerRef.current.stopSpeakingAsync();
      console.log("[DEBUG] Interrupted previous speech");
    } catch (err) {
      // It's okay if nothing was speaking
      console.warn("[DEBUG] stopSpeakingAsync error (can ignore if not speaking):", err);
    }
    setStatus("Avatar speaking...");
    console.log("[DEBUG] Avatar speaking SSML:", text);
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='en-US-AvaMultilingualNeural'>${text}</voice></speak>`;
    window.SpeechSDK && avatarSynthesizerRef.current.speakSsmlAsync(ssml).then(() => {
      setStatus("Avatar done speaking.");
      console.log("[DEBUG] Avatar finished speaking");
    }).catch((err: any) => {
      setStatus("Avatar failed to speak: " + err);
      console.error("[DEBUG] Avatar failed to speak:", err);
    });
  };

  // Start session: avatar only
  const startSession = async () => {
    setStatus("Starting session...");
    console.log("[DEBUG] Starting session");
    try {
      // Fetch token and ICE server info from backend
      const resp = await fetch("/avatar/token");
      if (!resp.ok) {
        setStatus("Failed to fetch avatar token");
        console.error("[DEBUG] Failed to fetch /avatar/token", resp.status);
        return;
      }
      const data = await resp.json();
      console.log("[DEBUG] Received avatar token data:", data);
      const { token, region, relay } = data;
      const iceServerUrl = relay.Urls[0];
      const iceServerUsername = relay.Username;
      const iceServerCredential = relay.Password;
      const speechConfig = window.SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
      const avatarConfig = new window.SpeechSDK.AvatarConfig(avatarCharacter, avatarStyle);
      avatarSynthesizerRef.current = new window.SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
      peerConnectionRef.current = new window.RTCPeerConnection({
        iceServers: [
          {
            urls: [iceServerUrl],
            username: iceServerUsername,
            credential: iceServerCredential,
          },
        ],
      });
      peerConnectionRef.current.ontrack = (event: any) => {
        console.log("[DEBUG] ontrack event:", event);
        if (videoRef.current && !videoRef.current.srcObject) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.muted = false;
          videoRef.current.play?.().catch(() => {});
          console.log("[DEBUG] Video stream attached");
        }
        if (audioRef.current && event.track.kind === 'audio' && audioRef.current.srcObject !== event.streams[0]) {
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.muted = false; // Ensure audio is not muted
          audioRef.current.volume = 1.0; // Set volume to max
          audioRef.current.play().catch(() => {});
          console.log("[DEBUG] Audio stream attached");
        }
      };
      peerConnectionRef.current.addTransceiver("video", { direction: "sendrecv" });
      peerConnectionRef.current.addTransceiver("audio", { direction: "sendrecv" });
      await avatarSynthesizerRef.current.startAvatarAsync(peerConnectionRef.current);
      setStatus("Avatar started. Ready to speak.");
      console.log("[DEBUG] Avatar started and peer connection established");
      setSessionActive(true);
    } catch (err) {
      setStatus("Failed to start session: " + err);
      console.error("[DEBUG] Failed to start session:", err);
    }
  };

  const stopSession = () => {
    setSessionActive(false);
    setStatus("Session stopped");
    if (avatarSynthesizerRef.current) avatarSynthesizerRef.current.close();
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    console.log("[DEBUG] Session stopped and resources cleaned up");
  };

  // Frame processing for transparency (unchanged)
  useEffect(() => {
    if (!showTransparent) return;
    function makeBackgroundTransparent() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < frame.data.length / 4; i++) {
        let r = frame.data[i * 4 + 0];
        let g = frame.data[i * 4 + 1];
        let b = frame.data[i * 4 + 2];
        if (g - 150 > r + b) {
          frame.data[i * 4 + 3] = 0;
        } else if (g + g > r + b) {
          let adjustment = (g - (r + b) / 2) / 3;
          r += adjustment;
          g -= adjustment * 2;
          b += adjustment;
          frame.data[i * 4 + 0] = r;
          frame.data[i * 4 + 1] = g;
          frame.data[i * 4 + 2] = b;
          let a = Math.max(0, 255 - adjustment * 4);
          frame.data[i * 4 + 3] = a;
        }
      }
      ctx.putImageData(frame, 0, 0);
      animationFrameRef.current = window.requestAnimationFrame(makeBackgroundTransparent);
    }
    animationFrameRef.current = window.requestAnimationFrame(makeBackgroundTransparent);
    return () => {
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [showTransparent, sessionActive]);

  useEffect(() => {
    // Automatically start session and speak when userInput changes and session is not active
    if (!sessionActive && userInput) {
      startSession().then(() => {
        // Wait a moment for session to be ready, then speak
        setTimeout(() => speakWithAvatar(userInput), 500);
      });
    } else if (sessionActive && userInput) {
      // If session is already active and userInput changes, speak immediately
      speakWithAvatar(userInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInput]);

  useImperativeHandle(ref, () => ({
    setUserInput,
  }));

  return (
    <div style={{ textAlign: "center", background: "#222", color: "#fff", minHeight: "100vh" }}>
      <h1>Avatar Manual Text-to-Speech</h1>
      <div style={{ margin: 20 }}>
        <button onClick={startSession} disabled={sessionActive}>Start Session</button>
        <button onClick={stopSession} disabled={!sessionActive}>Stop Session</button>
        <label style={{ marginLeft: 20 }}>
          <input type="checkbox" checked={showTransparent} onChange={e => setShowTransparent(e.target.checked)} /> Transparent Background
        </label>
      </div>
      <div style={{ margin: 20 }}>
        <input
          type="text"
          value={userInput}
          onChange={e => setUserInput(e.target.value)}
          disabled={!sessionActive}
          placeholder="Type text for avatar to speak..."
          style={{ width: 400, padding: 8, fontSize: 16 }}
        />
        <button
          onClick={() => speakWithAvatar(userInput)}
          disabled={!sessionActive || !userInput.trim()}
          style={{ marginLeft: 10, padding: '8px 16px', fontSize: 16 }}
        >
          Speak
        </button>
      </div>
      <div style={{ position: "relative", width: 640, height: 360, margin: "auto" }}>
        <video
          ref={videoRef}
          width={640}
          height={360}
          style={{ background: "#000", display: showTransparent ? "none" : "block", border: "2px solid #fff" }}
          autoPlay
          playsInline
        />
        <audio ref={audioRef} autoPlay />
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            display: showTransparent ? "block" : "none",
            background: "transparent"
          }}
        />
      </div>
      <div style={{ marginTop: 20 }}>{status}</div>
    </div>
  );
});

export default Avatar;
