import { useEffect, useRef, useCallback, useState } from "react";
import api from "../services/api";

/**
 * Wires up every anti-cheat rule from the spec:
 *  - fullscreen required + exit detection
 *  - tab-switch / blur / visibilitychange
 *  - right-click / copy / paste / text-selection disabled
 *  - best-effort devtools-open detection
 *  - print disabled
 *  - refresh confirmation
 *  - back-button blocked
 *
 * Every violation is POSTed to /api/student/warning. The backend is the
 * source of truth for the warning count and decides auto-submit; this hook
 * just surfaces `warningCount` / `autoSubmitTriggered` so the quiz screen
 * can react (show a toast, then call the submit handler).
 */
export function useAntiCheat({ enabled, onAutoSubmit, cameraRequired, fullscreenRequired }) {
  const [warningCount, setWarningCount] = useState(0);
  const [lastWarning, setLastWarning] = useState(null);
  const devtoolsCheckRef = useRef(null);

  const reportWarning = useCallback(async (warning_type, detail) => {
    if (!enabled) return;
    try {
      const { data } = await api.post("/student/warning", { warning_type, detail });
      setWarningCount(data.warning_count);
      setLastWarning({ warning_type, detail, count: data.warning_count });
      if (data.auto_submit) {
        onAutoSubmit?.("auto_warning_limit");
      }
    } catch (e) {
      // If the warning post itself fails (e.g. session already gone),
      // don't crash the quiz UI over it.
      console.warn("Failed to report warning", e);
    }
  }, [enabled, onAutoSubmit]);

  // ---- fullscreen ----
  const requestFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) return el.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !fullscreenRequired) return;
    const handler = () => {
      const isFs = !!document.fullscreenElement;
      api.post(`/student/fullscreen-status?on=${isFs}`).catch(() => {});
      if (!isFs) reportWarning("fullscreen_exit", "Exited fullscreen");
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [enabled, fullscreenRequired, reportWarning]);

  // ---- tab switch / blur / visibility ----
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.hidden) reportWarning("tab_switch", "visibilitychange: tab hidden");
    };
    const onBlur = () => reportWarning("tab_switch", "window blur");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, reportWarning]);

  // ---- right click / copy / paste / selection / print ----
  useEffect(() => {
    if (!enabled) return;
    const onContextMenu = (e) => { e.preventDefault(); reportWarning("right_click", "context menu blocked"); };
    const onCopy = (e) => { e.preventDefault(); reportWarning("copy_paste", "copy blocked"); };
    const onPaste = (e) => { e.preventDefault(); reportWarning("copy_paste", "paste blocked"); };
    const onCut = (e) => e.preventDefault();
    const onSelectStart = (e) => e.preventDefault();
    const onBeforePrint = () => reportWarning("copy_paste", "print attempted");
    const onKeyDown = (e) => {
      // Block common print / devtools / view-source shortcuts (best-effort only)
      const blockedCombos = [
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p",
        (e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase()),
        e.key === "F12",
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u",
      ];
      if (blockedCombos.some(Boolean)) {
        e.preventDefault();
        reportWarning("devtools_open", `blocked shortcut: ${e.key}`);
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, [enabled, reportWarning]);

  // ---- best-effort devtools detection (window size delta heuristic) ----
  useEffect(() => {
    if (!enabled) return;
    devtoolsCheckRef.current = setInterval(() => {
      const threshold = 160;
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > threshold || heightDelta > threshold) {
        reportWarning("devtools_open", "window size heuristic tripped");
      }
    }, 3000);
    return () => clearInterval(devtoolsCheckRef.current);
  }, [enabled, reportWarning]);

  // ---- back button blocked ----
  useEffect(() => {
    if (!enabled) return;
    history.pushState(null, "", location.href);
    const onPopState = () => {
      history.pushState(null, "", location.href);
      reportWarning("tab_switch", "back button pressed");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled, reportWarning]);

  // ---- refresh confirmation ----
  useEffect(() => {
    if (!enabled) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);

  return { warningCount, lastWarning, reportWarning, requestFullscreen };
}
