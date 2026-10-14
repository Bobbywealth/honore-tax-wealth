const ROLES: Array<{ name: string; description: string }> = [
  {
    name: "Admin",
    description: "Full practice access. Sees every client with no scoping, manages team members, and can change all settings.",
  },
  {
    name: "Staff",
    description: "Day-to-day tax work. Accesses the admin area; the client list is scoped to clients assigned to them.",
  },
  {
    name: "Assistant",
    description: "Limited support role. Can be assigned to clients and tasks; does not get full admin-area access.",
  },
  {
    name: "Client",
    description: "Client portal only. Sees only their own engagements, documents, forms, invoices, and appointments.",
  },
];

const MATRIX: Array<{ capability: string; admin: boolean; staff: boolean; assistant: boolean; client: boolean }> = [
  { capability: "View all clients (unscoped)", admin: true, staff: false, assistant: false, client: false },
  { capability: "View assigned clients", admin: true, staff: true, assistant: true, client: false },
  { capability: "Manage returns pipeline", admin: true, staff: true, assistant: false, client: false },
  { capability: "Confirm appointments", admin: true, staff: true, assistant: false, client: false },
  { capability: "Create signable forms", admin: true, staff: true, assistant: false, client: false },
  { capability: "Manage team members", admin: true, staff: false, assistant: false, client: false },
  { capability: "Edit practice settings", admin: true, staff: false, assistant: false, client: false },
  { capability: "Client portal (own records)", admin: false, staff: false, assistant: false, client: true },
];

function Mark({ ok }: { ok: boolean }) {
  return (
    <span aria-label={ok ? "Allowed" : "Not allowed"} style={{ color: ok ? "#2f8a5b" : "#b9c0c7" }}>
      {ok ? "●" : "○"}
    </span>
  );
}

export default function RolesAccessSection() {
  return (
    <section className="adm-settings-pane" id="team" style={{ marginTop: 14 }}>
      <h3>Roles &amp; access</h3>
      <div className="sub">
        What each role can do. Roles are assigned on the Team page; this matrix documents the current access rules.
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {ROLES.map((r) => (
          <div key={r.name} className="adm-settings-row">
            <div>
              <b>{r.name}</b>
              <div className="sm">{r.description}</div>
            </div>
          </div>
        ))}
      </div>

      <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: 14 }}>Permissions matrix</h4>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <caption className="sr-only">Role permissions matrix</caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">Admin</th>
              <th scope="col">Staff</th>
              <th scope="col">Assistant</th>
              <th scope="col">Client</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.capability}>
                <td>{m.capability}</td>
                <td><Mark ok={m.admin} /></td>
                <td><Mark ok={m.staff} /></td>
                <td><Mark ok={m.assistant} /></td>
                <td><Mark ok={m.client} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sm" style={{ marginTop: 8 }}>
        Manage who is on the team from the <a href="/dashboard/admin/team">Team page</a>.
      </div>
    </section>
  );
}
