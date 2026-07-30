import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import { clampArtifactWidth, clampSidebarWidth } from "./workspacePreferences";

const compactArtifactBreakpoint = 886;
const desktopSidebarBreakpoint = 1280;

interface WorkspaceControlsOptions {
  preferredArtifactWidth: number;
  preferredSidebarWidth: number;
  setPreferredArtifactWidth(width: number): void;
  setPreferredSidebarWidth(width: number): void;
}

export function useWorkspaceControls({
  preferredArtifactWidth,
  preferredSidebarWidth,
  setPreferredArtifactWidth,
  setPreferredSidebarWidth
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
  const artifactDragStart = useRef<{ x: number; width: number } | null>(null);
  const sidebarDragStart = useRef<{ x: number; width: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const topActionsRef = useRef<HTMLDivElement>(null);
  const setPreferredArtifactWidthRef = useRef(setPreferredArtifactWidth);
  const setPreferredSidebarWidthRef = useRef(setPreferredSidebarWidth);
  const desktop = viewportWidth >= desktopSidebarBreakpoint;
  const sidebarWidth = clampSidebarWidth(preferredSidebarWidth);
  const artifactWidth = clampArtifactWidth(
    viewportWidth,
    preferredArtifactWidth,
    desktop,
    sidebarWidth
  );

  useEffect(() => {
    setPreferredArtifactWidthRef.current = setPreferredArtifactWidth;
  }, [setPreferredArtifactWidth]);

  useEffect(() => {
    setPreferredSidebarWidthRef.current = setPreferredSidebarWidth;
  }, [setPreferredSidebarWidth]);

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
      if (artifactDragStart.current) {
        setPreferredArtifactWidthRef.current(clampArtifactWidth(
          window.innerWidth,
          artifactDragStart.current.width + artifactDragStart.current.x - event.clientX,
          window.innerWidth >= desktopSidebarBreakpoint,
          sidebarWidth
        ));
      }
      if (sidebarDragStart.current) {
        setPreferredSidebarWidthRef.current(clampSidebarWidth(
          sidebarDragStart.current.width + event.clientX - sidebarDragStart.current.x
        ));
      }
    };
    const end = () => {
      artifactDragStart.current = null;
      sidebarDragStart.current = null;
      document.body.classList.remove("resizing-artifact");
      document.body.classList.remove("resizing-sidebar");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [sidebarWidth]);

  function resizeArtifactBy(delta: number) {
    setPreferredArtifactWidth(clampArtifactWidth(
      viewportWidth,
      artifactWidth + delta,
      desktop,
      sidebarWidth
    ));
  }

  function resizeSidebarBy(delta: number) {
    setPreferredSidebarWidth(clampSidebarWidth(sidebarWidth + delta));
  }

  function startArtifactResize(event: ReactPointerEvent<HTMLDivElement>) {
    artifactDragStart.current = { x: event.clientX, width: artifactWidth };
    document.body.classList.add("resizing-artifact");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    sidebarDragStart.current = { x: event.clientX, width: sidebarWidth };
    document.body.classList.add("resizing-sidebar");
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
    sidebarWidth,
    settingsOpen,
    sidebarOpen,
    topActionsRef,
    resizeArtifactBy,
    resizeSidebarBy,
    setArtifactMaximized,
    setArtifactOpen,
    setGridVisible,
    setNotificationsOpen,
    setSearchQuery,
    setSettingsOpen,
    setSidebarOpen,
    startArtifactResize,
    startSidebarResize
  };
}
