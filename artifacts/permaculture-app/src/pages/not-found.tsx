export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: "#1d4ed8", marginBottom: 12 }}>404</div>
        <h1 style={{ margin: "0 0 10px", fontFamily: "monospace", fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", color: "#111", textTransform: "uppercase" }}>Page Not Found</h1>
        <p style={{ margin: 0, fontFamily: "monospace", fontSize: 10, color: "#bbb", letterSpacing: "0.08em" }}>
          Did you forget to add the page to the router?
        </p>
      </div>
    </div>
  );
}
