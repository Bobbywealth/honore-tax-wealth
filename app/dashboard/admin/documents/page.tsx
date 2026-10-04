import { Search, Filter, Upload, FolderOpen, Grid3x3, List, FileText, Image, Sheet, File } from "lucide-react";
import AdminShell from "../AdminShell";
import { checkAdminAccess } from "../auth";

export const dynamic = "force-dynamic";

const docs = [
  { name: "Rivera_W2_2025.pdf", client: "Lena Rivera", ext: "PDF", type: "pdf", size: "1.2 MB", when: "2m ago" },
  { name: "Okafor_1099-MISC.pdf", client: "J. Okafor", ext: "W9", type: "pdf", size: "845 KB", when: "14m ago" },
  { name: "Patel_receipts.jpg", client: "Aanya Patel", ext: "JPG", type: "img", size: "3.4 MB", when: "1h ago" },
  { name: "Hassan_K1_2024.pdf", client: "P. Hassan", ext: "PDF", type: "pdf", size: "2.1 MB", when: "3h ago" },
  { name: "Whitlock_1120S_2024.xlsx", client: "S. Whitlock", ext: "XLS", type: "xls", size: "412 KB", when: "Yesterday" },
  { name: "Castillo_HomeOffice_SqFt.pdf", client: "R. Castillo", ext: "PDF", type: "pdf", size: "180 KB", when: "Yesterday" },
  { name: "Kim_Engagement_2025.pdf", client: "Sharon Kim", ext: "PDF", type: "pdf", size: "234 KB", when: "Yesterday" },
  { name: "Park_1040X_Amend.docx", client: "David Park", ext: "DOC", type: "doc", size: "78 KB", when: "2d ago" },
  { name: "Taylor_Q3_PL.pdf", client: "Marcus Taylor", ext: "PDF", type: "pdf", size: "1.8 MB", when: "2d ago" },
  { name: "Patel_Depreciation.xlsx", client: "Aanya Patel", ext: "XLS", type: "xls", size: "245 KB", when: "3d ago" },
  { name: "Hassan_1065_Final.pdf", client: "P. Hassan", ext: "PDF", type: "pdf", size: "4.2 MB", when: "4d ago" },
  { name: "Mitchell_K1_2024.pdf", client: "Sara Mitchell", ext: "PDF", type: "pdf", size: "612 KB", when: "5d ago" },
  { name: "Okafor_Equipment_Receipt.jpg", client: "J. Okafor", ext: "JPG", type: "img", size: "2.7 MB", when: "5d ago" },
  { name: "Vega_Partnership_Agmt.pdf", client: "Tomas Vega", ext: "PDF", type: "pdf", size: "1.1 MB", when: "1w ago" },
  { name: "Chen_Studio_1099NEC.pdf", client: "Maya Chen", ext: "PDF", type: "pdf", size: "320 KB", when: "1w ago" },
  { name: "Chen_HomeOffice_Photo.jpg", client: "Maya Chen", ext: "JPG", type: "img", size: "1.9 MB", when: "1w ago" },
];

export default async function DocumentsPage({ searchParams }: { searchParams?: Promise<{ preview?: string }> }) {
  const access = await checkAdminAccess(searchParams);
  if (!access.allowed) return access.restricted;
  return (
    <AdminShell preview={access.preview} currentHref="/dashboard/admin/documents">
      <div className="adm-page-h">
        <div>
          <h1>Documents</h1>
          <div className="sub">16 files · 24.6 MB total · 7 pending review across 9 clients</div>
        </div>
        <button className="adm-btn"><Upload size={13} /> Upload files</button>
      </div>

      <div className="adm-clients-toolbar">
        <div className="adm-clients-search">
          <Search size={14} />
          <input placeholder="Search documents by name, client, or type…" />
        </div>
        <button className="adm-clients-filter active">All</button>
        <button className="adm-clients-filter">PDFs</button>
        <button className="adm-clients-filter">Spreadsheets</button>
        <button className="adm-clients-filter">Images</button>
        <button className="adm-clients-filter">Pending</button>
        <div style={{ flex: 1 }} />
        <button className="adm-clients-filter active"><Grid3x3 size={11} /> Grid</button>
        <button className="adm-clients-filter"><List size={11} /> List</button>
      </div>

      <div className="adm-docs-grid">
        {docs.map((d) => (
          <div key={d.name} className="adm-doc-card">
            <div className={`adm-doc-thumb ${d.type}`}>
              <span className="ext">{d.ext}</span>
              <span className="size">{d.size}</span>
            </div>
            <b>{d.name}</b>
            <div className="sm">{d.client} · {d.when}</div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
