import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useRequestPublicUploadUrl,
  useCreateEnquiry,
} from "@workspace/api-client-react";

// How many idea-board photos a visitor may attach. Change this single value
// to adjust the limit across the whole flow.
const MAX_IDEA_PHOTOS = 12;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

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

type UploadedPhoto = { objectPath: string; previewUrl: string; name: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export default function EnquirePage() {
  const [, navigate] = useLocation();
  const requestUpload = useRequestPublicUploadUrl();
  const createEnquiry = useCreateEnquiry();

  const [step, setStep] = useState(0); // 0 contact, 1 survey, 2 ideas, 3 done
  const fileRef = useRef<HTMLInputElement>(null);

  // Contact
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [roughSize, setRoughSize] = useState("");
  const [message, setMessage] = useState("");

  // Survey
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [maintenanceCapacity, setMaintenanceCapacity] = useState("");
  const [householdSize, setHouseholdSize] = useState("");

  // Ideas board
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const contactValid =
    name.trim().length > 0 &&
    /.+@.+\..+/.test(email.trim()) &&
    address.trim().length > 0;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadError(null);
    const remaining = MAX_IDEA_PHOTOS - photos.length;
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    try {
      for (const file of toUpload) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_UPLOAD_BYTES) {
          setUploadError(`"${file.name}" is too large (max 15MB).`);
          continue;
        }
        const { uploadURL, objectPath } = await requestUpload.mutateAsync({
          data: { name: file.name, size: file.size, contentType: file.type },
        });
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error("Upload failed");
        const previewUrl = await readAsDataUrl(file);
        setPhotos((prev) => [...prev, { objectPath, previewUrl, name: file.name }]);
      }
    } catch {
      setUploadError("Something went wrong uploading a photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setSubmitError(null);
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
          ideaPhotos: photos.map((p) => p.objectPath),
        },
      });
      setStep(3);
    } catch {
      setSubmitError("We couldn't submit your enquiry. Please try again in a moment.");
    }
  }

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
      `}} />

      {/* Header */}
      <header className="px-6 py-6 border-b border-[#2c3525]/15 flex justify-between items-center max-w-5xl mx-auto">
        <Link href="/" className="text-2xl font-semibold tracking-tight">Pattern</Link>
        <div className="font-mono text-xs uppercase tracking-widest text-[#4a5d3f]">Client Enquiry</div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        {step < 3 && <ProgressRail step={step} />}

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

        {step === 1 && (
          <section>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-4">
              A few <span className="italic text-[#4a5d3f]">friendly questions.</span>
            </h1>
            <p className="text-[#2c3525]/80 mb-10 leading-relaxed">
              No technical knowledge needed — we'll work out the soil, rainfall, and climate details for you from your address.
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

        {step === 2 && (
          <section>
            <h1 className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-4">
              Show us your <span className="italic text-[#4a5d3f]">inspiration.</span>
            </h1>
            <p className="text-[#2c3525]/80 mb-8 leading-relaxed">
              Add up to {MAX_IDEA_PHOTOS} photos — your land today, places you love, gardens that inspire you. This becomes your ideas board.
            </p>

            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <div key={i} className="relative group bg-[#e8e4da] border border-[#2c3525]/15 p-1" style={{ aspectRatio: "1/1" }}>
                  <img src={p.previewUrl} alt={p.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-[#2c3525] text-[#fcf9f2] opacity-0 group-hover:opacity-100 transition-opacity font-mono text-xs"
                    aria-label="Remove photo"
                  >✕</button>
                </div>
              ))}

              {photos.length < MAX_IDEA_PHOTOS && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex flex-col items-center justify-center gap-2 bg-[#fffdf9] border border-dashed border-[#2c3525]/40 hover:border-[#4a5d3f] hover:bg-[#f5f1e6] transition-colors text-[#4a5d3f]"
                  style={{ aspectRatio: "1/1" }}
                >
                  <span className="text-2xl font-light">{uploading ? "…" : "+"}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider">{uploading ? "Uploading" : "Add photos"}</span>
                </button>
              )}
            </div>

            <div className="mt-3 font-mono text-[11px] text-[#4a5d3f] uppercase tracking-wider">{photos.length}/{MAX_IDEA_PHOTOS} added</div>
            {uploadError && <div className="mt-2 text-sm text-red-700">{uploadError}</div>}

            {submitError && <div className="mt-6 text-sm text-red-700">{submitError}</div>}

            <div className="flex justify-between mt-10">
              <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
              <PrimaryButton disabled={uploading || createEnquiry.isPending} onClick={handleSubmit}>
                {createEnquiry.isPending ? "Sending…" : "Send my enquiry"}
              </PrimaryButton>
            </div>
          </section>
        )}

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
