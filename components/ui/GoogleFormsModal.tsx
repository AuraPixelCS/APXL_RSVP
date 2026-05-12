import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { FieldMapping, MapsTo } from "@/types";

// ─── Re-export so consumers don't need to import from @/types separately ──────
export type { FieldMapping, MapsTo };

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_API_URL =
  "https://e71c-2405-201-e000-e008-c839-6a10-65e9-4f45.ngrok-free.app/api/rsvp/submit";

export const DEFAULT_MAPPINGS: FieldMapping[] = [
  { id: "1", formHeader: "First Name",                   mapsTo: "firstName" },
  { id: "2", formHeader: "Last Name",                    mapsTo: "lastName"  },
  { id: "3", formHeader: "Email",                        mapsTo: "email"     },
  { id: "4", formHeader: "Mobile Phone",                 mapsTo: "phone"     },
  { id: "5", formHeader: "Anything you like us to know", mapsTo: "message"   },
  { id: "6", formHeader: "I am part of this story as a", mapsTo: "extra", extraLabel: "Role"     },
  { id: "7", formHeader: "Jobtitle",                     mapsTo: "extra", extraLabel: "Title"    },
  { id: "8", formHeader: "Industry",                     mapsTo: "extra", extraLabel: "Industry" },
];

const MAPS_TO_LABELS: Record<MapsTo, string> = {
  firstName: "First Name",
  lastName:  "Last Name",
  email:     "Email",
  phone:     "Phone",
  message:   "Message",
  extra:     "Append to Message",
  ignore:    "Ignore",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  // Lifted state
  googleFormMode: boolean;
  onGoogleFormModeChange: (v: boolean) => void;
  mappings: FieldMapping[];
  onMappingsChange: (m: FieldMapping[]) => void;
  apiUrl: string;
  onApiUrlChange: (v: string) => void;
  starredFieldId: string | null;
  onStarredFieldIdChange: (id: string | null) => void;
}

// ─── Script Generator ─────────────────────────────────────────────────────────

function generateScript(
  eventId: string,
  apiUrl: string,
  mappings: FieldMapping[]
): string {
  const firstName  = mappings.find((m) => m.mapsTo === "firstName");
  const lastName   = mappings.find((m) => m.mapsTo === "lastName");
  const emailMap   = mappings.find((m) => m.mapsTo === "email");
  const phoneMap   = mappings.find((m) => m.mapsTo === "phone");
  const messageMap = mappings.find((m) => m.mapsTo === "message");
  const extras     = mappings.filter((m) => m.mapsTo === "extra");

  const nameLines: string[] = [];
  if (firstName && lastName) {
    nameLines.push(
      `    const firstName = getVal(${JSON.stringify(firstName.formHeader)});`,
      `    const lastName  = getVal(${JSON.stringify(lastName.formHeader)});`,
      "    const fullName  = `${firstName} ${lastName}`.trim();"
    );
  } else if (firstName) {
    nameLines.push(`    const fullName = getVal(${JSON.stringify(firstName.formHeader)});`);
  } else if (lastName) {
    nameLines.push(`    const fullName = getVal(${JSON.stringify(lastName.formHeader)});`);
  } else {
    nameLines.push(`    const fullName = "";`);
  }

  const messageInit = messageMap
    ? `    let combinedMessage = getVal(${JSON.stringify(messageMap.formHeader)});`
    : `    let combinedMessage = "";`;

  const extraLines = extras.map((ex, i) => {
    const varName = `extra${i}`;
    const label   = ex.extraLabel || ex.formHeader;
    return [
      `    const ${varName} = getVal(${JSON.stringify(ex.formHeader)});`,
      `    if (${varName}) combinedMessage += \`\\n${label}: \${${varName}}\`;`,
    ].join("\n");
  });

  return [
    `const EVENT_ID = ${JSON.stringify(eventId)};`,
    `const API_URL  = ${JSON.stringify(apiUrl)};`,
    `// --------------------`,
    ``,
    `function onFormSubmit(e) {`,
    `  try {`,
    `    const responses = e.namedValues;`,
    `    if (!responses) return;`,
    ``,
    `    const getVal = (header) => {`,
    `      return (responses[header] && responses[header][0])`,
    `        ? responses[header][0].trim()`,
    `        : "";`,
    `    };`,
    ``,
    `    // Name`,
    ...nameLines,
    ``,
    `    // Message`,
    messageInit,
    ...extraLines,
    ``,
    `    const payload = {`,
    `      eventId: EVENT_ID,`,
    `      name: fullName,`,
    `      email: getVal(${JSON.stringify(emailMap?.formHeader ?? "")}),`,
    `      phone: getVal(${JSON.stringify(phoneMap?.formHeader ?? "")}),`,
    `      attending: true,`,
    `      plusOne: false,`,
    `      plusOneName: null,`,
    `      dietaryRestrictions: null,`,
    `      message: combinedMessage.trim() || null`,
    `    };`,
    ``,
    `    const options = {`,
    `      method: "post",`,
    `      contentType: "application/json",`,
    `      headers: { "ngrok-skip-browser-warning": "true" },`,
    `      payload: JSON.stringify(payload),`,
    `      muteHttpExceptions: true`,
    `    };`,
    ``,
    `    const response = UrlFetchApp.fetch(API_URL, options);`,
    ``,
    `    Logger.log("PAYLOAD SENT: " + JSON.stringify(payload));`,
    `    Logger.log("SERVER HTTP STATUS: " + response.getResponseCode());`,
    `    Logger.log("SERVER REPLY: " + response.getContentText());`,
    ``,
    `  } catch (err) {`,
    `    Logger.log("Error: " + err.message);`,
    `  }`,
    `}`,
  ].join("\n");
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "var(--accent)" : "none"} stroke={filled ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? "var(--accent)" : "var(--surface)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s, border-color 0.2s",
          flexShrink: 0,
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            display: "block",
          }}
        />
      </button>
      <span style={{ fontSize: 12, fontWeight: 500, color: checked ? "var(--accent)" : "var(--muted)" }}>
        {label}
      </span>
    </label>
  );
}

