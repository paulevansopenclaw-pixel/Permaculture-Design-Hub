import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useCreateEnquiry } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

const TOTAL_SLOTS = 6;

type VisionImg = { b64_json: string; mimeType: string; prompt: string };

export default function EnquirePage() {
  const createEnquiry = useCreateEnquiry();

  const [step, setStep] = useState(0); // 0 basics, 1 survey, 2 vision, 3 done

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

  // Vision board — images stream in one-by-one
  const [visionImages, setVisionImages] = useState<VisionImg[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const abortRef = useRef<boolean>(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const contactValid =
    name.trim().length > 0 &&
    /.+@.+\..+/.test(email.trim()) &&
    address.trim().length > 0;

  // Stream images via SSE when entering step 2
  useEffect(() => {
    if (step !== 2) return;
    setVisionImages([]);
    setSelected(new Set());
    setGenerating(true);
    setGenError(null);
    abortRef.current = false;

    (async () => {
      try {
        const res = await fetch(`${BASE}/api/public/vision-images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryGoal: primaryGoal || null,
            maintenanceCapacity: maintenanceCapacity || null,
            householdSize: householdSize ? Number(householdSize) : null,
          }),
        });

        if (!res.ok || !res.body) {
          if (!abortRef.current) {
            setGenError("Couldn't generate images right now. You can still send your enquiry.");
            setGenerating(false);
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!abortRef.current) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6)) as
                | { image: VisionImg }
                | { done: boolean };
              if ("image" in data) {
                setVisionImages((prev) => [...prev, data.image]);
              }
              if ("done" in data && data.done) {
                setGenerating(false);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } catch {
        if (!abortRef.current) {
          setGenError("Couldn't generate images right now. You can still send your enquiry.");
          setGenerating(false);
        }
      }
    })();

    return () => {
      abortRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitError(null);
    const ideaImagesBase64 = visionImages
      .filter((_, i) => selected.has(i))
      .map((img) => `data:${img.mimeType};base64,${img.b64_json}`);
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
          ideaImagesBase64: ideaImagesBase64.length ? ideaImagesBase64 : undefined,
        },
      });
      setStep(3);
    } catch {
      setSubmitError("We couldn't submit your enquiry. Please try again in a moment.");
    }
  }

  // Number of shimmer placeholders to show while generating
  const shimmers = generating ? Math.max(0, TOTAL_SLOTS - visionImages.length) : 0;

  return (
    <div className="min-h-screen bg-[#fcf9f2] text-[#1a1c18] font-serif antialiased selection:bg-[#4a5d3f] selection:text-[#fcf9f2]">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .font-serif { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .pa-input { width:100%; box-sizing:border-box; background:#fffdf9; border:1px solid #2c3525; border-radius:0; padding:14px 16px; font-size:16px; color:#1a1c18; outline:none; font-family:'Fraunces',serif; }
        .pa-input::placeholder { color:#9a9484; }
        .pa-input:focus { border-color:#4a5d3f; box-shadow:0 0 0 1px #4a5d3f; }
        .pa-label { display:block; font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:#4a5d3f; margin-bottom:8px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .shimmer { background:linear-gradient(90deg,#e8e4da 25%,#f0ece2 50%,#e8e4da 75%); background-size:200% 100%; animation:shimmer 1.6s ease-in-out infinite; }
        @keyframes pop-in { 0%{opacity:0;transform:scale(0.92)} 100%{opacity:1;transform:scale(1)} }
        .pop-in { animation:pop-in 0.35s ease-out forwards; }
      `}} />

      <header className="px-6 py-6 border-b border-[#2c3525]/15 flex justify-between items-center max-w-5xl mx-auto">
        <Link href="/" className="text-2xl font-semibold tracking-tight">Pattern</Link>
        <div className="font-mono text-xs uppercase tracking-widest text-[#4a5d3f]">Client Enquiry</div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        {step < 3 && <ProgressRail step={step} />}

        {/* ── Step 0: Basics ── */}
        {step === 0 && (
          <section>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-4">
              Let's start with <span className="italic text-[#4a5d3f]">the basics.</span>
            </h1>
            <p className="text-[#2c3525]/80 mb-10 leading-relaxed">
              Tell us who you are and where your land is. This is all we need to begin.
            </p>
            <div className="space-y-6">
              <Field label="Your name">
                <input className="pa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Appleseed" />
              </Field>
              <Field label="Email">
                <input className="pa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              </Field>
              <Field label="Property address">
                <input className="pa-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Ridgeline Rd, Bellingen NSW" />
              </Field>
              <Field label="Rough size (optional)">
                <input className="pa-input" value={roughSize} onChange={(e) => setRoughSize(e.target.value)} placeholder="e.g. 5 acres, half a hectare, a suburban block" />
              </Field>
              <Field label="Your dream for the land (optional)">
                <textarea className="pa-input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you imagine when you picture this place thriving?" />
              </Field>
            </div>
            <div className="flex justify-end mt-10">
              <PrimaryButton disabled={!contactValid} onClick={() => setStep(1)}>Continue</PrimaryButton>
            </div>
          </section>
        )}

        {/* ── Step 1: Survey ── */}
        {step === 1 && (
          <section>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-4">
              A few <span className="italic text-[#4a5d3f]">friendly questions.</span>
            </h1>
            <p className="text-[#2c3525]/80 mb-10 leading-relaxed">
              No technical knowledge needed — we'll work out the soil, rainfall, and climate details from your address.
            </p>
            <div className="space-y-10">
              <div>
                <span className="pa-label">What matters most to you?</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {GOAL_OPTIONS.map((opt) => (
                    <ChoiceChip key={opt} selected={primaryGoal === opt} onClick={() => setPrimaryGoal(opt)}>{opt}</ChoiceChip>
                  ))}
                </div>
              </div>
              <div>
                <span className="pa-label">How much time can you give it?</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MAINTENANCE_OPTIONS.map((opt) => (
                    <ChoiceChip key={opt} selected={maintenanceCapacity === opt} onClick={() => setMaintenanceCapacity(opt)}>{opt}</ChoiceChip>
                  ))}
                </div>
              </div>
              <Field label="How many people live here? (optional)">
                <input className="pa-input" type="number" min={0} value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} placeholder="e.g. 4" />
              </Field>
            </div>
            <div className="flex justify-between mt-10">
              <GhostButton onClick={() => setStep(0)}>Back</GhostButton>
              <PrimaryButton onClick={() => setStep(2)}>Continue</PrimaryButton>
            </div>
          </section>
        )}

        {/* ── Step 2: Vision board ── */}
        {step === 2 && (
          <section>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-3">
              Your <span className="italic text-[#4a5d3f]">vision board.</span>
            </h1>
            <p className="text-[#2c3525]/80 mb-8 leading-relaxed">
              {generating && visionImages.length === 0
                ? "Crafting images to match your goals…"
                : generating
                ? `${visionImages.length} of ${TOTAL_SLOTS} ready — tap any that speak to you.`
                : genError
                ? genError
                : "Tap the images that feel right. These guide your designer."}
            </p>

            {/* Image grid — shimmers replaced by real images as they stream in */}
            {(visionImages.length > 0 || generating) && !genError && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                {visionImages.map((img, i) => {
                  const isSelected = selected.has(i);
                  return (
                    <button
                      key={`img-${i}`}
                      onClick={() => toggleSelect(i)}
                      className="relative overflow-hidden group focus:outline-none pop-in"
                      style={{ aspectRatio: "3/2", display: "block" }}
                      aria-pressed={isSelected}
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.b64_json}`}
                        alt={`Vision ${i + 1}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        style={{ filter: isSelected ? "none" : "grayscale(15%) brightness(0.9)" }}
                      />
                      <div
                        className="absolute inset-0 transition-all duration-200"
                        style={{
                          border: isSelected ? "3px solid #2c3525" : "3px solid transparent",
                          background: isSelected ? "rgba(44,53,37,0.1)" : "transparent",
                        }}
                      />
                      {isSelected && (
                        <div
                          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center font-mono text-[10px] font-bold"
                          style={{ background: "#2c3525", color: "#fcf9f2" }}
                        >✓</div>
                      )}
                    </button>
                  );
                })}
                {Array.from({ length: shimmers }).map((_, i) => (
                  <div
                    key={`shimmer-${i}`}
                    className="shimmer"
                    style={{ aspectRatio: "3/2" }}
                  />
                ))}
              </div>
            )}

            {/* Status line */}
            {!genError && (
              <div className="font-mono text-[11px] text-[#4a5d3f] uppercase tracking-wider mb-2">
                {generating && visionImages.length === 0
                  ? "Generating…"
                  : selected.size === 0
                  ? generating ? "Images arriving…" : "Tap to select"
                  : `${selected.size} selected`}
              </div>
            )}

            {submitError && <div className="mt-4 text-sm text-red-700">{submitError}</div>}

            <div className="flex justify-between mt-8">
              <GhostButton onClick={() => { abortRef.current = true; setStep(1); }}>Back</GhostButton>
              <PrimaryButton
                disabled={createEnquiry.isPending || (generating && visionImages.length === 0)}
                onClick={handleSubmit}
              >
                {createEnquiry.isPending ? "Sending…" : "Send my enquiry"}
              </PrimaryButton>
            </div>
          </section>
        )}

        {/* ── Step 3: Done ── */}
        {step === 3 && (
          <section className="text-center py-12">
            <div className="font-mono text-xs uppercase tracking-widest text-[#4a5d3f] mb-6">Enquiry received</div>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-6">
              Thank you, <span className="italic text-[#4a5d3f]">{name.split(" ")[0] || "friend"}.</span>
            </h1>
            <p className="text-[#2c3525]/80 mb-10 leading-relaxed max-w-md mx-auto">
              Your land is now on our studio board. A designer will study {address || "your property"} and reach out to {email} to begin the conversation.
            </p>
            <Link href="/" className="inline-block bg-[#2c3525] text-[#fcf9f2] hover:bg-[#4a5d3f] rounded-none px-8 py-4 text-sm font-mono uppercase tracking-widest transition-colors">
              Back to home
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

function ProgressRail({ step }: { step: number }) {
  const labels = ["Basics", "Vision", "Ideas"];
  return (
    <div className="flex items-center gap-3 mb-12">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 flex items-center justify-center font-mono text-[11px] border"
              style={{
                background: i <= step ? "#2c3525" : "transparent",
                color: i <= step ? "#fcf9f2" : "#4a5d3f",
                borderColor: "#2c3525",
              }}
            >{i + 1}</div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f] hidden sm:inline">{label}</span>
          </div>
          {i < labels.length - 1 && <div className="h-px flex-1" style={{ background: i < step ? "#2c3525" : "#2c352533" }} />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="pa-label">{label}</span>
      {children}
    </label>
  );
}

function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-3 border transition-colors text-[15px]"
      style={{
        background: selected ? "#2c3525" : "#fffdf9",
        color: selected ? "#fcf9f2" : "#1a1c18",
        borderColor: selected ? "#2c3525" : "#2c352540",
      }}
    >{children}</button>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-[#2c3525] text-[#fcf9f2] hover:bg-[#4a5d3f] rounded-none px-8 py-4 text-sm font-mono uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >{children}</button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[#4a5d3f] hover:text-[#1a1c18] rounded-none px-2 py-4 text-sm font-mono uppercase tracking-widest transition-colors"
    >{children}</button>
  );
}
