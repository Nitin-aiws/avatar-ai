import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { GroundingFiles } from "@/components/ui/grounding-files";
import GroundingFileView from "@/components/ui/grounding-file-view";
import StatusMessage from "@/components/ui/status-message";
import TextResponseBox from "@/components/ui/text-response-box";

import useRealTime from "@/hooks/useRealtime";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useAudioPlayer from "@/hooks/useAudioPlayer";

import { GroundingFile, ToolResult } from "./types";
import Avatar from "./Avatar";

function App(props: { avatarRef?: React.RefObject<any> }) {
    const [isRecording, setIsRecording] = useState(false);
    const [groundingFiles, setGroundingFiles] = useState<GroundingFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<GroundingFile | null>(null);
    const [lastText, setLastText] = useState("");
    const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant", text: string }[]>([]);

    const { t } = useTranslation();

    // Add a handler to log text output to the console
    const handleResponseDone = (message: any) => {
        console.log("[DEBUG] response.done message:", message);
        const outputs = message.response?.output || [];
        outputs.forEach((output: any) => {
            if (output.content) {
                output.content.forEach((item: any) => {
                    if ((item.type === "audio" || item.type === "text") && item.transcript) {
                        setLastText(item.transcript);
                        setChatHistory(prev => [...prev, { role: "assistant", text: item.transcript }]);
                        if (props.avatarRef && props.avatarRef.current && props.avatarRef.current.setUserInput) {
                            props.avatarRef.current.setUserInput(item.transcript);
                        }
                        console.log("Transcript received from model:", item.transcript);
                    }
                });
            }
        });
    };

    // Add a handler for user audio transcription
    const handleUserTranscription = (message: any) => {
        console.log("[DEBUG] user transcription message:", message);
        if (message.transcript) {
            setChatHistory(prev => [...prev, { role: "user", text: message.transcript }]);
        }
    };

    // Pass the handler to useRealTime
    const { startSession, addUserAudio, inputAudioBufferClear } = useRealTime({
        onWebSocketOpen: () => console.log("WebSocket connection opened"),
        onWebSocketClose: () => console.log("WebSocket connection closed"),
        onWebSocketError: event => console.error("WebSocket error:", event),
        onReceivedError: message => console.error("error", message),
        onReceivedResponseAudioDelta: () => {
            // Audio output from the chatbot is disabled
        },
        onReceivedInputAudioBufferSpeechStarted: () => {
            stopAudioPlayer();
        },
        onReceivedExtensionMiddleTierToolResponse: message => {
            const result: ToolResult = JSON.parse(message.tool_result);

            const files: GroundingFile[] = result.sources.map(x => {
                return { id: x.chunk_id, name: x.title, content: x.chunk };
            });

            setGroundingFiles(prev => [...prev, ...files]);
        },
        onReceivedInputAudioTranscriptionCompleted: handleUserTranscription,
        onReceivedResponseDone: handleResponseDone
    });

    const { reset: resetAudioPlayer, stop: stopAudioPlayer } = useAudioPlayer();
    const { start: startAudioRecording, stop: stopAudioRecording } = useAudioRecorder({ onAudioRecorded: addUserAudio });

    const onToggleListening = async () => {
        if (!isRecording) {
            startSession();
            await startAudioRecording();
            resetAudioPlayer();

            setIsRecording(true);
        } else {
            await stopAudioRecording();
            stopAudioPlayer();
            inputAudioBufferClear();

            setIsRecording(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
            <main className="flex flex-grow flex-col items-center justify-center">
                <h1 className="mb-8 text-blue-600 text-4xl font-bold md:text-7xl">
                    {t("app.title")}
                </h1>
                {/* Chat history UI */}
                <div className="mb-4 w-full max-w-xl">
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`mb-2 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`px-4 py-2 rounded-lg ${msg.role === "user" ? "bg-blue-200 text-right" : "bg-gray-200 text-left"}`}>
                        <span className="block font-semibold">{msg.role === "user" ? "You" : "Assistant"}</span>
                        <span>{msg.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Show the last text response in a styled text box */}
                <TextResponseBox text={lastText} />
                <div className="mb-4 flex flex-col items-center justify-center">
                    <Button
                        onClick={onToggleListening}
                        className={`h-12 w-60 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-green-500 hover:bg-green-600"}`}
                        aria-label={isRecording ? t("app.stopRecording") : t("app.startRecording")}
                    >
                        {isRecording ? (
                            <>
                                <MicOff className="mr-2 h-4 w-4" />
                                {t("app.stopConversation")}
                            </>
                        ) : (
                            <>
                                <Mic className="mr-2 h-6 w-6 text-red-500" />
                            </>
                        )}
                    </Button>
                    <StatusMessage isRecording={isRecording} />
                </div>
                <GroundingFiles files={groundingFiles} onSelected={setSelectedFile} />
            </main>

            <footer className="py-4 text-center">
                <p>{t("app.footer")}</p>
            </footer>

            <GroundingFileView groundingFile={selectedFile} onClosed={() => setSelectedFile(null)} />
        </div>
    );
}

export default function AppWithAvatar() {
    const avatarRef = useRef<any>(null);
    return (
        <>
            <App avatarRef={avatarRef} />
            <Avatar ref={avatarRef} />
        </>
    );
}
