import { useEffect, useRef, useState } from "react";

type ActivePopover = "notifications" | "settings" | null;

export function useWorkspaceControls() {
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const topActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setActivePopover(null);
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    function closePopover(event: PointerEvent) {
      if (!topActionsRef.current?.contains(event.target as Node)) {
        setActivePopover(null);
      }
    }
    window.addEventListener("pointerdown", closePopover);
    return () => window.removeEventListener("pointerdown", closePopover);
  }, []);

  return {
    agentPanelOpen,
    activePopover,
    gridVisible,
    searchQuery,
    searchRef,
    topActionsRef,
    setActivePopover,
    setAgentPanelOpen,
    setGridVisible,
    setSearchQuery
  };
}