// ─── Setup Tab ────────────────────────────────────────────────────────────────

function SetupTab({
  apiUrl,
  onApiUrlChange,
  mappings,
  onMappingsChange,
  starredFieldId,
  onStarredFieldIdChange,
}: {
  apiUrl: string;
  onApiUrlChange: (v: string) => void;
  mappings: FieldMapping[];
  onMappingsChange: (m: FieldMapping[]) => void;
  starredFieldId: string | null;
  onStarredFieldIdChange: (id: string | null) => void;
}) {
  const updateRow = (id: string, patch: Partial<FieldMapping>) =>
    onMappingsChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const removeRow = (id: string) => {
    onMappingsChange(mappings.filter((m) => m.id !== id));
    if (starredFieldId === id) onStarredFieldIdChange(null);
  };

  const addRow = () => {
    const newId = String(Date.now());
    onMappingsChange([...mappings, { id: newId, formHeader: "", mapsTo: "ignore" }]);
  };

  const toggleStar = (id: string) =>
    onStarredFieldIdChange(starredFieldId === id ? null : id);

  const inputStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 12,
    color: "var(--foreground)",
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* API URL */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          API URL
        </label>
        <input
          value={apiUrl}
          onChange={(e) => onApiUrlChange(e.target.value)}
          spellCheck={false}
          style={{
            ...inputStyle,
            fontFamily: "'Fira Code', monospace",
            fontSize: 11,
            padding: "8px 10px",
            background: "var(--surface)",
          }}
        />
        <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
          Swap this URL when moving from ngrok to production.
        </p>
      </div>

      {/* Mapping table */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Field Mappings
          </label>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            ★ = show as column in guest list
          </span>
        </div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 100px 24px 24px", gap: 6, padding: "0 0 4px" }}>
          {["Google Form Header", "Maps To", "Label (prefix)", "", ""].map((h, i) => (
            <span key={i} style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {mappings.map((row) => {
            const isStarred = starredFieldId === row.id;
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 150px 100px 24px 24px",
                  gap: 6,
                  alignItems: "center",
                  background: isStarred ? "rgba(61,155,245,0.06)" : "var(--surface)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  border: `1px solid ${isStarred ? "rgba(61,155,245,0.3)" : "var(--border)"}`,
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {/* Form header */}
                <input
                  value={row.formHeader}
                  onChange={(e) => updateRow(row.id, { formHeader: e.target.value })}
                  placeholder="Column header…"
                  style={inputStyle}
                />

                {/* Maps to */}
                <select
                  value={row.mapsTo}
                  onChange={(e) => updateRow(row.id, { mapsTo: e.target.value as MapsTo })}
                  style={{
                    ...inputStyle,
                    cursor: "pointer",
                    background: "var(--surface-2)",
                  }}
                >
                  {(Object.keys(MAPS_TO_LABELS) as MapsTo[]).map((k) => (
                    <option key={k} value={k}>{MAPS_TO_LABELS[k]}</option>
                  ))}
                </select>

                {/* Extra label */}
                <input
                  value={row.extraLabel ?? ""}
                  onChange={(e) => updateRow(row.id, { extraLabel: e.target.value })}
                  placeholder="e.g. Role"
                  style={{
                    ...inputStyle,
                    visibility: row.mapsTo === "extra" ? "visible" : "hidden",
                  }}
                />

                {/* Star */}
                <button
                  onClick={() => toggleStar(row.id)}
                  title={isStarred ? "Remove from guest list column" : "Show as column in guest list"}
                  style={{
                    background: "none",
                    border: "none",
                    color: isStarred ? "var(--accent)" : "var(--muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 3,
                    borderRadius: 4,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isStarred) e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { if (!isStarred) e.currentTarget.style.color = "var(--muted)"; }}
                >
                  <StarIcon filled={isStarred} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => removeRow(row.id)}
                  title="Remove row"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 3,
                    borderRadius: 4,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <button
          onClick={addRow}
          style={{
            marginTop: 4,
            background: "none",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            padding: "7px 12px",
            color: "var(--muted)",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent)";
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--muted)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <PlusIcon /> Add Field
        </button>
      </div>
    </div>
  );
}

// ─── Script Tab ───────────────────────────────────────────────────────────────

function ScriptTab({ script, eventTitle }: { script: string; eventTitle: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [script]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([script], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${eventTitle.replace(/[^a-z0-9]/gi, "_")}_AppsScript.gs`;
    a.click();
    URL.revokeObjectURL(url);
  }, [script, eventTitle]);

  const btnStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 12, fontWeight: 500,
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Generated Apps Script
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCopy}
            style={{ ...btnStyle, color: copied ? "var(--accent)" : "var(--foreground)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <CopyIcon /> {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={handleDownload}
            style={btnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <DownloadIcon /> Download .gs
          </button>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        Paste this into the Apps Script editor, then go to{" "}
        <strong style={{ color: "var(--foreground)" }}>Triggers → Add Trigger</strong> and set{" "}
        <strong style={{ color: "var(--foreground)" }}>onFormSubmit</strong> as an{" "}
        <strong style={{ color: "var(--foreground)" }}>On form submit</strong> event.
      </p>

      <pre style={{
        margin: 0,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "14px 16px",
        fontFamily: "'Fira Code', monospace",
        fontSize: 11.5,
        color: "var(--foreground)",
        overflowX: "auto",
        whiteSpace: "pre",
        lineHeight: 1.65,
      }}>
        <code>{script}</code>
      </pre>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function GoogleFormsModal({
  open,
  onClose,
  eventId,
  eventTitle,
  googleFormMode,
  onGoogleFormModeChange,
  mappings,
  onMappingsChange,
  apiUrl,
  onApiUrlChange,
  starredFieldId,
  onStarredFieldIdChange,
}: Props) {
  const [tab, setTab] = useState<"setup" | "script">("setup");

  // Reset to setup tab each open
  useEffect(() => { if (open) setTab("setup"); }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const script = generateScript(eventId, apiUrl, mappings);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 16px",
    fontSize: 13, fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: "none",
    color: active ? "var(--accent)" : "var(--muted)",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    transition: "color 0.15s",
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.78)",
            zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              width: "100%", maxWidth: 700,
              maxHeight: "85vh",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>
                  Google Forms Setup
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  Map form columns, then copy the generated Apps Script.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* Toggle */}
                <Toggle
                  checked={googleFormMode}
                  onChange={onGoogleFormModeChange}
                  label="Use in guest list"
                />
                {/* Close */}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    background: "none", border: "none",
                    color: "var(--muted)",
                    cursor: "pointer", padding: 4,
                    display: "flex", alignItems: "center",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* Google Form mode indicator banner */}
            {googleFormMode && (
              <div style={{
                margin: "12px 24px 0",
                padding: "8px 12px",
                background: "rgba(61,155,245,0.08)",
                border: "1px solid rgba(61,155,245,0.2)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--accent)",
              }}>
                Guest list columns are using your form field labels.
                {starredFieldId && mappings.find(m => m.id === starredFieldId) && (
                  <span style={{ color: "var(--muted)" }}>
                    {" "}Starred field "
                    <strong style={{ color: "var(--foreground)" }}>
                      {mappings.find(m => m.id === starredFieldId)?.extraLabel ||
                       mappings.find(m => m.id === starredFieldId)?.formHeader}
                    </strong>
                    " shown as extra column.
                  </span>
                )}
              </div>
            )}

            {/* Tab bar */}
            <div style={{ padding: "0 24px", marginTop: 14, borderBottom: "1px solid var(--border)", display: "flex" }}>
              <button style={tabStyle(tab === "setup")}  onClick={() => setTab("setup")}>Form Setup</button>
              <button style={tabStyle(tab === "script")} onClick={() => setTab("script")}>Apps Script</button>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {tab === "setup" ? (
                <SetupTab
                  apiUrl={apiUrl}
                  onApiUrlChange={onApiUrlChange}
                  mappings={mappings}
                  onMappingsChange={onMappingsChange}
                  starredFieldId={starredFieldId}
                  onStarredFieldIdChange={onStarredFieldIdChange}
                />
              ) : (
                <ScriptTab script={script} eventTitle={eventTitle} />
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {tab === "setup" ? (
                <button
                  onClick={() => setTab("script")}
                  style={{
                    background: "var(--accent)", color: "#fff",
                    border: "none", borderRadius: 8,
                    padding: "8px 18px",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Generate Script →
                </button>
              ) : (
                <button
                  onClick={onClose}
                  style={{
                    background: "var(--surface)", color: "var(--foreground)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  Done
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
