import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Papa from "papaparse";

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onImportComplete: () => void;
}

type TargetField =
  | "name" | "email" | "phone"
  | "partOf" | "company" | "jobTitle" | "industry"
  | "message" | "plusOne" | "plusOneName" | "dietaryRestrictions"
  | "ignore";

const TARGET_LABELS: Record<TargetField, string> = {
  name: "Full Name",
  email: "Email",
  phone: "Phone",
  partOf: "Part Of (Role)",
  company: "Company",
  jobTitle: "Job Title",
  industry: "Industry",
  message: "Message / Notes",
  plusOne: "+1 Guest",
  plusOneName: "+1 Name",
  dietaryRestrictions: "Dietary Restrictions",
  ignore: "— Ignore —",
};

function autoDetect(rawKey: string): TargetField {
  const k = rawKey.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["name", "firstname", "fullname"].includes(k)) return "name";
  if (["email", "emailaddress"].includes(k)) return "email";
  if (["phone", "mobile", "phonenumber"].includes(k)) return "phone";
  if (["partof", "iamapartofthisstoryasa", "iampartofthisstory", "role", "partofevent", "iampartof"].includes(k)) return "partOf";
  if (["company", "companyname", "organisation", "organization"].includes(k)) return "company";
  if (["jobtitle", "title", "position"].includes(k)) return "jobTitle";
  if (["industry", "sector"].includes(k)) return "industry";
  if (["message", "notes", "anythingyoudlikeusknow", "anything", "comments"].includes(k)) return "message";
  if (k === "plusone") return "plusOne";
  if (k === "plusonename") return "plusOneName";
  if (["dietaryrestrictions", "diet", "dietary"].includes(k)) return "dietaryRestrictions";
  return "ignore";
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function ImportCsvModal({ open, onClose, eventId, onImportComplete }: Props) {
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetField>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !isImporting) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, isImporting]);

  useEffect(() => {
    if (open) {
      setStep("upload");
      setFile(null);
      setCsvHeaders([]);
      setCsvPreview([]);
      setMapping({});
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleNext = () => {
    if (!file) return;
    setIsParsing(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 4,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const preview = (results.data as Record<string, string>[]).slice(0, 3);
        const autoMapping: Record<string, TargetField> = {};
        for (const h of headers) {
          autoMapping[h] = autoDetect(h);
        }
        setCsvHeaders(headers);
        setCsvPreview(preview);
        setMapping(autoMapping);
        setStep("map");
        setIsParsing(false);
      },
      error: (err) => {
        setError("Error reading CSV: " + err.message);
        setIsParsing(false);
      },
    });
  };

  const handleImport = () => {
    if (!file) return;
    setIsImporting(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as Record<string, string>[];
          const validData = rows.map((row) => {
            const mapped: Record<string, string | boolean> = {};
            for (const [csvCol, target] of Object.entries(mapping)) {
              if (target === "ignore") continue;
              const val = (row[csvCol] || "").trim();
              if (!val) continue;
              if (target === "plusOne") {
                mapped[target] = val.toLowerCase() === "true" || val === "1";
              } else {
                // Concatenate if two CSV cols map to the same target (e.g. first + last name)
                mapped[target] = mapped[target] ? `${mapped[target]} ${val}` : val;
              }
            }
            return mapped;
          }).filter((row) => row.name && row.email);

          if (validData.length === 0) {
            setError("No valid rows found. Make sure at least Name and Email columns are mapped.");
            setIsImporting(false);
            return;
          }

          const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/admin/events/import-csv`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId, rsvps: validData }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Import failed");

          setResult({ added: data.added, updated: data.updated ?? 0, skipped: data.skipped ?? 0 });
          setStep("result");
          onImportComplete();
        } catch (err: any) {
          setError(err.message || "An unexpected error occurred.");
        } finally {
          setIsImporting(false);
        }
      },
      error: (err) => {
        setError("Error parsing CSV: " + err.message);
        setIsImporting(false);
      },
    });
  };

  const hasRequiredMappings = Object.values(mapping).includes("name") && Object.values(mapping).includes("email");

  const modalWidth = step === "map" ? 680 : 500;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => !isImporting && onClose()}
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
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              width: "100%", maxWidth: modalWidth,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
              maxHeight: "90vh",
            }}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>
                  {step === "upload" && "Import from CSV"}
                  {step === "map" && "Map Columns"}
                  {step === "result" && "Import Complete"}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                  {step === "upload" && "Upload a CSV file to add multiple RSVPs."}
                  {step === "map" && "Tell us what each column in your CSV contains."}
                  {step === "result" && "Your CSV has been imported successfully."}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={isImporting}
                aria-label="Close"
                style={{
                  background: "none", border: "none",
                  color: "var(--muted)",
                  cursor: isImporting ? "not-allowed" : "pointer", padding: 4,
                  display: "flex", alignItems: "center",
                  transition: "color 0.15s",
                  opacity: isImporting ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>

              {/* ── Step 1: Upload ── */}
              {step === "upload" && (
                <>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed var(--border)",
                      borderRadius: 8,
                      padding: "40px 20px",
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "border-color 0.2s, background 0.2s",
                      background: file ? "rgba(61,155,245,0.05)" : "transparent",
                      borderColor: file ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    <UploadIcon />
                    <h4 style={{ margin: "12px 0 4px", fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
                      {file ? file.name : "Click to upload CSV"}
                    </h4>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : "Any column headers — you'll map them in the next step"}
                    </p>
                    <input
                      type="file"
                      accept=".csv"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      style={{ display: "none" }}
                    />
                  </div>

                  {error && (
                    <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#ef4444", fontSize: 13 }}>
                      {error}
                    </div>
                  )}

                  <div style={{ marginTop: 20, padding: "14px 16px", background: "var(--surface)", borderRadius: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                    Supports any CSV format — PEOPLElogy, Google Forms, Fluent Forms, manual exports, or any spreadsheet. You&apos;ll choose which column maps to which field on the next screen.
                  </div>
                </>
              )}

              {/* ── Step 2: Map Columns ── */}
              {step === "map" && (
                <>
                  {error && (
                    <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#ef4444", fontSize: 13 }}>
                      {error}
                    </div>
                  )}

                  {!hasRequiredMappings && (
                    <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 6, color: "#eab308", fontSize: 13 }}>
                      Name and Email must be mapped before you can import.
                    </div>
                  )}

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 10px 10px 0", color: "var(--muted)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", width: "32%" }}>CSV Column</th>
                        <th style={{ textAlign: "left", padding: "6px 10px 10px", color: "var(--muted)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", width: "28%" }}>Sample Value</th>
                        <th style={{ textAlign: "left", padding: "6px 0 10px 10px", color: "var(--muted)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", width: "40%" }}>Maps To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvHeaders.map((header) => {
                        const sample = csvPreview[0]?.[header] || "";
                        const isRequired = mapping[header] === "name" || mapping[header] === "email";
                        return (
                          <tr key={header} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 10px 10px 0", verticalAlign: "middle" }}>
                              <span style={{
                                display: "inline-block",
                                background: isRequired ? "rgba(61,155,245,0.12)" : "rgba(255,255,255,0.05)",
                                border: `1px solid ${isRequired ? "rgba(61,155,245,0.3)" : "var(--border)"}`,
                                borderRadius: 4,
                                padding: "2px 8px",
                                fontSize: 12,
                                color: isRequired ? "var(--accent)" : "var(--foreground)",
                                maxWidth: 180,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {header}
                              </span>
                            </td>
                            <td style={{ padding: "10px", verticalAlign: "middle", color: "var(--muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                              {sample || <span style={{ opacity: 0.4 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 0 10px 10px", verticalAlign: "middle" }}>
                              <select
                                value={mapping[header] || "ignore"}
                                onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value as TargetField }))}
                                style={{
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  color: "var(--foreground)",
                                  fontSize: 13,
                                  padding: "5px 8px",
                                  width: "100%",
                                  cursor: "pointer",
                                  outline: "none",
                                }}
                              >
                                {(Object.entries(TARGET_LABELS) as [TargetField, string][]).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--muted)" }}>
                    Duplicate guests are detected by email — existing entries will be skipped.
                  </p>
                </>
              )}

              {/* ── Step 3: Result ── */}
              {step === "result" && result && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "rgba(34,197,94,0.1)", color: "#22c55e", marginBottom: 16 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>Import Complete</h3>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                    <strong style={{ color: "#22c55e" }}>{result.added}</strong> new RSVPs added.<br />
                    {result.updated > 0 && <><strong style={{ color: "var(--accent)" }}>{result.updated}</strong> existing records updated with new fields.<br /></>}
                    {result.skipped > 0 && <><strong style={{ color: "#ef4444" }}>{result.skipped}</strong> rows skipped (no email).</>}
                  </p>
                  <p style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
                    Confirmation emails have been sent to the newly added guests.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
              {step === "upload" && (
                <>
                  <button
                    onClick={onClose}
                    style={{ background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!file || isParsing}
                    style={{
                      background: "var(--accent)", color: "#000",
                      border: "none", borderRadius: 8,
                      padding: "8px 18px", fontSize: 13, fontWeight: 600,
                      cursor: !file || isParsing ? "not-allowed" : "pointer",
                      opacity: !file || isParsing ? 0.5 : 1,
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {isParsing ? (
                      <>
                        <span style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#000", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                        Reading...
                      </>
                    ) : "Next: Map Columns →"}
                  </button>
                </>
              )}

              {step === "map" && (
                <>
                  <button
                    onClick={() => { setStep("upload"); setError(null); }}
                    disabled={isImporting}
                    style={{ background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: isImporting ? 0.5 : 1 }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!hasRequiredMappings || isImporting}
                    style={{
                      background: "var(--accent)", color: "#000",
                      border: "none", borderRadius: 8,
                      padding: "8px 18px", fontSize: 13, fontWeight: 600,
                      cursor: !hasRequiredMappings || isImporting ? "not-allowed" : "pointer",
                      opacity: !hasRequiredMappings || isImporting ? 0.5 : 1,
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {isImporting ? (
                      <>
                        <span style={{ width: 14, height: 14, border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#000", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                        Importing...
                      </>
                    ) : "Import"}
                  </button>
                </>
              )}

              {step === "result" && (
                <button
                  onClick={onClose}
                  style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Done
                </button>
              )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
