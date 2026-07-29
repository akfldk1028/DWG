import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import { clampArtifactWidth } from "./workspacePreferences";

const compactArtifactBreakpoint = 886;
const desktopSidebarBreakpoint = 1280;

interface WorkspaceControlsOptions {
  preferredArtifactWidth: number;
  setPreferredArtifactWidth(width: number): void;
}

export function useWorkspaceControls({
  preferredArtifactWidth,
  setPreferredArtifactWidth
}: WorkspaceControlsOptions) {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.innerWidth >= desktopSidebarBreakpoint
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [artifactMaximized, setArtifactMaximized] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(
    () => window.innerWidth > compactArtifactBreakpoint
  );
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const topActionsRef = useRef<HTMLDivElement>(null);
  const setPreferredArtifactWidthRef = useRef(setPreferredArtifactWidth);
  const desktop = viewportWidth >= desktopSidebarBreakpoint;
  const artifactWidth = clampArtifactWidth(
    viewportWidth,
    preferredArtifactWidth,
    desktop
  );

  useEffect(() => {
    setPreferredArtifactWidthRef.current = setPreferredArtifactWidth;
  }, [setPreferredArtifactWidth]);

  useEffect(() => {
    const resize = () => {
      setViewportWidth(window.innerWidth);
      if (window.innerWidth >= desktopSidebarBreakpoint) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setNotificationsOpen(false);
        setArtifactMaximized(false);
      }
    };
    const pointerdown = (event: PointerEvent) => {
      if (!topActionsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointerdown", pointerdown);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointerdown", pointerdown);
    };
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragStart.current) return;
      setPreferredArtifactWidthRef.current(clampArtifactWidth(
        window.innerWidth,
        dragStart.current.width + dragStart.current.x - event.clientX,
        window.innerWidth >= desktopSidebarBreakpoint
      ));
    };
    const end = () => {
      dragStart.current = null;
      document.body.classList.remove("resizing-artifact");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, []);

  function resizeArtifactBy(delta: number) {
    setPreferredArtifactWidth(clampArtifactWidth(
      viewportWidth,
      artifactWidth + delta,
      desktop
    ));
  }

  function startArtifactResize(event: ReactPointerEvent<HTMLDivElement>) {
    dragStart.current = { x: event.clientX, width: artifactWidth };
    document.body.classList.add("resizing-artifact");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return {
    artifactMaximized,
    artifactOpen,
    artifactWidth,
    desktop,
    gridVisible,
    notificationsOpen,
    searchQuery,
    searchRef,
    settingsOpen,
    sidebarOpen,
    topActionsRef,
    resizeArtifactBy,
    setArtifactMaximized,
    setArtifactOpen,
    setGridVisible,
    setNotificationsOpen,
    setSearchQuery,
    setSettingsOpen,
    setSidebarOpen,
    startArtifactResize
  };
}
