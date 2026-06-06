import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useCreateEnquiry } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";

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
  useAuth(); // keep session state warm
  const loginToPortal = () => {
    window.location.href = `/api/login?returnTo=/properties`;
  };

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

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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

  // ── Step 4: Journey begun — full-page experience ───────────────────────────
  if (step === 4) {
    return (
      <div style={{ minHeight: "100vh", background: "#fcf9f2", fontFamily: "'Fraunces', Georgia, serif", color: "#1a1c18" }}>
        <style dangerouslySetInnerHTML={{ __html: `
          @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
          .mono { font-family: 'IBM Plex Mono', monospace; }
          @keyframes fade-up { 0%{opacity:0;transform:translateY(16px)}100%{opacity:1;transform:translateY(0)} }
          .fade-up { animation: fade-up 0.7s ease-out forwards; }
          .fade-up-2 { animation: fade-up 0.7s 0.15s ease-out both; }
          .fade-up-3 { animation: fade-up 0.7s 0.3s ease-out both; }
        `}} />

        {/* Header */}
        <header style={{ padding: "24px 40px", borderBottom: "1px solid rgba(44,53,37,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "#1a1c18", textDecoration: "none" }}>Pattern</Link>
          <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#4a5d3f" }}>Your Design Journey</span>
        </header>

        {/* Hero */}
        <section style={{ maxWidth: 700, margin: "0 auto", padding: "88px 32px 72px", textAlign: "center" }}>
          <div className="fade-up">
            <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "#4a5d3f", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
              <span style={{ width: 18, height: 18, background: "#4a5d3f", color: "#fcf9f2", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>✓</span>
              Enquiry received
            </span>
          </div>
          <h1 className="fade-up-2" style={{ fontSize: "clamp(3rem,8vw,5.5rem)", fontWeight: 300, lineHeight: 1.0, letterSpacing: "-0.03em", marginBottom: 32 }}>
            Your journey<br /><em style={{ color: "#4a5d3f" }}>has begun.</em>
          </h1>
          <p className="fade-up-3" style={{ fontSize: 18, color: "rgba(44,53,37,0.75)", lineHeight: 1.8, marginBottom: 12 }}>
            One of our Pattern designers is now looking at<br />
            <strong style={{ color: "#2c3525" }}>{name.split(" ")[0] ? `${name.split(" ")[0]}'s` : "your"} land at {address}</strong>.
          </p>
          <p className="fade-up-3" style={{ fontSize: 14, color: "rgba(44,53,37,0.5)", lineHeight: 1.6 }}>
            We'll be in touch at <strong style={{ color: "#2c3525" }}>{email}</strong>
          </p>
        </section>

        {/* What you're getting */}
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "0 32px 80px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(44,53,37,0.4)" }}>
              Here's what we're building for you
            </span>
          </div>

          {/* Phase I — FREE / unlocked */}
          <div style={{ border: "1px solid rgba(44,53,37,0.2)", background: "#fffdf9", borderBottom: "none" }}>
            <div style={{ display: "grid", gridTemplateColumns: "240px 1fr" }}>
              <div style={{ borderRight: "1px solid rgba(44,53,37,0.12)", padding: "36px 32px", background: "#f0ede4", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#4a5d3f" }}>Phase I</span>
                  <h3 style={{ fontSize: 22, fontWeight: 300, marginTop: 8, marginBottom: 0 }}>Discovery</h3>
                </div>
                <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 20, height: 20, background: "#4a5d3f", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fcf9f2", fontSize: 11, flexShrink: 0 }}>✓</span>
                  <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f" }}>Active now · Free</span>
                </div>
              </div>
              <div style={{ padding: "36px 40px" }}>
                <p style={{ fontSize: 18, fontStyle: "italic", fontWeight: 300, color: "#2c3525", marginBottom: 12 }}>Your project takes root.</p>
                <p style={{ fontSize: 14, color: "rgba(44,53,37,0.65)", lineHeight: 1.8, marginBottom: 20 }}>
                  Your property is now live in the Pattern studio. Your designer can see your goals, your {reviewThumbs.length > 0 ? `${reviewThumbs.length}-image vision board, your` : ""} brief, and the story of what you want this land to become.
                </p>
                <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#4a5d3f", borderTop: "1px solid rgba(44,53,37,0.1)", paddingTop: 16, display: "block" }}>
                  Your site is active in the Pattern studio ·  No action needed
                </span>
              </div>
            </div>
          </div>

          {/* Phase II — locked, blurred bg */}
          <LockedPhase
            phase="II" name="Site Reading" tagline="We read every inch of your land."
            isNext
            gradient="linear-gradient(135deg, #1a2e1a 0%, #2c4a1e 50%, #1a3020 100%)"
            description="Terrain elevation mapped from satellite data. Solar and wind sectors calculated for your exact location. Annual water budget modelled for your rainfall. Soil type assessed. Climate zone confirmed. A complete technical portrait of what your land can do — and what it's been waiting for."
            onLogin={loginToPortal}
          />

          {/* Phase III — locked */}
          <LockedPhase
            phase="III" name="The Design" tagline="Your master permaculture plan, revealed."
            gradient="linear-gradient(135deg, #1c2818 0%, #243620 60%, #1a2c18 100%)"
            description="Zone layout with spatial diagrams. A layered forest garden design from canopy to ground cover. Water harvesting and storage systems sized for your rainfall. Plant guilds hand-selected for your climate, soil, and goals. The complete blueprint — every element, every relationship, every reason."
            onLogin={loginToPortal}
          />

          {/* Phase IV — locked */}
          <LockedPhase
            phase="IV" name="Full Dossier" tagline="The complete picture."
            gradient="linear-gradient(135deg, #141e14 0%, #1e2e18 60%, #131c12 100%)"
            description="A fully illustrated design report ready to print. A phased implementation guide — what to plant in year one, year three, year ten. A curated plant supplier list for your region. 3D concept visualisations. A shareable presentation for your family, council, or investors. Everything, beautifully bound."
            isLast
            onLogin={loginToPortal}
          />
        </section>

        {/* Account setup CTA — dark forest */}
        <section style={{ background: "#2c3525", padding: "80px 32px", textAlign: "center" }}>
          <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(252,249,242,0.45)", display: "block", marginBottom: 24 }}>
            Create your client portal
          </span>
          <h2 style={{ fontSize: "clamp(2rem,5vw,3.2rem)", fontWeight: 300, color: "#fcf9f2", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 20 }}>
            Watch your design<br /><em style={{ color: "#8aab6a" }}>come to life.</em>
          </h2>
          <p style={{ fontSize: 16, color: "rgba(252,249,242,0.65)", lineHeight: 1.8, maxWidth: 480, margin: "0 auto 40px" }}>
            Complete your account setup to unlock your client portal — track every phase of your design as it's built, receive your site analysis, and access your final plan when it's ready.
          </p>
          <button
            onClick={loginToPortal}
            style={{ background: "#fcf9f2", color: "#2c3525", padding: "20px 52px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", letterSpacing: "0.16em", border: "none", cursor: "pointer", marginBottom: 20, fontWeight: 500 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f0ede4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fcf9f2"; }}
          >
            Complete my account setup
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
            {["Free to start", "Takes 30 seconds", "No card needed"].map((t) => (
              <span key={t} className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(252,249,242,0.35)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 3, height: 3, background: "rgba(252,249,242,0.35)", borderRadius: "50%", display: "inline-block" }} />
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: "#1a1c18", padding: "28px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(252,249,242,0.3)" }}>Pattern Studio</span>
          <Link href="/enquire" className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(252,249,242,0.3)", textDecoration: "none" }}>Start a new enquiry</Link>
        </footer>
      </div>
    );
  }

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
        @keyframes cultivate-dot { 0%,80%,100%{opacity:0.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)} }
        .cdot { display:inline-block; animation:cultivate-dot 1.4s ease-in-out infinite; }
        .cdot:nth-child(2){animation-delay:0.2s} .cdot:nth-child(3){animation-delay:0.4s}
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
        {step < 4 && <ProgressRail step={Math.min(step, 3)} onStepClick={(s) => setStep(s)} />}

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
              <Field label="Your dream for the land (optional)"><textarea className="pa-input" rows={4} spellCheck={true} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you imagine when you picture this place thriving?" /></Field>
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
              <ReviewRow label="Name" value={name} valueStyle={{ textTransform: "capitalize" }} />
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
                      <img
                        key={i}
                        src={t.src}
                        alt={t.label}
                        title="Click to preview"
                        onClick={() => setLightboxSrc(t.src)}
                        style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", cursor: "zoom-in", transition: "opacity 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      />
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
                {createEnquiry.isPending ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Cultivating your profile
                    <span><span className="cdot">.</span><span className="cdot">.</span><span className="cdot">.</span></span>
                  </span>
                ) : "Send my enquiry"}
              </PrimaryBtn>
            </div>
          </section>
        )}

        {/* step 4 handled by early-return above */}
      </main>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(26,28,24,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
            animation: "pop-in 0.2s ease-out",
          }}
        >
          <img
            src={lightboxSrc}
            alt="Vision board preview"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "88vw", maxHeight: "88vh",
              objectFit: "contain",
              boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
              cursor: "default",
            }}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            aria-label="Close preview"
            style={{
              position: "absolute", top: 20, right: 24,
              background: "none", border: "1px solid rgba(252,249,242,0.3)",
              color: "#fcf9f2", width: 36, height: 36,
              fontSize: 20, lineHeight: 1, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LockedPhase({
  phase, name, tagline, description, gradient, isNext = false, isLast = false, onLogin,
}: {
  phase: string; name: string; tagline: string; description: string;
  gradient: string; isNext?: boolean; isLast?: boolean; onLogin: () => void;
}) {
  return (
    <div style={{ position: "relative", overflow: "hidden", minHeight: 220, border: "1px solid rgba(44,53,37,0.2)", borderTop: "none", ...(isLast ? {} : { borderBottom: "none" }) }}>
      <div style={{ position: "absolute", inset: 0, background: gradient }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "40px 48px", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(252,249,242,0.45)", display: "block", marginBottom: 12 }}>
            Phase {phase}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(252,249,242,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(252,249,242,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 style={{ fontSize: 24, fontWeight: 300, color: "#fcf9f2", margin: 0 }}>{name}</h3>
          </div>
          <p style={{ fontSize: 16, fontStyle: "italic", color: "rgba(252,249,242,0.7)", marginBottom: 12 }}>{tagline}</p>
          <p style={{ fontSize: 13, color: "rgba(252,249,242,0.45)", lineHeight: 1.8, maxWidth: 480 }}>{description}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          {isNext && (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(252,249,242,0.35)" }}>
              Next to unlock
            </span>
          )}
          <button
            onClick={onLogin}
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", border: "1px solid rgba(252,249,242,0.2)", color: "rgba(252,249,242,0.5)", padding: "12px 24px", background: "transparent", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(252,249,242,0.5)"; e.currentTarget.style.color = "rgba(252,249,242,0.85)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(252,249,242,0.2)"; e.currentTarget.style.color = "rgba(252,249,242,0.5)"; }}
          >
            Create portal to unlock →
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressRail({ step, onStepClick }: { step: number; onStepClick?: (s: number) => void }) {
  const labels = ["Basics", "Survey", "Vision", "Review"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 48 }}>
      {labels.map((label, i) => {
        const clickable = i < step && !!onStepClick;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < labels.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                onClick={() => clickable && onStepClick(i)}
                style={{
                  width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid #2c3525",
                  background: i <= step ? "#2c3525" : "transparent",
                  color: i <= step ? "#fcf9f2" : "#4a5d3f",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                  cursor: clickable ? "pointer" : "default",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { if (clickable) e.currentTarget.style.opacity = "0.75"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >{i + 1}</div>
              <span
                onClick={() => clickable && onStepClick(i)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                  textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f",
                  cursor: clickable ? "pointer" : "default",
                }}
                className="hidden sm:inline"
              >{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? "#2c3525" : "rgba(44,53,37,0.2)", margin: "0 8px" }} />
            )}
          </div>
        );
      })}
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

function ReviewRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(44,53,37,0.08)" }}>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a5d3f", minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 15, color: "#1a1c18", lineHeight: 1.5, ...valueStyle }}>{value}</span>
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
