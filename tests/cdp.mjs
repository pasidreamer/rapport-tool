// Kleiner Helfer: Edge headless starten, Seite öffnen, per DevTools-Protokoll steuern.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withPage(url, { width = 1440, height = 900, reduced = false } = {}, fn) {
  const port = 9800 + Math.floor(Math.random() * 150);
  const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.TEMP}\\edge-cdp-${port}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required", `--window-size=${width},${height}`,
    // Ohne diese Schalter gilt die Seite als «versteckt», sobald der Bildschirm aus oder gesperrt ist: Animationen und Zeitgeber stehen dann still.
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--disable-features=CalculateNativeWinOcclusion", // Windows: Fenster gilt sonst bei dunklem/gesperrtem Bildschirm als verdeckt
    "about:blank",
  ], { stdio: "ignore" });

  let ws; let id = 0; const pending = new Map(); const events = [];
  const send = (method, params = {}) => {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
  };
  try {
    let targets;
    for (let i = 0; i < 60 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); }
    }
    const page = targets.find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else if (msg.method) {
        events.push(msg);
        // Rückfragen (confirm/prompt) im Test automatisch bestätigen
        if (msg.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true, promptText: "Test-Baustein" });
      }
    });
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    // Log: Browser-Meldungen wie blockierte Inhalte (Content-Security-Policy) oder fehlgeschlagene Ladevorgänge.
    await send("Log.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await send("Page.navigate", { url });
    await sleep(3000);

    const evaluate = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    };
    const key = async (keyName, code, keyCode, shift = false) => {
      const modifiers = shift ? 8 : 0;
      // Enter braucht wie eine echte Tastatur auch das Zeichen «\r», sonst fehlt das keypress-Ereignis.
      const text = keyName === "Enter" ? "\r" : keyName === " " ? " " : undefined;
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "keyDown", key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers, text, unmodifiedText: text });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers });
    };
    const shot = async (file) => {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(r.data, "base64"));
      console.log("gespeichert:", file);
    };
    const errors = () => events
      .filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")
        || (e.method === "Log.entryAdded" && e.params.entry.level === "error"))
      .map((e) => JSON.stringify(e.params).slice(0, 300));
    await fn({ send, evaluate, key, shot, errors, events });
  } finally {
    try { ws?.close(); } catch {}
    killProfile(`edge-cdp-${port}`, edge.pid);
    // Testprofil wieder löschen: Sonst bleibt pro Lauf ein Ordner mit 300 bis 750 MB im Temp liegen (16.10.2026: 204 Stück, Platte voll).
    try { rmSync(join(process.env.TEMP, `edge-cdp-${port}`), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch {}
  }
}

// Windows: edge.kill() beendet nur den Startprozess – die übrigen Edge-Prozesse leben weiter.
// Darum alle Prozesse mit genau diesem Test-Profilordner beenden (nie das normale Edge).
export function killProfile(profileName, pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  spawnSync("powershell", [
    "-NoProfile", "-Command",
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profileName}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ], { stdio: "ignore" });
}
