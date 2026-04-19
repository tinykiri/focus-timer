import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

const STORAGE_KEYS = {
  darkMode: "focus-timer-dark-mode",
  backgroundImagePath: "focus-timer-background-image-path",
  tasks: "focus-timer-tasks",
  playlistInput: "focus-timer-playlist-input",
  playlistId: "focus-timer-playlist-id",
};
const BACKGROUND_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "focus-backgrounds";

const INITIAL_HOURS = 0;
const INITIAL_MINUTES = 25;

function parseStoredValue(key, fallback) {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function getPlaylistId(input) {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return "";
  }

  const regexMatch = trimmedInput.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (regexMatch?.[1]) {
    return regexMatch[1];
  }

  try {
    const parsedUrl = new URL(trimmedInput);
    const listParam = parsedUrl.searchParams.get("list");
    if (listParam) {
      return listParam;
    }
  } catch {
    // If it's not a URL, we still allow a direct playlist id value below.
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmedInput)) {
    return trimmedInput;
  }

  return "";
}

function getTotalSeconds(hours, minutes) {
  const safeHours = Math.max(0, Number(hours) || 0);
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return Math.floor(safeHours * 3600 + safeMinutes * 60);
}

function FlipCountdown({ text, isRunning }) {
  const previousTextRef = useRef(text);
  const previousText = previousTextRef.current || text;

  useEffect(() => {
    previousTextRef.current = text;
  }, [text]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      {text.split("").map((character, index) =>
        character === ":" ? (
          <span
            className="flip-colon text-3xl sm:text-5xl md:text-6xl"
            key={`separator-${index}`}
          >
            :
          </span>
        ) : (
          <FlipDigit
            key={`digit-${index}`}
            previousValue={previousText[index] ?? character}
            shouldAnimate={isRunning && previousText[index] !== character}
            value={character}
          />
        ),
      )}
    </div>
  );
}

function FlipDigit({ value, previousValue, shouldAnimate }) {
  const [isFlipping, setIsFlipping] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!shouldAnimate || previousValue === value) {
      setIsFlipping(false);
      setDisplayValue(value);
      return;
    }

    setIsFlipping(true);
    const timeoutId = window.setTimeout(() => {
      setDisplayValue(value);
      setIsFlipping(false);
    }, 560);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [previousValue, shouldAnimate, value]);

  const topValue = isFlipping ? previousValue : displayValue;
  const bottomValue = isFlipping ? value : displayValue;

  return (
    <span className={`flip-digit ${isFlipping ? "is-flipping" : ""}`}>
      <span className="digit-top">{topValue}</span>
      <span className="digit-bottom">{bottomValue}</span>
      {isFlipping ? (
        <>
          <span className="digit-fold-upper">{previousValue}</span>
          <span className="digit-fold-lower">{value}</span>
        </>
      ) : null}
    </span>
  );
}

function ThemeToggle({ isDarkMode, onToggle }) {
  return (
    <button
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className="theme-toggle"
      onClick={onToggle}
      type="button"
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-icon sun">
          <svg
            fill="none"
            height="13"
            viewBox="0 0 24 24"
            width="13"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" fill="currentColor" r="4" />
            <path
              d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07 7.07-1.41-1.41M6.34 6.34 4.93 4.93m14.14 0-1.41 1.41M6.34 17.66l-1.41 1.41"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </span>
        <span className="theme-toggle-icon moon">
          <svg
            fill="none"
            height="13"
            viewBox="0 0 24 24"
            width="13"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20 15.31A9 9 0 1 1 8.69 4 7 7 0 0 0 20 15.31z"
              fill="currentColor"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </span>
        <span className={`theme-toggle-thumb ${isDarkMode ? "is-dark" : "is-light"}`} />
      </span>
    </button>
  );
}

