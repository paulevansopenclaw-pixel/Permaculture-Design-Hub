import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useCreateEnquiry } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOTAL_SLOTS = 6;
const MAX_UPLOAD = 10;

const GOAL_OPTIONS = [
  "Grow our own food",
  "Restore the land & wildlife",
  "Capture & store water",
  "A beautiful place to relax",
  "Income from the property",
  "Not sure yet — help me decide",
];

const MAINTENANCE_OPTIONS = [
  "A few hours a month",
  "A weekend project pace",
  "Most weekends",
  "It's my full-time focus",
];

// ── Types ────────────────────────────────────────────────────────────────────
type VisionImg = { url: string; thumb: string; photographer: string; alt: string; query: string };
type UploadState = "uploading" | "done" | "error";
type UploadedFile = {
  id: string;
  file: File;
  preview: string;
  objectPath: string | null;
  status: UploadState;
};
type VisionMode = null | "upload" | "ai";

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2);
}

async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${BASE}/api/public/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("Upload URL request failed");
  return res.json() as Promise<{ uploadURL: string; objectPath: string }>;
}

async function uploadToGCS(uploadURL: string, file: File): Promise<void> {
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("GCS upload failed");
}

// ── Main component ───────────────────────────────────────────────────────────
export default function EnquirePage() {
  const createEnquiry = useCreateEnquiry();

  const [step, setStep] = useState(0); // 0 basics · 1 survey · 2 vision · 3 review · 4 done

  // Basics
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [roughSize, setRoughSize] = useState("");
  const [message, setMessage] = useState("");

  // Survey
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [maintenanceCapacity, setMaintenanceCapacity] = useState("");
  const [householdSize, setHouseholdSize] = useState("");

  // Vision
  const [visionMode, setVisionMode] = useState<VisionMode>(null);

  // Upload path
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI path — batch state + accumulated picks
  const [currentBatch, setCurrentBatch] = useState<VisionImg[]>([]);
  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set());
  const [savedImages, setSavedImages] = useState<VisionImg[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);
  const batchCountRef = useRef(0);
  const pageRef = useRef(1);

  // Submit
  const [submitError, setSubmitError] = useState<string | null>(null);

  const contactValid =
    name.trim().length > 0 &&
    /.+@.+\..+/.test(email.trim()) &&
    address.trim().length > 0;

  // ── Fetch a new Pexels batch ───────────────────────────────────────────────
  const streamBatch = useCallback(() => {
    setCurrentBatch([]);
    setBatchSelected(new Set());
    setGenerating(true);
    setGenError(null);
    abortRef.current = false;
    batchCountRef.current += 1;
    pageRef.current += 1;

    (async () => {
      try {
        const res = await fetch(`${BASE}/api/public/vision-images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryGoal: primaryGoal || null,
            maintenanceCapacity: maintenanceCapacity || null,
            householdSize: householdSize ? Number(householdSize) : null,
            page: pageRef.current,
          }),
        });
        if (!res.ok) {
          if (!abortRef.current) {
            setGenError("Couldn't reach the image service. You can still send your enquiry.");
            setGenerating(false);
          }
          return;
        }
        const data = await res.json() as { images: VisionImg[] };
        if (!abortRef.current) {
          setCurrentBatch(data.images ?? []);
          setGenerating(false);
        }
      } catch {
        if (!abortRef.current) {
          setGenError("Couldn't load ideas right now. You can still send your enquiry.");
          setGenerating(false);
        }
      }
    })();
  }, [primaryGoal, maintenanceCapacity, householdSize]);

  // Auto-start first batch when entering AI path
  useEffect(() => {
    if (visionMode === "ai") streamBatch();
    return () => { abortRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionMode]);

  // Save current picks + stream a fresh batch
  function loadMoreIdeas() {
    const newSaved = currentBatch.filter((_, i) => batchSelected.has(i));
    setSavedImages((prev) => [...prev, ...newSaved]);
    streamBatch();
  }

  // Keep picks + move to review
  function donePickingAI() {
    const newSaved = currentBatch.filter((_, i) => batchSelected.has(i));
    setSavedImages((prev) => [...prev, ...newSaved]);
    abortRef.current = true;
    setStep(3);
  }

  // ── File upload handlers ───────────────────────────────────────────────────
  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).slice(0, MAX_UPLOAD - uploadedFiles.length);
    if (!arr.length) return;

    const newEntries: UploadedFile[] = arr.map((f) => ({
      id: uid(),
      file: f,
      preview: URL.createObjectURL(f),
      objectPath: null,
      status: "uploading" as UploadState,
    }));
    setUploadedFiles((prev) => [...prev, ...newEntries]);

    await Promise.all(
      newEntries.map(async (entry) => {
        try {
          const { uploadURL, objectPath } = await requestUploadUrl(entry.file);
          await uploadToGCS(uploadURL, entry.file);
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id ? { ...f, objectPath, status: "done" } : f,
            ),
          );
        } catch {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id ? { ...f, status: "error" } : f,
            ),
          );
        }
      }),
    );
  }

  function removeUpload(id: string) {
    setUploadedFiles((prev) => {
      const entry = prev.find((f) => f.id === id);
      if (entry) URL.revokeObjectURL(entry.preview);
      return prev.filter((f) => f.id !== id);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitError(null);
    const moodBoardImages = uploadedFiles
      .filter((f) => f.status === "done" && f.objectPath)
      .map((f) => f.objectPath as string);
    const ideaImagesBase64 = savedImages.map((img) => img.url);
    try {
      await createEnquiry.mutateAsync({
        data: {
          name: name.trim(),
          email: email.trim(),
          address: address.trim(),
          roughSize: roughSize.trim() || null,
          message: message.trim() || null,
          primaryGoal: primaryGoal || null,
          maintenanceCapacity: maintenanceCapacity || null,
          householdSize: householdSize ? Number(householdSize) : null,
          ideaPhotos: moodBoardImages.length ? moodBoardImages : undefined,
          ideaImagesBase64: ideaImagesBase64.length ? ideaImagesBase64 : undefined,
        },
      });
      setStep(4);
    } catch {
      setSubmitError("We couldn't submit your enquiry. Please try again in a moment.");
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const shimmers = generating ? Math.max(0, TOTAL_SLOTS - currentBatch.length) : 0;
  const totalSaved = savedImages.length;
  const canProceedAI = totalSaved > 0 || batchSelected.size > 0;
  const canProceedUpload = uploadedFiles.some((f) => f.status === "done");

  // ── Review thumbnail list ──────────────────────────────────────────────────
  const reviewThumbs: { src: string; label: string }[] =
    visionMode === "upload"
      ? uploadedFiles
          .filter((f) => f.status === "done")
          .map((f, i) => ({ src: f.preview, label: `Photo ${i + 1}` }))
      : savedImages.map((img, i) => ({
          src: img.thumb,
          label: `Idea ${i + 1}`,
        }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen text-[#1a1c18] antialiased"
      style={{ background: "#fcf9f2", fontFamily: "'Fraunces', Georgia, serif" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .pa-input { width:100%; box-sizing:border-box; background:#fffdf9; border:1px solid #2c3525; padding:14px 16px; font-size:16px; color:#1a1c18; outline:none; font-family:'Fraunces',Georgia,serif; border-radius:0; }
        .pa-input::placeholder { color:#9a9484; }
        .pa-input:focus { border-color:#4a5d3f; box-shadow:0 0 0 1px #4a5d3f; }
        .pa-label { display:block; font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:#4a5d3f; margin-bottom:8px; }
        @keyframes shimmer { 0%{background-position:200% 0}100%{background-position:-200% 0} }
        .shimmer { background:linear-gradient(90deg,#e8e4da 25%,#f0ece2 50%,#e8e4da 75%);background-size:200% 100%;animation:shimmer 1.6s ease-in-out infinite; }
        @keyframes pop-in { 0%{opacity:0;transform:scale(0.93)}100%{opacity:1;transform:scale(1)} }
        .pop-in { animation:pop-in 0.3s ease-out forwards; }
      `}} />

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(44,53,37,0.15)" }}
        className="px-6 py-6 flex justify-between items-center max-w-5xl mx-auto">
        <Link href="/" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Pattern</Link>
        <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#4a5d3f" }}>
          Client Enquiry
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        {step < 4 && <ProgressRail step={Math.min(step, 3)} />}

        {/* ── 0: Basics ──────────────────────────────────────────────────── */}
        {step === 0 && (
          <section>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Let's start with <em style={{ color: "#4a5d3f" }}>the basics.</em>
            </h1>
            <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 40, lineHeight: 1.7 }}>
              Tell us who you are and where your land is. This is all we need to begin.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <Field label="Your name"><input className="pa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Appleseed" /></Field>
              <Field label="Email"><input className="pa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" /></Field>
              <Field label="Property address"><input className="pa-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Ridgeline Rd, Bellingen NSW" /></Field>
              <Field label="Rough size (optional)"><input className="pa-input" value={roughSize} onChange={(e) => setRoughSize(e.target.value)} placeholder="e.g. 5 acres, half a hectare, a suburban block" /></Field>
              <Field label="Your dream for the land (optional)"><textarea className="pa-input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you imagine when you picture this place thriving?" /></Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 40 }}>
              <PrimaryBtn disabled={!contactValid} onClick={() => setStep(1)}>Continue</PrimaryBtn>
            </div>
          </section>
        )}

        {/* ── 1: Survey ──────────────────────────────────────────────────── */}
        {step === 1 && (
          <section>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 16 }}>
              A few <em style={{ color: "#4a5d3f" }}>friendly questions.</em>
            </h1>
            <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 40, lineHeight: 1.7 }}>
              No technical knowledge needed — we'll work out the soil, rainfall, and climate details from your address.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
              <div>
                <span className="pa-label">What matters most to you?</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {GOAL_OPTIONS.map((opt) => (
                    <ChoiceChip key={opt} selected={primaryGoal === opt} onClick={() => setPrimaryGoal(opt)}>{opt}</ChoiceChip>
                  ))}
                </div>
              </div>
              <div>
                <span className="pa-label">How much time can you give it?</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {MAINTENANCE_OPTIONS.map((opt) => (
                    <ChoiceChip key={opt} selected={maintenanceCapacity === opt} onClick={() => setMaintenanceCapacity(opt)}>{opt}</ChoiceChip>
                  ))}
                </div>
              </div>
              <Field label="How many people live here? (optional)">
                <input className="pa-input" type="number" min={0} value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} placeholder="e.g. 4" />
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
              <GhostBtn onClick={() => setStep(0)}>Back</GhostBtn>
              <PrimaryBtn onClick={() => setStep(2)}>Continue</PrimaryBtn>
            </div>
          </section>
        )}

        {/* ── 2: Vision ──────────────────────────────────────────────────── */}
        {step === 2 && (
          <section>
            {/* Choice screen */}
            {visionMode === null && (
              <>
                <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 16 }}>
                  Build your <em style={{ color: "#4a5d3f" }}>vision board.</em>
                </h1>
                <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 40, lineHeight: 1.7 }}>
                  Help your designer understand your aesthetic. You can upload your own inspiration photos or let us generate ideas tailored to your goals.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
                  <VisionChoiceCard
                    icon="📁"
                    title="Upload my own"
                    desc="Photos from Pinterest, magazines, or your camera roll — anything that captures the feeling you're after."
                    onClick={() => setVisionMode("upload")}
                  />
                  <VisionChoiceCard
                    icon="✨"
                    title="Help me find ideas"
                    desc="We'll generate AI imagery tuned to your goals. Pick your favourites, then load more until you're happy."
                    onClick={() => setVisionMode("ai")}
                  />
                </div>
                <p style={{ textAlign: "center", color: "rgba(44,53,37,0.5)", fontSize: 13, marginBottom: 32 }}>
                  You can also skip this step and send your enquiry without images.
                </p>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <GhostBtn onClick={() => setStep(1)}>Back</GhostBtn>
                  <GhostBtn onClick={() => setStep(3)}>Skip to review →</GhostBtn>
                </div>
              </>
            )}

            {/* Upload path */}
            {visionMode === "upload" && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <h1 style={{ fontSize: "clamp(1.6rem,4vw,2.4rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                    Upload your <em style={{ color: "#4a5d3f" }}>inspiration.</em>
                  </h1>
                  <button onClick={() => { setUploadedFiles([]); setVisionMode(null); }}
                    className="mono" style={{ fontSize: 11, color: "#4a5d3f", textTransform: "uppercase", letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer" }}>
                    ← Change
                  </button>
                </div>
                <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 24, lineHeight: 1.7 }}>
                  Up to {MAX_UPLOAD} images. These become part of your client profile and will guide your designer.
                </p>

                {/* Drop zone */}
                {uploadedFiles.length < MAX_UPLOAD && (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed rgba(44,53,37,0.3)",
                      padding: "48px 24px",
                      textAlign: "center",
                      cursor: "pointer",
                      marginBottom: 20,
                      transition: "border-color 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4a5d3f")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(44,53,37,0.3)")}
                  >
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📷</div>
                    <div className="mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f", marginBottom: 6 }}>
                      Drop photos here or click to browse
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(44,53,37,0.5)" }}>
                      JPEG · PNG · WebP · HEIC · max 15 MB each
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />

                {/* Thumbnails */}
                {uploadedFiles.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
                    {uploadedFiles.map((f) => (
                      <div key={f.id} className="pop-in" style={{ position: "relative", aspectRatio: "1/1" }}>
                        <img src={f.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        {f.status === "uploading" && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(252,249,242,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="mono" style={{ fontSize: 10, color: "#4a5d3f" }}>Uploading…</span>
                          </div>
                        )}
                        {f.status === "error" && (
                          <div style={{ position: "absolute", inset: 0, background: "rgba(200,50,50,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="mono" style={{ fontSize: 10, color: "#b00" }}>Failed</span>
                          </div>
                        )}
                        {f.status === "done" && (
                          <div className="mono" style={{ position: "absolute", top: 4, right: 4, background: "#2c3525", color: "#fcf9f2", fontSize: 10, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                        )}
                        <button
                          onClick={() => removeUpload(f.id)}
                          style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", width: 20, height: 20, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <GhostBtn onClick={() => { setUploadedFiles([]); setVisionMode(null); }}>Back</GhostBtn>
                  <PrimaryBtn disabled={!canProceedUpload} onClick={() => setStep(3)}>
                    Review & send
                  </PrimaryBtn>
                </div>
              </>
            )}

            {/* AI path */}
            {visionMode === "ai" && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <h1 style={{ fontSize: "clamp(1.6rem,4vw,2.4rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                    {generating && currentBatch.length === 0
                      ? <>Crafting your <em style={{ color: "#4a5d3f" }}>ideas…</em></>
                      : <>Your <em style={{ color: "#4a5d3f" }}>vision board.</em></>}
                  </h1>
                  <button onClick={() => { abortRef.current = true; setSavedImages([]); setCurrentBatch([]); setBatchSelected(new Set()); setVisionMode(null); }}
                    className="mono" style={{ fontSize: 11, color: "#4a5d3f", textTransform: "uppercase", letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer" }}>
                    ← Change
                  </button>
                </div>

                {/* Saved picks strip */}
                {totalSaved > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f", display: "block", marginBottom: 8 }}>
                      {totalSaved} saved so far — these will be in your profile
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {savedImages.map((img, i) => (
                        <div key={i} style={{ width: 56, height: 56, position: "relative", flexShrink: 0 }}>
                          <img src={img.thumb} alt={img.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button
                            onClick={() => setSavedImages((prev) => prev.filter((_, j) => j !== i))}
                            style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", width: 16, height: 16, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 16, lineHeight: 1.6, fontSize: 15 }}>
                  {generating && currentBatch.length === 0
                    ? "First images arriving in a few seconds…"
                    : generating
                    ? `${currentBatch.length} of ${TOTAL_SLOTS} loaded — tap any that speak to you.`
                    : genError
                    ? genError
                    : batchCountRef.current > 1
                    ? "Tap to pick, then save & load another batch or continue."
                    : "Tap images that feel right, then save your picks or load a fresh batch."}
                </p>

                {/* Current batch grid */}
                {(currentBatch.length > 0 || generating) && !genError && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
                    {currentBatch.map((img, i) => {
                      const isSel = batchSelected.has(i);
                      return (
                        <button
                          key={`b${batchCountRef.current}-${i}`}
                          onClick={() => setBatchSelected((prev) => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })}
                          className="pop-in"
                          style={{ position: "relative", aspectRatio: "3/2", display: "block", background: "none", padding: 0, cursor: "pointer", border: "none" }}
                          aria-pressed={isSel}
                        >
                          <img
                            src={img.thumb}
                            alt={img.alt}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: isSel ? "none" : "brightness(0.85)" }}
                          />
                          <div style={{
                            position: "absolute", inset: 0,
                            border: isSel ? "3px solid #2c3525" : "3px solid transparent",
                            background: isSel ? "rgba(44,53,37,0.08)" : "transparent",
                            transition: "all 0.18s",
                          }} />
                          {isSel && (
                            <div className="mono" style={{ position: "absolute", top: 8, right: 8, background: "#2c3525", color: "#fcf9f2", fontSize: 10, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                          )}
                        </button>
                      );
                    })}
                    {Array.from({ length: shimmers }).map((_, i) => (
                      <div key={`s${i}`} className="shimmer" style={{ aspectRatio: "3/2" }} />
                    ))}
                  </div>
                )}

                {/* Action bar */}
                {!generating && !genError && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                    <button
                      onClick={loadMoreIdeas}
                      className="mono"
                      style={{ flex: 1, padding: "14px 20px", border: "1px solid #2c3525", background: "transparent", color: "#2c3525", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer" }}
                    >
                      {batchSelected.size > 0 ? `Save ${batchSelected.size} pick${batchSelected.size > 1 ? "s" : ""} & load more` : "Load a fresh batch"}
                    </button>
                    <PrimaryBtn disabled={!canProceedAI} onClick={donePickingAI}>
                      {totalSaved + batchSelected.size > 0 ? `Continue with ${totalSaved + batchSelected.size} image${totalSaved + batchSelected.size > 1 ? "s" : ""}` : "Continue without images"}
                    </PrimaryBtn>
                  </div>
                )}

                {generating && currentBatch.length > 0 && (
                  <div className="mono" style={{ fontSize: 11, color: "#4a5d3f", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                    Loading {currentBatch.length}/{TOTAL_SLOTS}…
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 12 }}>
                  <GhostBtn onClick={() => { abortRef.current = true; setSavedImages([]); setCurrentBatch([]); setBatchSelected(new Set()); setVisionMode(null); }}>Back</GhostBtn>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── 3: Review ──────────────────────────────────────────────────── */}
        {step === 3 && (
          <section>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 16 }}>
              Review your <em style={{ color: "#4a5d3f" }}>enquiry.</em>
            </h1>
            <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 32, lineHeight: 1.7 }}>
              Everything looks good? Hit send and your designer will be in touch.
            </p>

            {/* Summary card */}
            <div style={{ border: "1px solid rgba(44,53,37,0.2)", padding: "28px 28px 24px", marginBottom: 32, background: "#fffdf9" }}>
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Email" value={email} />
              <ReviewRow label="Property" value={address + (roughSize ? ` · ${roughSize}` : "")} />
              {primaryGoal && <ReviewRow label="Primary goal" value={primaryGoal} />}
              {maintenanceCapacity && <ReviewRow label="Time available" value={maintenanceCapacity} />}
              {householdSize && <ReviewRow label="Household" value={`${householdSize} people`} />}
              {message && <ReviewRow label="Notes" value={message} />}

              {/* Image thumbnails */}
              {reviewThumbs.length > 0 && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(44,53,37,0.1)" }}>
                  <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f", display: "block", marginBottom: 12 }}>
                    Vision board · {reviewThumbs.length} image{reviewThumbs.length > 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                    {reviewThumbs.map((t, i) => (
                      <img key={i} src={t.src} alt={t.label} style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(44,53,37,0.55)", marginTop: 10, lineHeight: 1.5 }}>
                    These images will appear in your client profile and may be used as background artwork in your final design report.
                  </p>
                </div>
              )}
            </div>

            {submitError && (
              <div style={{ marginBottom: 20, padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", fontSize: 14 }}>
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <GhostBtn onClick={() => setStep(2)}>Edit</GhostBtn>
              <PrimaryBtn disabled={createEnquiry.isPending} onClick={handleSubmit}>
                {createEnquiry.isPending ? "Sending…" : "Send my enquiry"}
              </PrimaryBtn>
            </div>
          </section>
        )}

        {/* ── 4: Done ────────────────────────────────────────────────────── */}
        {step === 4 && (
          <section style={{ textAlign: "center", paddingTop: 48 }}>
            <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#4a5d3f", display: "block", marginBottom: 24 }}>Enquiry received</span>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 300, lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 24 }}>
              Thank you, <em style={{ color: "#4a5d3f" }}>{name.split(" ")[0] || "friend"}.</em>
            </h1>
            <p style={{ color: "rgba(44,53,37,0.75)", marginBottom: 16, lineHeight: 1.7, maxWidth: 400, margin: "0 auto 16px" }}>
              Your land is now on our studio board. A designer will study <strong>{address || "your property"}</strong> and reach out to <strong>{email}</strong> to begin.
            </p>
            {reviewThumbs.length > 0 && (
              <p style={{ color: "rgba(44,53,37,0.55)", fontSize: 13, maxWidth: 380, margin: "0 auto 40px", lineHeight: 1.6 }}>
                Your {reviewThumbs.length} vision image{reviewThumbs.length > 1 ? "s" : ""} {reviewThumbs.length > 1 ? "have" : "has"} been saved to your profile and will inspire your final design.
              </p>
            )}
            <div style={{ marginTop: 40 }}>
              <Link href="/" className="mono" style={{ background: "#2c3525", color: "#fcf9f2", padding: "16px 32px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", display: "inline-block", textDecoration: "none" }}>
                Back to home
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressRail({ step }: { step: number }) {
  const labels = ["Basics", "Survey", "Vision", "Review"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 48 }}>
      {labels.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid #2c3525",
              background: i <= step ? "#2c3525" : "transparent",
              color: i <= step ? "#fcf9f2" : "#4a5d3f",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
            }}>{i + 1}</div>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f" }}
              className="hidden sm:inline">{label}</span>
          </div>
          {i < labels.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < step ? "#2c3525" : "rgba(44,53,37,0.2)", margin: "0 8px" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="pa-label">{label}</span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(44,53,37,0.08)" }}>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f", minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 15, color: "#1a1c18", lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

function VisionChoiceCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ textAlign: "left", padding: "24px 20px", border: "1px solid rgba(44,53,37,0.2)", background: "#fffdf9", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, transition: "border-color 0.2s, box-shadow 0.2s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4a5d3f"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(44,53,37,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(44,53,37,0.2)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <strong style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, fontWeight: 500, color: "#1a1c18", letterSpacing: "-0.01em" }}>{title}</strong>
      <span style={{ fontSize: 13, color: "rgba(44,53,37,0.65)", lineHeight: 1.6 }}>{desc}</span>
    </button>
  );
}

function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", padding: "12px 16px", border: "1px solid",
        borderColor: selected ? "#2c3525" : "rgba(44,53,37,0.25)",
        background: selected ? "#2c3525" : "#fffdf9",
        color: selected ? "#fcf9f2" : "#1a1c18",
        fontSize: 14, cursor: "pointer", transition: "all 0.15s",
        fontFamily: "'Fraunces', Georgia, serif",
      }}
    >{children}</button>
  );
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mono"
      style={{
        background: "#2c3525", color: "#fcf9f2",
        padding: "14px 28px", fontSize: 11,
        textTransform: "uppercase", letterSpacing: "0.12em",
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, transition: "background 0.15s, opacity 0.15s",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "#4a5d3f"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#2c3525"; }}
    >{children}</button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mono"
      style={{ background: "none", border: "none", color: "#4a5d3f", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer", padding: "14px 4px" }}
    >{children}</button>
  );
}
