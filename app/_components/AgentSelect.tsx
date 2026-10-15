"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Agent = { id: string; name: string; title: string };

/**
 * "Work with this professional" buttons for the homepage team section.
 *
 * The homepage is a static markup string, so this component portals into the
 * `#agent-select-mount` div inside the team section. Each button links to
 * /register?agent=<id>; the registration API validates the id and assigns
 * the new client to that agent automatically.
 */
export default function AgentSelect() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMount(document.getElementById("agent-select-mount"));
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.agents)) setAgents(d.agents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!mount || loading || agents.length === 0) return null;

  return createPortal(
    <div className="agent-select" role="group" aria-label="Choose your tax professional">
      <p className="agent-select-intro">
        Prefer to choose? Pick your tax professional — you will be connected
        automatically when you register.
      </p>
      <div className="agent-select-buttons">
        {agents.map((a) => (
          <a
            key={a.id}
            className="agent-select-button"
            href={`/register?agent=${encodeURIComponent(a.id)}`}
          >
            Work with {a.name}
            <span className="agent-select-title">{a.title}</span>
          </a>
        ))}
      </div>
    </div>,
    mount,
  );
}
