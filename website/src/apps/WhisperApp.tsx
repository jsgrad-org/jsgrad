import { useCallback, useState, useEffect } from "react";
import {
  init_whisper,
  transcribe_waveform,
  MODELS,
  LANGUAGES,
  type Whisper,
  type Tokenizer,
  type WhisperModel,
  type TqdmProgress,
} from "../../../jsgrad/web.ts";
import Progress from "../components/Progress.tsx";
import { TranscribeButton } from "../components/TranscribeButton.tsx";
interface TranscriptData {
  text: string;
}

export const WhisperApp = () => {
  const [model, setModel] = useState<Whisper | null>(null);
  const [tokenizer, setTokenizer] = useState<Tokenizer | null>(null);
  const [selectedModel, setSelectedModel] = useState<WhisperModel>(
    Constants.DEFAULT_MODEL as WhisperModel
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(
    Constants.DEFAULT_LANGUAGE
  );
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioData, setAudioData] = useState<
    { buffer: AudioBuffer; url: string; mimeType: string } | undefined
  >(undefined);
  const [transcript, setTranscript] = useState<TranscriptData | undefined>(
    undefined
  );
  const [progressItems, setProgressItems] = useState<TqdmProgress[]>([]);

  useEffect(() => {
    if (
      !model ||
      selectedModel !== (model as any).__model_name_used_for_loading
    ) {
      loadModel();
    }
  }, [selectedModel]);

  const loadModel = useCallback(async () => {
    if (isModelLoading) return;
    setIsModelLoading(true);
    setProgressItems([]);
    setTranscript(undefined);

    const onProgress = (p: TqdmProgress) => {
      setProgressItems((prev) => {
        const existing = prev.find((item) => item.label === p.label);
        if (existing) {
          return prev.map((item) => (item.label === p.label ? p : item));
        } else {
          return [...prev, p];
        }
      });
    };

    try {
      console.log(`Loading model: ${selectedModel}...`);
      const [whisperModel, whisperTokenizer] = await init_whisper("tiny.en", 1);
      setModel(whisperModel);
      setTokenizer(whisperTokenizer);
      (whisperModel as any).__model_name_used_for_loading = selectedModel;
      console.log("Model loaded successfully.");
    } catch (error) {
      console.error("Error loading model:", error);
    } finally {
      setIsModelLoading(false);
      setProgressItems([]);
    }
  }, [selectedModel, isModelLoading]);

  const handleTranscribe = useCallback(async () => {
    if (
      !model ||
      !tokenizer ||
      !audioData ||
      isTranscribing ||
      isModelLoading
    ) {
      console.log("Conditions not met for transcription:", {
        model: !!model,
        tokenizer: !!tokenizer,
        audioData: !!audioData,
        isTranscribing,
        isModelLoading,
      });
      return;
    }

    setIsTranscribing(true);
    setTranscript(undefined);
    setProgressItems([]);

    const onProgress = (p: TqdmProgress) => {
      setProgressItems((prev) => {
        const existing = prev.find((item) => item.label === p.label);
        if (existing) {
          return prev.map((item) => (item.label === p.label ? p : item));
        } else {
          return [...prev, p];
        }
      });
    };

    try {
      const channelData = Array.from(
        { length: audioData.buffer.numberOfChannels },
        (_, i) => audioData.buffer.getChannelData(i)
      );

      console.log(
        `Transcribing with language: ${
          selectedLanguage || "auto (if multilingual)"
        }`
      );
      const resultText = await transcribe_waveform(
        model,
        tokenizer,
        channelData,
        false,
      );

      console.log("Transcription result:", resultText);
      setTranscript({
        text:
          typeof resultText === "string" ? resultText : resultText.join("\n"),
      });
    } catch (error) {
      console.error("Error during transcription:", error);
      setTranscript({
        text: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setIsTranscribing(false);
      setProgressItems([]);
    }
  }, [
    model,
    tokenizer,
    audioData,
    isTranscribing,
    isModelLoading,
    selectedLanguage,
  ]);

  const handleAudioUpdate = useCallback(
    (
      data: { buffer: AudioBuffer; url: string; mimeType: string } | undefined
    ) => {
      setAudioData(data);
      setTranscript(undefined);
    },
    []
  );

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="container flex flex-col justify-center items-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl text-center">
          Whisper Web (jsgrad)
        </h1>
        <h2 className="mt-3 mb-5 px-4 text-center text-1xl font-semibold tracking-tight sm:text-2xl">
          Speech recognition in your browser with jsgrad
        </h2>

        {}
        <div className="my-4">
          <label htmlFor="model-select" className="mr-2">
            Select Model:
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as WhisperModel)}
            disabled={isModelLoading || isTranscribing}
            className="p-2 rounded border bg-white/10 text-white"
          >
            {Object.keys(MODELS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          {model?.is_multilingual && (
            <label htmlFor="lang-select" className="ml-4 mr-2">
              Language:
            </label>
          )}
          {model?.is_multilingual && (
            <select
              id="lang-select"
              value={selectedLanguage || "auto"}
              onChange={(e) =>
                setSelectedLanguage(
                  e.target.value === "auto" ? undefined : e.target.value
                )
              }
              disabled={isModelLoading || isTranscribing}
              className="p-2 rounded border bg-white/10 text-white"
            >
              <option value="auto">Auto-Detect</option>
              {Object.entries(LANGUAGES).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>

        {}
        <AudioManagerInternal onAudioUpdate={handleAudioUpdate} />

        {audioData && (
          <TranscribeButton
            onClick={handleTranscribe}
            isModelLoading={isModelLoading}
            isTranscribing={isTranscribing}
            disabled={
              !model ||
              !tokenizer ||
              !audioData ||
              isTranscribing ||
              isModelLoading
            }
          />
        )}

        {}
        {isModelLoading && progressItems.length > 0 && (
          <div className="relative z-10 p-4 w-full max-w-2xl">
            <label>Loading model files...</label>
            {progressItems.map((data, i) => (
              <Progress
                key={`${data.label}-${i}`}
                text={data.label || data.i?.toString() || `File ${i + 1}`}
                percentage={
                  data.elapsed || ((data.i ?? 0) / (data.size ?? 1)) * 100
                }
              />
            ))}
          </div>
        )}

        {}
        {isTranscribing && !transcript && (
          <div className="mt-4">Transcribing...</div>
        )}
        {transcript && (
          <div className="w-full flex flex-col my-2 p-4 max-h-[20rem] overflow-y-auto">
            <div className="w-full flex flex-row mb-2 bg-white rounded-lg p-4 shadow-xl shadow-black/5 ring-1 ring-slate-700/10 text-black">
              {transcript.text}
            </div>
          </div>
        )}

        {}
        <div className="fixed bottom-4 text-white/50">
          Made with{" "}
          <a className="underline" href="https://jsgrad.org">
            jsgrad
          </a>
        </div>
      </div>
    </div>
  );
};

const AudioManagerInternal = ({
  onAudioUpdate,
}: {
  onAudioUpdate: (
    data: { buffer: AudioBuffer; url: string; mimeType: string } | undefined
  ) => void;
}) => {
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const isAudioLoading = progress !== undefined;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const blobUrl = URL.createObjectURL(file);
    const mimeType = file.type;

    const reader = new FileReader();
    reader.onprogress = (e) => setProgress((e.loaded / e.total) * 100);
    reader.onloadend = async () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      if (!arrayBuffer) return;

      try {
        const audioCTX = new AudioContext({
          sampleRate: Constants.SAMPLING_RATE,
        });
        const decoded = await audioCTX.decodeAudioData(arrayBuffer);
        onAudioUpdate({ buffer: decoded, url: blobUrl, mimeType });
      } catch (e) {
        console.error("Error decoding audio data:", e);
        alert(
          "Failed to decode audio file. Please ensure it's a supported format and has a sample rate of 16000 Hz if possible."
        );
        onAudioUpdate(undefined);
      } finally {
        setProgress(undefined);
      }
    };
    reader.onerror = () => {
      console.error("Error reading file");
      alert("Error reading the audio file.");
      setProgress(undefined);
      onAudioUpdate(undefined);
    };
    setProgress(0);
    onAudioUpdate(undefined);
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col justify-center items-center rounded-lg bg-white shadow-xl shadow-black/5 ring-1 ring-slate-700/10 p-4 w-full max-w-2xl">
      <label
        htmlFor="audio-file-input"
        className="cursor-pointer p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Upload Audio File
      </label>
      <input
        id="audio-file-input"
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {isAudioLoading && (
        <Progress text="Loading audio..." percentage={progress ?? 0} />
      )}
    </div>
  );
};

const Constants = {
  SAMPLING_RATE: 16000,
  DEFAULT_MODEL: "tiny.en",
  DEFAULT_SUBTASK: "transcribe",
  DEFAULT_LANGUAGE: "en",
  DEFAULT_QUANTIZED: false,
  DEFAULT_MULTILINGUAL: false,
};
