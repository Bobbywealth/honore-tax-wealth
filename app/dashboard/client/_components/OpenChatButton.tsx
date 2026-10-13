"use client";

import type { ReactNode } from "react";

/**
 * Button that opens the global client chat widget. Dispatches a
 * CustomEvent("open-client-chat") which the ChatLauncher listens for.
 * Pass a threadId to open the widget directly to that conversation.
 */
export default function OpenChatButton({
  threadId,
  className,
  children,
  ariaLabel,
}: {
  threadId?: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("open-client-chat", { detail: { threadId } }),
        )
      }
    >
      {children}
    </button>
  );
}
