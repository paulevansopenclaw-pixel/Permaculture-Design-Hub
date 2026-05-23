---
name: Vision board image upload
description: Reliable image upload/resize pattern for sandboxed iframe environments
---

**Rule:** Always read files via `FileReader.readAsDataURL()` first, then create an `Image` from the resulting data URL for canvas resize. Never use `URL.createObjectURL()` as the image src inside sandboxed iframes.

**Why:** Blob URLs created in a sandboxed iframe context can fail silently — `img.onerror` fires without a console error and the Promise hangs forever if there is no error handler. This results in `photos` state never updating and images never appearing.

**How to apply:**
1. `FileReader.readAsDataURL(file)` → `rawDataUrl` (always works)
2. `new Image(); img.src = rawDataUrl; img.onload → canvas.drawImage → toDataURL` (canvas resize)
3. `img.onerror` → fallback: `resolve(rawDataUrl)` to return the unresized original
4. Wrap `handleAddPhotos` in `try/catch/finally` so the file input always resets