export default function App() {
  const initialTotalSeconds = getTotalSeconds(INITIAL_HOURS, INITIAL_MINUTES);

  const [hoursInput, setHoursInput] = useState(INITIAL_HOURS);
  const [minutesInput, setMinutesInput] = useState(INITIAL_MINUTES);
  const [initialDuration, setInitialDuration] = useState(initialTotalSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(initialTotalSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    parseStoredValue(STORAGE_KEYS.darkMode, true),
  );
  const [backgroundImagePath, setBackgroundImagePath] = useState(() =>
    parseStoredValue(STORAGE_KEYS.backgroundImagePath, ""),
  );
  const [backgroundImage, setBackgroundImage] = useState("");
  const [supabaseUserId, setSupabaseUserId] = useState("");
  const [supabaseAuthStatus, setSupabaseAuthStatus] = useState(() =>
    supabase ? "initializing" : "misconfigured",
  );
  const [supabaseAuthMessage, setSupabaseAuthMessage] = useState(() =>
    supabase
      ? "Connecting to Supabase..."
      : "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
  const [playlistInput, setPlaylistInput] = useState(() =>
    parseStoredValue(STORAGE_KEYS.playlistInput, ""),
  );
  const [playlistId, setPlaylistId] = useState(() =>
    parseStoredValue(STORAGE_KEYS.playlistId, ""),
  );
  const [isPlayerMuted, setIsPlayerMuted] = useState(true);
  const [playlistError, setPlaylistError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [taskTitleInput, setTaskTitleInput] = useState("");
  const [taskMinutesInput, setTaskMinutesInput] = useState("");
  const [tasks, setTasks] = useState(() => parseStoredValue(STORAGE_KEYS.tasks, []));
  const [activeTaskIndex, setActiveTaskIndex] = useState(null);
  const [taskElapsedSeconds, setTaskElapsedSeconds] = useState(0);

  const audioRef = useRef(null);
  const mainTimerAlertLoopRef = useRef(null);

  const clearMainTimerAlertLoop = useCallback(() => {
    if (mainTimerAlertLoopRef.current) {
      window.clearInterval(mainTimerAlertLoopRef.current);
      mainTimerAlertLoopRef.current = null;
    }
  }, []);

  const playAlertSound = useCallback(async () => {
    if (!audioRef.current) {
      return;
    }

    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch {
      // Browser blocks autoplay until user interaction. Ignore silently.
    }
  }, []);

  const playAlertSoundTimes = useCallback(
    (times) => {
      for (let index = 0; index < times; index += 1) {
        window.setTimeout(() => {
          playAlertSound();
        }, index * 1100);
      }
    },
    [playAlertSound],
  );

  const startMainTimerAlertLoop = useCallback(() => {
    clearMainTimerAlertLoop();
    playAlertSound();
    mainTimerAlertLoopRef.current = window.setInterval(() => {
      playAlertSound();
    }, 1500);
  }, [clearMainTimerAlertLoop, playAlertSound]);

  const resetTaskProgress = useCallback(() => {
    setActiveTaskIndex(null);
    setTaskElapsedSeconds(0);
  }, []);

  const stopTimer = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setRemainingSeconds(0);
    resetTaskProgress();
    clearMainTimerAlertLoop();
  }, [clearMainTimerAlertLoop, resetTaskProgress]);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setRemainingSeconds(initialDuration);
    resetTaskProgress();
    clearMainTimerAlertLoop();
  }, [clearMainTimerAlertLoop, initialDuration, resetTaskProgress]);

  const applyDuration = useCallback(
    (hours, minutes) => {
      const totalSeconds = getTotalSeconds(hours, minutes);
      setHoursInput(Math.max(0, Number(hours) || 0));
      setMinutesInput(Math.max(0, Number(minutes) || 0));
      setInitialDuration(totalSeconds);
      setRemainingSeconds(totalSeconds);
      setIsRunning(false);
      setIsPaused(false);
      resetTaskProgress();
      clearMainTimerAlertLoop();
    },
    [clearMainTimerAlertLoop, resetTaskProgress],
  );

  const applyQuickPreset = useCallback(
    (minutes) => {
      applyDuration(0, minutes);
    },
    [applyDuration],
  );

  const startTimer = useCallback(() => {
    const inputDuration = getTotalSeconds(hoursInput, minutesInput);
    const resolvedDuration = inputDuration > 0 ? inputDuration : initialDuration;

    if (resolvedDuration <= 0) {
      return;
    }

    if (isRunning && isPaused) {
      setIsPaused(false);
      return;
    }

    if (isRunning) {
      return;
    }

    clearMainTimerAlertLoop();

    if (inputDuration > 0 && inputDuration !== initialDuration) {
      setInitialDuration(inputDuration);
      setRemainingSeconds(inputDuration);
      resetTaskProgress();
    } else if (remainingSeconds <= 0) {
      setRemainingSeconds(resolvedDuration);
    }

    if (tasks.length > 0) {
      setActiveTaskIndex(0);
      setTaskElapsedSeconds(0);
    }

    setIsRunning(true);
    setIsPaused(false);
  }, [
    clearMainTimerAlertLoop,
    hoursInput,
    initialDuration,
    isPaused,
    isRunning,
    minutesInput,
    remainingSeconds,
    resetTaskProgress,
    tasks.length,
  ]);

  const togglePause = useCallback(() => {
    if (!isRunning) {
      return;
    }
    setIsPaused((currentState) => !currentState);
  }, [isRunning]);

  const addTask = useCallback(() => {
    const cleanTitle = taskTitleInput.trim();
    const minutes = Number(taskMinutesInput);

    if (!cleanTitle || Number.isNaN(minutes) || minutes <= 0) {
      return;
    }

    setTasks((currentTasks) => [
      ...currentTasks,
      {
        id: crypto.randomUUID(),
        title: cleanTitle,
        minutes,
      },
    ]);

    setTaskTitleInput("");
    setTaskMinutesInput("");
  }, [taskMinutesInput, taskTitleInput]);

  const removeTask = useCallback(
    (taskId) => {
      const removedIndex = tasks.findIndex((task) => task.id === taskId);
      if (removedIndex === -1) {
        return;
      }

      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));

      if (activeTaskIndex === null) {
        return;
      }

      if (removedIndex < activeTaskIndex) {
        setActiveTaskIndex((index) => (index === null ? null : index - 1));
      } else if (removedIndex === activeTaskIndex) {
        setActiveTaskIndex(null);
        setTaskElapsedSeconds(0);
      }
    },
    [activeTaskIndex, tasks],
  );

  const applyPlaylist = useCallback(() => {
    const extractedPlaylistId = getPlaylistId(playlistInput);
    if (!extractedPlaylistId) {
      setPlaylistError("Couldn't find playlist id. Paste a YouTube URL that contains list=...");
      setPlaylistId("");
      return;
    }

    setPlaylistError("");
    setPlaylistId(extractedPlaylistId);
  }, [playlistInput]);

  const handleBackgroundUpload = useCallback(
    async (event) => {
      const selectedFile = event.target.files?.[0];
      if (!selectedFile) {
        return;
      }

      if (!supabase || !supabaseUserId) {
        window.alert(
          supabaseAuthMessage || "Supabase auth is not ready yet. Please try again in a moment.",
        );
        return;
      }

      const fileExtension = selectedFile.name.split(".").pop() || "jpg";
      const filePath = `${supabaseUserId}/background-${Date.now()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from(BACKGROUND_BUCKET)
        .upload(filePath, selectedFile, {
          upsert: true,
        });

      if (uploadError) {
        const isBucketMissing =
          uploadError.message?.toLowerCase().includes("bucket not found") ||
          uploadError.statusCode === "404";
        if (isBucketMissing) {
          window.alert(
            `Upload failed: bucket "${BACKGROUND_BUCKET}" not found. Create this private bucket in Supabase Storage, or set VITE_SUPABASE_STORAGE_BUCKET in .env to your existing bucket name.`,
          );
          return;
        }

        const isRlsBlocked =
          uploadError.message?.toLowerCase().includes("row-level security") ||
          uploadError.message?.toLowerCase().includes("violates row-level security policy");
        if (isRlsBlocked) {
          window.alert(
            "Upload blocked by Supabase RLS. Add Storage policies that allow authenticated users to insert/select only files inside their own auth.uid() folder.",
          );
          return;
        }

        window.alert(`Upload failed: ${uploadError.message}`);
        return;
      }

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(BACKGROUND_BUCKET)
        .createSignedUrl(filePath, 60 * 60 * 24 * 30);

      if (signedUrlError) {
        window.alert(`Could not load uploaded image: ${signedUrlError.message}`);
        return;
      }

      setBackgroundImagePath(filePath);
      setBackgroundImage(signedUrlData.signedUrl);
      event.target.value = "";
    },
    [supabaseAuthMessage, supabaseUserId],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen failures due to browser limitations.
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio("/sounds/alert.mp3");
    audioRef.current.preload = "auto";

    return () => {
      clearMainTimerAlertLoop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [clearMainTimerAlertLoop]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.darkMode, JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.backgroundImagePath, JSON.stringify(backgroundImagePath));
  }, [backgroundImagePath]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.playlistInput, JSON.stringify(playlistInput));
  }, [playlistInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.playlistId, JSON.stringify(playlistId));
  }, [playlistId]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isSubscribed = true;

    const initAnonymousUser = async () => {
      if (isSubscribed) {
        setSupabaseAuthStatus("initializing");
        setSupabaseAuthMessage("Connecting to Supabase...");
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (isSubscribed) {
          setSupabaseAuthStatus("error");
          setSupabaseAuthMessage(`Supabase session error: ${sessionError.message}`);
        }
        return;
      }

      if (session?.user) {
        if (isSubscribed) {
          setSupabaseUserId(session.user.id);
          setSupabaseAuthStatus("ready");
          setSupabaseAuthMessage("");
        }
        return;
      }

      const { data: anonymousData, error: anonymousError } = await supabase.auth.signInAnonymously();
      if (anonymousError) {
        const isAnonymousDisabled = anonymousError.status === 422;
        if (isSubscribed) {
          setSupabaseAuthStatus("error");
          setSupabaseAuthMessage(
            isAnonymousDisabled
              ? "Enable Anonymous sign-ins in Supabase Auth > Providers to allow private photo uploads."
              : `Supabase auth failed: ${anonymousError.message}`,
          );
        }
        return;
      }

      if (isSubscribed) {
        setSupabaseUserId(anonymousData.user?.id || "");
        setSupabaseAuthStatus("ready");
        setSupabaseAuthMessage("");
      }
    };

    initAnonymousUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isSubscribed) {
        const nextUserId = session?.user?.id || "";
        setSupabaseUserId(nextUserId);
        setSupabaseAuthStatus(nextUserId ? "ready" : "initializing");
        setSupabaseAuthMessage(nextUserId ? "" : "Connecting to Supabase...");
      }
    });

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!backgroundImagePath) {
      setBackgroundImage("");
      return;
    }

    if (!supabase || !supabaseUserId) {
      return;
    }

    const imageOwnerId = backgroundImagePath.split("/")[0];
    if (imageOwnerId !== supabaseUserId) {
      setBackgroundImage("");
      setBackgroundImagePath("");
      return;
    }

    let isMounted = true;

    const fetchSignedUrl = async () => {
      const { data, error } = await supabase.storage
        .from(BACKGROUND_BUCKET)
        .createSignedUrl(backgroundImagePath, 60 * 60 * 24 * 30);

      if (error) {
        return;
      }

      if (isMounted) {
        setBackgroundImage(data.signedUrl);
      }
    };

    fetchSignedUrl();

    return () => {
      isMounted = false;
    };
  }, [backgroundImagePath, supabaseUserId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!isRunning || isPaused) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((currentValue) => {
        if (currentValue <= 1) {
          setIsRunning(false);
          setIsPaused(false);
          resetTaskProgress();
          startMainTimerAlertLoop();
          return 0;
        }

        return currentValue - 1;
      });

      setTaskElapsedSeconds((currentValue) => {
        if (activeTaskIndex === null) {
          return 0;
        }
        return currentValue + 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTaskIndex, isPaused, isRunning, resetTaskProgress, startMainTimerAlertLoop]);

  useEffect(() => {
    if (!isRunning || isPaused || activeTaskIndex === null) {
      return;
    }

    const activeTask = tasks[activeTaskIndex];
    if (!activeTask) {
      setActiveTaskIndex(null);
      setTaskElapsedSeconds(0);
      return;
    }

    const targetSeconds = Math.max(1, Math.round(activeTask.minutes * 60));
    if (taskElapsedSeconds < targetSeconds) {
      return;
    }

    playAlertSoundTimes(3);
    setTaskElapsedSeconds(0);
    setActiveTaskIndex((index) => {
      if (index === null || index >= tasks.length - 1) {
        return null;
      }
      return index + 1;
    });
  }, [
    activeTaskIndex,
    isPaused,
    isRunning,
    playAlertSoundTimes,
    taskElapsedSeconds,
    tasks,
  ]);

  const countdownText = useMemo(
    () => formatCountdown(remainingSeconds),
    [remainingSeconds],
  );

  const youtubeEmbedSrc = useMemo(() => {
    if (!playlistId) {
      return "";
    }

    const params = new URLSearchParams({
      list: playlistId,
      autoplay: "1",
      mute: isPlayerMuted ? "1" : "0",
      controls: "1",
      rel: "0",
    });

    return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
  }, [isPlayerMuted, playlistId]);

  const activeTask = activeTaskIndex !== null ? tasks[activeTaskIndex] : null;
  const activeTaskTargetSeconds = activeTask
    ? Math.max(1, Math.round(activeTask.minutes * 60))
    : 1;
  const activeTaskProgressPercentage = activeTask
    ? Math.min((taskElapsedSeconds / activeTaskTargetSeconds) * 100, 100)
    : 0;

  const appBackgroundStyle = backgroundImage
    ? { backgroundImage: `url(${backgroundImage})` }
    : undefined;

  const outlineButtonClass =
    "rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]";
  const filledButtonClass =
    "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-text)] transition hover:bg-[var(--accent-hover)]";
  const inputClass =
    "w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-0 transition placeholder:text-[var(--text-muted)]/80 focus:border-[var(--accent)]";
  const timerInputClass =
    "rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-center text-lg text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]";

  return (
    <main
      className={`flex min-h-screen items-start justify-center bg-[var(--app-bg)] bg-cover bg-center bg-no-repeat px-4 py-56 text-[var(--text-primary)] transition-colors sm:px-6 sm:py-64 lg:items-center lg:py-8 ${
        isDarkMode ? "dark" : ""
      }`}
      style={appBackgroundStyle}
    >
      <section className="fixed left-3 top-3 z-40 w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--border-color)] bg-[var(--shell-bg)] p-3 shadow-2xl backdrop-blur-md">
        <p className="text-xs uppercase tracking-widest text-[var(--text-heading)]">Playlist</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            className={inputClass}
            onChange={(event) => setPlaylistInput(event.target.value)}
            placeholder="Paste YouTube playlist URL"
            value={playlistInput}
          />
          <button
            className={filledButtonClass}
            onClick={applyPlaylist}
            type="button"
          >
            Load
          </button>
        </div>
        {playlistError ? (
          <p className="mt-2 text-xs text-[var(--danger-text)]">{playlistError}</p>
        ) : null}
        {youtubeEmbedSrc ? (
          <div className="relative mt-2 aspect-video overflow-hidden rounded-xl border border-[var(--border-color)]">
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full"
              src={youtubeEmbedSrc}
              title="Focus playlist player"
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Paste a playlist URL with <code>list=</code>, then click Load.
          </p>
        )}
      </section>

      <div className="mx-auto max-w-6xl rounded-3xl bg-[var(--shell-bg)] p-4 shadow-2xl backdrop-blur-md sm:p-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ThemeToggle isDarkMode={isDarkMode} onToggle={() => setIsDarkMode((enabled) => !enabled)} />
            <label className={`${outlineButtonClass} cursor-pointer`}>
              Upload photo
              <input
                accept="image/*"
                className="hidden"
                onChange={handleBackgroundUpload}
                type="file"
              />
            </label>
            {supabaseAuthStatus !== "ready" ? (
              <p className="w-full text-right text-xs text-[var(--text-muted)]">{supabaseAuthMessage}</p>
            ) : null}
            <button
              className={outlineButtonClass}
              onClick={toggleFullscreen}
              type="button"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 3H5v4M15 3h4v4M9 21H5v-4M19 17v4h-4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 9V5h4M15 5h4v4M9 19H5v-4M21 15v4h-4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--panel-bg)] px-4 py-8 text-center shadow-xl sm:px-6">
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[var(--text-heading)]">Focus Clock</p>
          <FlipCountdown text={countdownText} isRunning={isRunning && !isPaused} />

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <input
              className={timerInputClass}
              min="0"
              onChange={(event) => setHoursInput(event.target.value)}
              placeholder="Hours"
              type="number"
              value={hoursInput}
            />
            <input
              className={timerInputClass}
              min="0"
              onChange={(event) => setMinutesInput(event.target.value)}
              placeholder="Minutes"
              type="number"
              value={minutesInput}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              className={outlineButtonClass}
              onClick={() => applyQuickPreset(5)}
              type="button"
            >
              Short break (5m)
            </button>
            <button
              className={outlineButtonClass}
              onClick={() => applyQuickPreset(15)}
              type="button"
            >
              Long break (15m)
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              className="rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-[var(--accent-text)] transition hover:bg-[var(--accent-hover)]"
              onClick={startTimer}
              type="button"
            >
              Start
            </button>
            <button
              className="rounded-lg border border-[var(--border-color)] px-5 py-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              onClick={togglePause}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                {isPaused ? (
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M8 5v14l11-7-11-7z"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect height="14" rx="1.5" stroke="currentColor" strokeWidth="2" width="4" x="6" y="5" />
                    <rect height="14" rx="1.5" stroke="currentColor" strokeWidth="2" width="4" x="14" y="5" />
                  </svg>
                )}
                {isPaused ? "Resume" : "Pause"}
              </span>
            </button>
            <button
              className="rounded-lg border border-[var(--danger-border)] px-5 py-2 text-[var(--danger-text)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              onClick={stopTimer}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    fill="currentColor"
                    height="10"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    width="10"
                    x="7"
                    y="7"
                  />
                </svg>
                Stop
              </span>
            </button>
            <button
              className="rounded-lg border border-[var(--border-color)] px-5 py-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              onClick={resetTimer}
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    d="M4 4v4.68h4.68"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                Reset
              </span>
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--border-color)] bg-[var(--panel-bg)] p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-heading)]" htmlFor="task-name">
                Task
              </label>
              <input
                className={inputClass}
                id="task-name"
                onChange={(event) => setTaskTitleInput(event.target.value)}
                placeholder="Write feature spec"
                value={taskTitleInput}
              />
            </div>
            <div className="w-full sm:w-36">
              <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-heading)]" htmlFor="task-minutes">
                Approx minutes
              </label>
              <input
                className={inputClass}
                id="task-minutes"
                min="1"
                onChange={(event) => setTaskMinutesInput(event.target.value)}
                placeholder="20"
                type="number"
                value={taskMinutesInput}
              />
            </div>
            <button
              className={filledButtonClass}
              onClick={addTask}
              type="button"
            >
              Add task
            </button>
          </div>

          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Add tasks with approximate durations. The active one highlights while timer runs.
              </p>
            ) : (
              tasks.map((task, index) => {
                const isActive = activeTaskIndex === index && isRunning;
                return (
                  <div
                    className={`relative overflow-hidden rounded-xl border px-3 py-3 transition ${
                      isActive
                        ? "border-[var(--active-border)] bg-[var(--active-bg)]"
                        : "border-[var(--border-color)] bg-[var(--task-row-bg)]"
                    }`}
                    key={task.id}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-[var(--progress-fill)] transition-all duration-1000 ease-linear"
                      style={{ width: isActive ? `${activeTaskProgressPercentage}%` : "0%" }}
                    />
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">~{task.minutes} minutes</p>
                      </div>
                      <button
                        className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        onClick={() => removeTask(task.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
