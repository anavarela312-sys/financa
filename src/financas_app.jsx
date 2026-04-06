import { useState, useRef, useCallback, useEffect, useMemo } from "react";

const CLIENT_ID = "111962359632-serj2ine76p1avehb9csg30llbnjqadu.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "financa_dados.json";
const SHARED_FILE_ID = "1aGjdp4SxYdMtcrSR5hZTVb3ZFrrBJNls"; // ID fixo do ficheiro partilhado

function useDriveSync(data, onLoad) {
  const [status, setStatus] = useState("idle");
  const [tokenClient, setTokenClient] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const saveTimer = useRef(null);
  const isConnected = !!accessToken;

  const onToken = useCallback(async (token) => {
    setAccessToken(token);
    localStorage.setItem("fin_drive_was_connected", "1");
    setStatus("loading");
    try {
      // Always load the shared master file
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${SHARED_FILE_ID}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) { const json = await res.json(); onLoad(json); }
      setStatus("synced");
    } catch { setStatus("error"); }
  }, [onLoad]);

  useEffect(() => {
    const loadScript = src => new Promise(res => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement("script"); s.src = src; s.onload = res; document.head.appendChild(s);
    });
    Promise.all([
      loadScript("https://accounts.google.com/gsi/client"),
      loadScript("https://apis.google.com/js/api.js"),
    ]).then(() => {
      window.gapi.load("client", async () => {
        await window.gapi.client.init({});
        const tc = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: async resp => {
            if (resp.error || !resp.access_token) { setStatus("error"); return; }
            await onToken(resp.access_token);
          },
        });
        setTokenClient(tc);
        // Auto-reconnect silently on load
        if (localStorage.getItem("fin_drive_was_connected")) {
          setTimeout(() => { try { tc.requestAccessToken({ prompt: "none" }); } catch(e) { setStatus("idle"); } }, 600);
        }
      });
    });
  }, [onToken]);

  // Auto-save with debounce
  useEffect(() => {
    if (!accessToken || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${SHARED_FILE_ID}?uploadType=media`,
          { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(data) }
        );
        setStatus("synced");
      } catch { setStatus("error"); }
    }, 2500);
    return () => clearTimeout(saveTimer.current);
  }, [data, accessToken]);

  const signIn = () => { if (tokenClient) tokenClient.requestAccessToken({ prompt: "" }); };
  const signOut = () => {
    if (accessToken) window.google?.accounts?.oauth2?.revoke(accessToken);
    setAccessToken(null);
    setStatus("idle");
    localStorage.removeItem("fin_drive_was_connected");
  };

  return { status, signIn, signOut, isConnected, fileId: SHARED_FILE_ID };
}

function DriveBtn({ status, isConnected, onSignIn, onSignOut }) {
  const cfg = {
    idle:   { color:"#64748b", dot:"⚪", label:"Drive desligado" },
    loading:{ color:"#f59e0b", dot:"🟡", label:"A carregar..." },
    saving: { color:"#f59e0b", dot:"🟡", label:"A guardar..." },
    synced: { color:"#22c55e", dot:"🟢", label:"Sincronizado" },
    error:  { color:"#ef4444", dot:"🔴", label:"Erro" },
  }[status] || { color:"#64748b", dot:"⚪", label:"" };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <span style={{ fontSize:10 }}>{cfg.dot}</span>
      <span style={{ fontSize:10, color:cfg.color }}>{cfg.label}</span>
      {!isConnected
        ? <button onClick={onSignIn} style={{ background:"rgba(59,130,246,0.15)", color:"#3b82f6", border:"none", borderRadius:6, padding:"2px 8px", fontSize:10, cursor:"pointer" }}>Ligar Drive</button>
        : <button onClick={onSignOut} style={{ background:"rgba(239,68,68,0.1)", color:"#ef4444", border:"none", borderRadius:6, padding:"2px 8px", fontSize:10, cursor:"pointer" }}>Desligar</button>
      }
    </div>
  );
}

// ── SHARE MODE ────────────────────────────────────────────────
// Owner publishes fileId to a known "share registry" file in Drive
// Guest reads from that public file ID
const SHARE_REGISTRY_NAME = "financa_share_registry.json";

function useShareMode(accessToken, fileId, onLoad) {
  const [shareCode, setShareCode] = useState("");
  const [shareStatus, setShareStatus] = useState("idle"); // idle | generating | active | loading | error
  const [guestCode, setGuestCode] = useState(() => localStorage.getItem("fin_guest_code") || "");
  const [isGuest, setIsGuest] = useState(() => !!localStorage.getItem("fin_guest_code"));
  const pollRef = useRef(null);

  // Generate a share code = publish fileId to a registry on Drive (as a known-named file)
  const generateShareCode = useCallback(async () => {
    if (!accessToken || !fileId) return;
    setShareStatus("generating");
    try {
      // Store the fileId as the share code (base64 encoded)
      const code = btoa(fileId).slice(0, 12).toUpperCase();
      // Save registry: code -> fileId mapping in a public file
      const registryData = JSON.stringify({ code, fileId, updated: new Date().toISOString() });
      // Search for existing registry file
      const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${SHARE_REGISTRY_NAME}' and trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${accessToken}` } });
      const { files } = await search.json();
      let regId;
      if (files?.length > 0) {
        regId = files[0].id;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${regId}?uploadType=media`,
          { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: registryData });
      } else {
        const meta = await fetch("https://www.googleapis.com/drive/v3/files",
          { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: SHARE_REGISTRY_NAME, mimeType: "application/json" }) });
        const { id } = await meta.json();
        regId = id;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
          { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: registryData });
      }
      // Make registry file public readable
      await fetch(`https://www.googleapis.com/drive/v3/files/${regId}/permissions`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "reader", type: "anyone" }) });
      // Also make data file public readable
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "reader", type: "anyone" }) });
      localStorage.setItem("fin_share_registry_id", regId);
      localStorage.setItem("fin_share_code", code);
      setShareCode(code);
      setShareStatus("active");
    } catch(e) { console.error(e); setShareStatus("error"); }
  }, [accessToken, fileId]);

  // Load existing share code
  useEffect(() => {
    const saved = localStorage.getItem("fin_share_code");
    if (saved) { setShareCode(saved); setShareStatus("active"); }
  }, []);

  // Guest: load data from shared file by code
  const loadAsGuest = useCallback(async (code) => {
    setShareStatus("loading");
    try {
      // The code is a base64 of the fileId — decode it
      // But we need the registry file ID first
      // Guest must know the registry file ID — we'll store it in the share code itself
      // New approach: code IS the fileId encoded
      // We search public files with a specific name pattern
      // Simplest: encode fileId directly in share code (owner shares the code)
      // Code format: first 12 chars of base64(fileId)
      // We can't reverse that easily. Instead: use full fileId as share code
      const fid = code.trim();
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fid}?alt=media`);
      if (!res.ok) throw new Error("Ficheiro não encontrado");
      const json = await res.json();
      onLoad(json);
      localStorage.setItem("fin_guest_code", fid);
      setIsGuest(true);
      setGuestCode(fid);
      setShareStatus("synced");
      // Poll for updates every 30s
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fid}?alt=media`);
          if (r.ok) { const j = await r.json(); onLoad(j); }
        } catch {}
      }, 30000);
    } catch(e) { setShareStatus("error"); }
  }, [onLoad]);

  // Stop guest mode
  const stopGuest = useCallback(() => {
    localStorage.removeItem("fin_guest_code");
    setIsGuest(false);
    setGuestCode("");
    setShareStatus("idle");
    if (pollRef.current) clearInterval(pollRef.current);
    window.location.reload();
  }, []);

  // Auto-load if guest
  useEffect(() => {
    const saved = localStorage.getItem("fin_guest_code");
    if (saved && !accessToken) loadAsGuest(saved);
  }, []);

  return { shareCode, shareStatus, generateShareCode, isGuest, guestCode, loadAsGuest, stopGuest };
}

function SharePanel({ shareCode, shareStatus, generateShareCode, fileId, accessToken }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = fileId ? `${window.location.href.split('?')[0]}?share=${fileId}` : "";

  const copy = () => {
    navigator.clipboard.writeText(fileId || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop:12, padding:"12px", background:"rgba(59,130,246,0.06)", borderRadius:12, border:"1px solid rgba(59,130,246,0.2)" }}>
      <p style={{ fontSize:12, fontWeight:600, color:"#3b82f6", marginBottom:8 }}>📤 Partilhar com o João</p>
      {!fileId ? (
        <p style={{ fontSize:11, color:"#64748b" }}>Liga o Drive primeiro para gerar um código de partilha.</p>
      ) : shareStatus === "active" ? (
        <div>
          <p style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>Código de partilha (envia ao João):</p>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <code style={{ fontSize:10, background:"#0a1220", padding:"6px 10px", borderRadius:8, color:"#22c55e", flex:1, wordBreak:"break-all" }}>{fileId}</code>
            <button onClick={copy} style={{ background:copied?"rgba(34,197,94,0.2)":"rgba(59,130,246,0.15)", color:copied?"#22c55e":"#3b82f6", border:"none", borderRadius:8, padding:"6px 10px", fontSize:11, cursor:"pointer", flexShrink:0 }}>
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
          <p style={{ fontSize:10, color:"#64748b", marginTop:6 }}>O João abre a app → "Ver dados partilhados" → cola o código</p>
        </div>
      ) : (
        <button onClick={generateShareCode} style={{ background:"rgba(59,130,246,0.15)", color:"#3b82f6", border:"none", borderRadius:8, padding:"8px 14px", fontSize:12, cursor:"pointer", width:"100%" }}>
          {shareStatus === "generating" ? "A gerar..." : "🔗 Gerar código de partilha"}
        </button>
      )}
    </div>
  );
}

function GuestPanel({ onLoad }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!code.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${code.trim()}?alt=media`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      onLoad(json);
      localStorage.setItem("fin_guest_code", code.trim());
      window.location.reload();
    } catch { setError("Código inválido ou sem acesso. Verifica com a Ana."); }
    setLoading(false);
  };

  return (
    <div style={{ marginTop:8, padding:"12px", background:"rgba(34,197,94,0.06)", borderRadius:12, border:"1px solid rgba(34,197,94,0.2)" }}>
      <p style={{ fontSize:12, fontWeight:600, color:"#22c55e", marginBottom:8 }}>👁️ Ver dados partilhados</p>
      <div style={{ display:"flex", gap:6 }}>
        <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Cola o código aqui..."
          style={{ flex:1, fontSize:12, padding:"8px 10px" }} onKeyDown={e=>e.key==="Enter"&&load()}/>
        <button onClick={load} style={{ background:"rgba(34,197,94,0.15)", color:"#22c55e", border:"none", borderRadius:8, padding:"8px 12px", fontSize:12, cursor:"pointer" }}>
          {loading ? "..." : "Carregar"}
        </button>
      </div>
      {error && <p style={{ fontSize:11, color:"#ef4444", marginTop:6 }}>{error}</p>}
    </div>
  );
}


function useLS(key, def) {
  const [val, setVal] = useState(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } });
  const set = useCallback(v => { const n = typeof v === "function" ? v(val) : v; setVal(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch {} }, [key, val]);
  return [val, set];
}
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 640);
  useEffect(() => { const fn = () => setM(window.innerWidth < 640); window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn); }, []);
  return m;
}

// ── DEFAULT CATS (user can add more) ─────────────────────────
const DEFAULT_CATS = {
  "Casa":              { icon:"🏠", color:"#3b82f6", subs:["Renda","Electricidade","Gás","Água","Condomínio","Seguro Casa","Seguro Vida","Limpeza","Engomadoria","Mobília","Reparações","Vários"] },
  "Saúde":             { icon:"🏥", color:"#ef4444", subs:["Consultas","Medicamentos","Estética / Cuidados Pessoais","Ginásio","Exames","Fisioterapia","Transporte"] },
  "Alimentação":       { icon:"🍽️", color:"#f97316", subs:["Supermercado","Cafetaria","Restauração"] },
  "Animais":           { icon:"🐾", color:"#84cc16", subs:["Ração e outros","Veterinário","Seguro"] },
  "Carro":             { icon:"🚗", color:"#6366f1", subs:["Via Verde","Combustível","Limpeza","Reparações"] },
  "Lexie":             { icon:"👧", color:"#ec4899", subs:["Piscina","Actividades extra curriculares","Roupa","Saúde","Vários"] },
  "Mensalidades":      { icon:"📱", color:"#8b5cf6", subs:["Netflix","Google","Quotas Benfica","Disney"] },
  "Mina Santos":       { icon:"💡", color:"#eab308", subs:["Luz","Vodafone"] },
  "Educação":          { icon:"📚", color:"#14b8a6", subs:["Curso","Mentoria"] },
  "Lazer":             { icon:"🎭", color:"#f59e0b", subs:["Experiências","Livros","Cinema","Eventos"] },
  "Poupança":          { icon:"💰", color:"#10b981", subs:["Apparte","Optimize","Conta Lexie"] },
  "Investimento":      { icon:"📈", color:"#06b6d4", subs:["ETF"] },
  "Créditos":          { icon:"💳", color:"#f43f5e", subs:["Crédito Pessoal"] },
  "Donativos":         { icon:"❤️", color:"#e11d48", subs:["Unicef","Outros"] },
  "Despesas bancárias":{ icon:"🏦", color:"#64748b", subs:["Comissões","Imposto Selo"] },
  "Prendas":           { icon:"🎁", color:"#a855f7", subs:["Família","Amigos Lexie"] },
  "Vários / Extras":   { icon:"📦", color:"#78716c", subs:["Sem subcategoria","Compras Outros","Roupa","Gadgets IT","Serviços PSC"] },
  "Transferência Interna":{ icon:"↔️", color:"#94a3b8", subs:["Apparte / Mealheiro","Caixinha Saúde","Caixinha Casa","Caixinha Lexie","Caixinha Prendas","Caixinha Veterinário","Cartão Crédito","Entre Contas","Empresa","Outro"] },
  "Receita":           { icon:"💵", color:"#22c55e", subs:["Vencimento","Reembolso Saúde","Pagamento Cliente","Devolução","Cheque Digital","Outro"] },
};
const NET_CATS = new Set(["Saúde","Vários / Extras","Lexie"]);

const REGRAS = [
  { m:["TRF P/ Apparte - Mealheiro"], cat:"Transferência Interna", sub:"Apparte / Mealheiro", ent:"Apparte" },
  { m:["TRF P/ Apparte - Saude"], cat:"Transferência Interna", sub:"Caixinha Saúde", ent:"Apparte" },
  { m:["TRF P/ Apparte - Casa"], cat:"Transferência Interna", sub:"Caixinha Casa", ent:"Apparte" },
  { m:["TRF P/ Apparte - Lexie"], cat:"Transferência Interna", sub:"Caixinha Lexie", ent:"Apparte" },
  { m:["TRF P/ Apparte - Prendas"], cat:"Transferência Interna", sub:"Caixinha Prendas", ent:"Apparte" },
  { m:["TRF P/ Apparte - Veterinario"], cat:"Transferência Interna", sub:"Caixinha Veterinário", ent:"Apparte" },
  { m:["TRF DE Apparte"], cat:"Transferência Interna", sub:"Apparte / Mealheiro", ent:"Apparte" },
  { m:["DD Optimize","OPTIMIZE INVES"], cat:"Transferência Interna", sub:"Apparte / Mealheiro", ent:"Optimize" },
  { m:["VIS PAGAMENTO CARTAO CREDITO"], cat:"Transferência Interna", sub:"Cartão Crédito", ent:"Millennium" },
  { m:["LEV ATM"], cat:"Transferência Interna", sub:"Entre Contas", ent:"Millennium" },
  { m:["WISE EUROPE","TRF P/ Wise"], cat:"Transferência Interna", sub:"Entre Contas", ent:"Wise" },
  { m:["TRANSFERENCIA - VENCIMENTO"], cat:"Receita", sub:"Vencimento", ent:"Vencimento", d1:true },
  { m:["REQUISITO COMPLETO"], cat:"Receita", sub:"Vencimento", ent:"Requisito Completo" },
  { m:["MULTICARE"], cat:"Receita", sub:"Reembolso Saúde", ent:"Multicare" },
  { m:["VIAVERDE","PAG BXVAL"], cat:"Carro", sub:"Via Verde", ent:"Via Verde" },
  { m:["MAKSU"], cat:"Carro", sub:"Via Verde", ent:"Maksu" },
  { m:["EMEL","PAGSERV EMEL"], cat:"Carro", sub:"Via Verde", ent:"EMEL" },
  { m:["METROPOLITANO"], cat:"Carro", sub:"Via Verde", ent:"Metro Lisboa" },
  { m:["FERTAGUS"], cat:"Carro", sub:"Via Verde", ent:"Fertagus" },
  { m:["EST SERVICO","BOMBNS DA QUINTA","BP PINHAL"], cat:"Carro", sub:"Combustível", ent:"Gasolineira" },
  { m:["MY BREAK BY DELTA","MY BREAK DELTA","BREAK BY DELTA"], cat:"Alimentação", sub:"Cafetaria", ent:"Delta" },
  { m:["OFFICE BREAK"], cat:"Alimentação", sub:"Cafetaria", ent:"Office Break" },
  { m:["IPO - RESTAURANTE","IPO DE LISBOA"], cat:"Alimentação", sub:"Cafetaria", ent:"IPO Lisboa" },
  { m:["BALOICO","PORTELA CAFES","CAFE YAKARI","PASTELARIA","SANTINI"], cat:"Alimentação", sub:"Cafetaria", ent:"" },
  { m:["CASA DO CROQUETE"], cat:"Alimentação", sub:"Restauração", ent:"Casa do Croquete" },
  { m:["CHURRASQUEIRA","CHURRARIA","MCDONALDS","PRONTO A COMER","ROUNDFOOD"], cat:"Alimentação", sub:"Restauração", ent:"" },
  { m:["CONTINENTE"], cat:"Alimentação", sub:"Supermercado", ent:"Continente" },
  { m:["MERCADONA"], cat:"Alimentação", sub:"Supermercado", ent:"Mercadona" },
  { m:["PINGO DOCE"], cat:"Alimentação", sub:"Supermercado", ent:"Pingo Doce" },
  { m:["INTERMARCHE"], cat:"Alimentação", sub:"Supermercado", ent:"Intermarché" },
  { m:["E.LECLERC"], cat:"Alimentação", sub:"Supermercado", ent:"E.Leclerc" },
  { m:["PINHALSODI","NOTE PINHAL","SUPER SABBER"], cat:"Alimentação", sub:"Supermercado", ent:"" },
  { m:["PAG.PRESTACAO N. 041"], cat:"Casa", sub:"Renda", ent:"Senhorio" },
  { m:["DD METLIFE","METLIFE EUROPE"], cat:"Casa", sub:"Seguro Vida", ent:"Metlife" },
  { m:["DD OCIDENTAL","OCIDENTAL"], cat:"Casa", sub:"Seguro Casa", ent:"Ocidental" },
  { m:["DD G9,SA","DD G9"], cat:"Casa", sub:"Electricidade", ent:"G9 / EDP" },
  { m:["CM PALMELA","DD CM Palmela"], cat:"Casa", sub:"Água", ent:"CM Palmela" },
  { m:["CONDOMINIO PREDIO"], cat:"Casa", sub:"Condomínio", ent:"Condomínio" },
  { m:["PATRICIA FERNANDES","SLOW MAE"], cat:"Saúde", sub:"Consultas", ent:"Slow Mae (Psicóloga)" },
  { m:["HOSPITAL CUF","CUF TEJO","CUF DESCOBERTA"], cat:"Saúde", sub:"Consultas", ent:"CUF" },
  { m:["FARMACIA","CENTRO FARMACEUTICO"], cat:"Saúde", sub:"Medicamentos", ent:"Farmácia" },
  { m:["SILVIA DIAS"], cat:"Saúde", sub:"Estética / Cuidados Pessoais", ent:"Sílvia Dias" },
  { m:["BARBER SHOP"], cat:"Saúde", sub:"Estética / Cuidados Pessoais", ent:"Barber Shop" },
  { m:["PRIMOR"], cat:"Saúde", sub:"Estética / Cuidados Pessoais", ent:"Primor" },
  { m:["DD FIDELIDADE","FIDELIDADE COM"], cat:"Animais", sub:"Seguro", ent:"Fidelidade" },
  { m:["FISH PLANET"], cat:"Animais", sub:"Ração e outros", ent:"Fish Planet" },
  { m:["DD PHYSICAL GET E","PHYSICAL GET E"], cat:"Animais", sub:"Ração e outros", ent:"Physical" },
  { m:["SIMAA","DOJO MONTANHAO","MARTIAL ARTS"], cat:"Lexie", sub:"Actividades extra curriculares", ent:"Dojo Montanhão" },
  { m:["PALMELA DESPORTO","PAGSERV PALMELA"], cat:"Lexie", sub:"Piscina", ent:"Palmela Desporto" },
  { m:["DEICHMANN"], cat:"Lexie", sub:"Roupa", ent:"Deichmann" },
  { m:["ZIPPY"], cat:"Lexie", sub:"Roupa", ent:"Zippy" },
  { m:["KIABI"], cat:"Lexie", sub:"Roupa", ent:"Kiabi" },
  { m:["NETFLIX"], cat:"Mensalidades", sub:"Netflix", ent:"Netflix" },
  { m:["DD Sport Lisboa","SPORT LISBOA"], cat:"Mensalidades", sub:"Quotas Benfica", ent:"Benfica" },
  { m:["GOOGLE PLAY","GOOGLE ONE"], cat:"Mensalidades", sub:"Google", ent:"Google" },
  { m:["VODAFONE"], cat:"Mina Santos", sub:"Vodafone", ent:"Vodafone" },
  { m:["DD Petrogal","PETROGAL"], cat:"Mina Santos", sub:"Luz", ent:"Petrogal" },
  { m:["SARA CASTRO"], cat:"Educação", sub:"Curso", ent:"Sara Castro" },
  { m:["TRF P/ XTB SA","TRF P/ XTB"], cat:"Investimento", sub:"ETF", ent:"XTB" },
  { m:["PAG.PRESTACAO N. 005"], cat:"Créditos", sub:"Crédito Pessoal", ent:"Banco" },
  { m:["UNICEF","DD UNICEF"], cat:"Donativos", sub:"Unicef", ent:"Unicef" },
  { m:["COM.MAN.CONTA","IMPOSTO SELO"], cat:"Despesas bancárias", sub:"Comissões", ent:"Millennium" },
  { m:["BADOCA","SAFARI PARK"], cat:"Lazer", sub:"Experiências", ent:"Badoca Safari Park" },
  { m:["FEIRA DO LIVRO"], cat:"Lazer", sub:"Livros", ent:"Feira do Livro" },
  { m:["PAIS SEM CULPA","PAISSEMCULPA"], cat:"Vários / Extras", sub:"Serviços PSC", ent:"Pais sem Culpa" },
  { m:["AMAZON","AMZNBUSINESS","WWW.AMAZON"], cat:"Vários / Extras", sub:"Compras Outros", ent:"Amazon" },
  { m:["CARLOS ALBERTO GOMES RITA"], cat:"Vários / Extras", sub:"Compras Outros", ent:"Carlos Rita" },
];

function autoCat(desc, cats) {
  const u = desc.toUpperCase();
  for (const r of REGRAS) for (const m of r.m) if (u.includes(m.toUpperCase())) return r;
  return null;
}
function nextMonth(ds) { const [y,m]=ds.split("-");const nm=parseInt(m),ny=parseInt(y);return nm===12?`${ny+1}-01-01`:`${ny}-${String(nm+1).padStart(2,"0")}-01`; }

// Fix: comma=thousand separator, dot=decimal
function parseVal(s) {
  if (!s) return 0;
  let clean = s.trim();
  // e.g. "5 096,62" or "1,200.00" or "-5.20"
  // If comma exists and dot exists: comma=thousand, dot=decimal
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/,/g, "");
  } else if (clean.includes(",")) {
    // Only comma: could be decimal separator (European)
    const parts = clean.split(",");
    if (parts[parts.length-1].length <= 2) clean = clean.replace(",", ".");
    else clean = clean.replace(/,/g, "");
  }
  clean = clean.replace(/\s/g, "");
  return parseFloat(clean) || 0;
}

function parseLines(text, cats) {
  const lines = text.trim().split("\n").filter(l=>l.trim());
  const out = [];
  for (const line of lines) {
    const p = line.split("\t");
    if (p.length < 4) continue;
    const ds=p[0]?.trim(), desc=p[1]?.trim(), mont=p[2]?.trim(), tipo=p[3]?.trim();
    if (!ds||!desc||["Data valor","Data lançamento","Data"].includes(ds)) continue;
    const dp = ds.split("-"); if (dp.length!==3||dp[2]?.length!==4) continue;
    const data = `${dp[2]}-${dp[1]}-${dp[0]}`;
    const val = parseVal(mont); if (val===0) continue;
    const cr = tipo?.toLowerCase().includes("créd") || val > 0;
    const r = autoCat(desc, cats);
    out.push({ id:crypto.randomUUID(), data:r?.d1?nextMonth(data):data, dataOrig:data, desc, val:Math.abs(val), tipo:cr?"c":"d", cat:r?.cat||"", sub:r?.sub||"", ent:r?.ent||"", nota:"", ok:!!r });
  }
  return out.sort((a,b)=>b.data.localeCompare(a.data));
}

const DEF_CONTAS=[
  {id:"mill",nome:"Millennium",tipo:"corrente",saldo:0,cor:"#3b82f6",icon:"🏦"},
  {id:"app",nome:"Apparte",tipo:"poupança",saldo:1350,cor:"#22c55e",icon:"💰"},
  {id:"opt",nome:"Optimize",tipo:"poupança",saldo:0,cor:"#06b6d4",icon:"📊"},
  {id:"xtb",nome:"XTB",tipo:"investimento",saldo:1400,cor:"#f59e0b",icon:"📈"},
  {id:"cart",nome:"Carteira",tipo:"dinheiro",saldo:0,cor:"#78716c",icon:"👛"},
  {id:"lexc",nome:"Conta Lexie",tipo:"poupança",saldo:0,cor:"#ec4899",icon:"👧"},
];
const DEF_ORC={"2026-04":{"Casa":1826,"Saúde":626,"Créditos":310,"Animais":161,"Alimentação":185,"Mensalidades":57,"Mina Santos":87,"Educação":112,"Lazer":75,"Lexie":51,"Prendas":31,"Carro":100,"Vários / Extras":100,"Investimento":100,"Donativos":11,"Despesas bancárias":10}};
const DEF_SNAPS=[{label:"Mar 2026",year:2026,month:2,planned:1000,actual:1000,note:"Início"},{label:"Abr 2026",year:2026,month:3,planned:1800,actual:1350,note:"Imprevistos"}];
const PLAN_LEVELS=[{id:1,name:"Fundo 3 Meses",target:10500,color:"#22c55e",desc:"Rede mínima"},{id:2,name:"Limpar Crédito",target:16000,color:"#f59e0b",desc:"Dívida eliminada"},{id:3,name:"Fundo 6 Meses",target:21000,color:"#06b6d4",desc:"Rede robusta"},{id:4,name:"Investimento",target:1050000,color:"#8b5cf6",desc:"Independência"}];

const fE=n=>n.toLocaleString("pt-PT",{style:"currency",currency:"EUR",maximumFractionDigits:2});
const fE0=n=>n.toLocaleString("pt-PT",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CAT_COLORS=["#3b82f6","#ef4444","#f97316","#84cc16","#6366f1","#ec4899","#8b5cf6","#eab308","#14b8a6","#f59e0b","#06b6d4","#22c55e","#a855f7","#78716c"];

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;background:#070d1a;color:#e2e8f0;font-family:'DM Sans',sans-serif}
input,select,textarea{font-family:'DM Sans',sans-serif;background:#0f1d2e;border:1px solid #1e3048;color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:14px;width:100%;outline:none;transition:border 0.15s;-webkit-appearance:none}
input:focus,select:focus,textarea:focus{border-color:#3b82f6}
select option{background:#0f1d2e}
button{font-family:'DM Sans',sans-serif;cursor:pointer;border:none;border-radius:10px;font-size:14px;font-weight:500;transition:all 0.15s;-webkit-tap-highlight-color:transparent}
button:active{transform:scale(0.97)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1e3048;border-radius:4px}
.fade{animation:fi 0.3s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.hrow:hover{background:#0d1a2e}
.tabbar{position:fixed;bottom:0;left:0;right:0;background:#0a1220;border-top:1px solid #1e3048;display:flex;z-index:100;padding-bottom:env(safe-area-inset-bottom)}
.tabbar button{flex:1;padding:10px 2px;background:none;border:none;display:flex;flex-direction:column;align-items:center;gap:2px;color:#64748b;font-size:10px;font-weight:500}
.tabbar button.act{color:#3b82f6}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.modal{background:#0d1a2e;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:600px;max-height:85vh;overflow-y:auto}
@media(min-width:640px){.modal-bg{align-items:center}.modal{border-radius:20px;max-height:80vh}}
`;

function PBar({val,max,color="#3b82f6",h=6}){const pct=max>0?Math.min((val/max)*100,100):0;const over=val>max,warn=pct>75&&!over;return <div style={{background:"#1e3048",borderRadius:100,height:h,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",borderRadius:100,background:over?"#ef4444":warn?"#f59e0b":color,transition:"width 0.5s"}}/></div>;}
function Chip({label,color,sm}){return <span style={{display:"inline-flex",padding:sm?"1px 7px":"2px 10px",borderRadius:20,background:color+"22",color,fontSize:sm?10:11,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>;}
function Card({children,style={},onClick}){return <div onClick={onClick} style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:16,padding:"16px",marginBottom:12,...style,cursor:onClick?"pointer":"default"}}>{children}</div>;}
function Btn({children,variant="ghost",onClick,style={},full}){const bg=variant==="primary"?"#3b82f6":variant==="success"?"#22c55e":variant==="danger"?"rgba(239,68,68,0.12)":"rgba(255,255,255,0.05)";const color=variant==="primary"||variant==="success"?"#fff":variant==="danger"?"#ef4444":"#94a3b8";return <button onClick={onClick} style={{padding:"10px 16px",background:bg,color,border:variant==="ghost"?"1px solid #1e3048":"none",width:full?"100%":"auto",...style}}>{children}</button>;}
function Lbl({children}){return <span style={{fontSize:11,color:"#64748b",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>{children}</span>;}

// ── PIE CHART ─────────────────────────────────────────────────
function PieChart({data,size=160}){
  const total=data.reduce((a,d)=>a+d.val,0);
  if(!total) return null;
  let cumAngle=0;
  const slices=data.map(d=>{const angle=(d.val/total)*360;const s={...d,startAngle:cumAngle,angle};cumAngle+=angle;return s;});
  function describeArc(cx,cy,r,start,end){
    const toRad=a=>a*Math.PI/180;
    const x1=cx+r*Math.cos(toRad(start-90)),y1=cy+r*Math.sin(toRad(start-90));
    const x2=cx+r*Math.cos(toRad(end-90)),y2=cy+r*Math.sin(toRad(end-90));
    const large=end-start>180?1:0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  const cx=size/2,cy=size/2,r=size/2-4;
  return(
    <svg width={size} height={size} style={{flexShrink:0}}>
      {slices.map((s,i)=>(
        <path key={i} d={describeArc(cx,cy,r,s.startAngle,s.startAngle+s.angle)} fill={s.color} stroke="#070d1a" strokeWidth={2}/>
      ))}
      <circle cx={cx} cy={cy} r={r*0.55} fill="#0d1a2e"/>
    </svg>
  );
}

// ── MODAL ─────────────────────────────────────────────────────
function Modal({children,onClose}){
  return(
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div/>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"4px 12px",border:"1px solid #1e3048",fontSize:18,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App(){
  const isMobile=useIsMobile();
  const [screen,setScreen]=useState("landing");
  const [tab,setTab]=useState("dashboard");
  const [fMes,setFMes]=useState(3);
  const [fAno,setFAno]=useState(2026);

  const [trans,setTrans]=useLS("fin_trans_v6",[]);
  const [pend,setPend]=useLS("fin_pend_v6",[]);
  const [contas,setContas]=useLS("fin_contas_v6",DEF_CONTAS);
  const [orcs,setOrcs]=useLS("fin_orcs_v6",DEF_ORC);
  const [snaps,setSnaps]=useLS("fin_snaps_v6",DEF_SNAPS);

  const [cats,setCats]=useLS("fin_cats_v6",DEFAULT_CATS);

  const allData=useMemo(()=>({trans,pend,contas,orcs,snaps,cats}),[trans,pend,contas,orcs,snaps,cats]);
  const handleDriveLoad=useCallback(json=>{
    if(json.trans)setTrans(json.trans);if(json.pend)setPend(json.pend);
    if(json.contas)setContas(json.contas);if(json.orcs)setOrcs(json.orcs);
    if(json.snaps)setSnaps(json.snaps);if(json.cats)setCats(json.cats);
  },[setTrans,setPend,setContas,setOrcs,setSnaps,setCats]);
  const {status:driveStatus,signIn,signOut,isConnected,fileId:driveFileId}=useDriveSync(allData,handleDriveLoad);
  const {shareCode,shareStatus,generateShareCode,isGuest,loadAsGuest,stopGuest}=useShareMode(null,driveFileId,handleDriveLoad);
  const isReadOnly=isGuest;

  const [pEd,setPEd]=useState({});
  const [editId,setEditId]=useState(null);
  const [editD,setEditD]=useState({});
  const [orcEdit,setOrcEdit]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const [simExtra,setSimExtra]=useState(0);
  const [newSnap,setNewSnap]=useState("");
  const [dismissedAlerts,setDismissedAlerts]=useState(new Set());
  const [search,setSearch]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [catModal,setCatModal]=useState(null); // cat name to show transactions
  const [newCatModal,setNewCatModal]=useState(false);
  const [newCat,setNewCat]=useState({nome:"",icon:"📌",color:"#3b82f6",sub:""});
  const [catEditModal,setCatEditModal]=useState(false);
  const fileRef=useRef();

  const mesKey=`${fAno}-${String(fMes+1).padStart(2,"0")}`;
  const orcMes=orcs[mesKey]||{};
  const totalOrçamentado=Object.values(orcMes).reduce((a,b)=>a+b,0);

  const processar=useCallback(text=>{
    const novas=parseLines(text,cats);
    if(!novas.length){setImportMsg("Nenhuma transação encontrada.");return;}
    const existingIds=new Set(trans.map(t=>t.desc+t.data+t.val));
    const novasFiltradas=novas.filter(t=>!existingIds.has(t.desc+t.data+t.val));
    if(!novasFiltradas.length){setImportMsg("Sem movimentos novos — já importados anteriormente.");return;}
    setPend(novasFiltradas);
    setTab("categorizar");
    const preench=novasFiltradas.filter(t=>t.ok).length;
    const semCat=novasFiltradas.filter(t=>!t.ok).length;
    setImportMsg(`${novasFiltradas.length} movimentos para rever · ${preench} pré-preenchidos · ${semCat} por categorizar`);
  },[cats,trans,setPend]);

  const handleFile=f=>{if(!f)return;const r=new FileReader();r.onload=e=>processar(e.target.result);r.readAsText(f,"utf-8");};
  const isInt=t=>t.cat==="Transferência Interna"||t.cat==="Poupança";

  const transMes=trans.filter(t=>{const[y,m]=t.data.split("-");return parseInt(m)-1===fMes&&parseInt(y)===fAno;});

  // Running balance: sort by date, calculate saldo after each
  const transMesWithBalance = useMemo(()=>{
    const sorted=[...transMes].sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id));
    let bal=0;
    return sorted.map(t=>{
      if(!isInt(t)) bal+=(t.tipo==="c"?t.val:-t.val);
      return{...t,saldoApos:bal};
    }).reverse();
  },[transMes]);

  const desp=transMes.filter(t=>t.tipo==="d"&&!isInt(t));
  const rec=transMes.filter(t=>t.tipo==="c"&&!isInt(t));
  const totD=desp.reduce((a,t)=>a+t.val,0);
  const totR=rec.reduce((a,t)=>a+t.val,0);

  const catData=useMemo(()=>{
    const d={};
    transMes.filter(t=>!isInt(t)).forEach(t=>{
      if(!d[t.cat])d[t.cat]={out:0,in:0,subs:{}};
      if(t.tipo==="d"){d[t.cat].out+=t.val;if(!d[t.cat].subs[t.sub])d[t.cat].subs[t.sub]=0;d[t.cat].subs[t.sub]+=t.val;}
      else d[t.cat].in+=t.val;
    });
    return d;
  },[transMes]);

  const alerts=useMemo(()=>
    Object.entries(catData).filter(([cat])=>orcMes[cat]).map(([cat,d])=>{
      const orc=orcMes[cat],net=NET_CATS.has(cat)?d.out-d.in:d.out,pct=net/orc*100;
      return{cat,net,orc,pct};
    }).filter(a=>a.pct>=80).sort((a,b)=>b.pct-a.pct)
  ,[catData,orcMes]);

  const pieData=useMemo(()=>
    Object.entries(catData).filter(([c])=>c!=="Receita"&&!isInt({cat:c})).map(([cat,d])=>({
      cat,val:NET_CATS.has(cat)?Math.max(0,d.out-d.in):d.out,color:cats[cat]?.color||"#64748b"
    })).filter(d=>d.val>0).sort((a,b)=>b.val-a.val).slice(0,8)
  ,[catData,cats]);

  const appSaldo=contas.find(c=>c.id==="app")?.saldo||1350;
  const progressL1=Math.min((appSaldo/10500)*100,100);
  const monthsLeft=Math.max(0,Math.ceil((10500-appSaldo)/(800+simExtra)));
  const latestSnap=snaps[snaps.length-1];
  const deviation=latestSnap.actual-latestSnap.planned;
  const patrimonioTotal=contas.reduce((a,c)=>a+c.saldo,0);

  // Filtered transactions for list
  const filteredTrans=useMemo(()=>{
    return transMesWithBalance.filter(t=>{
      if(search&&!t.desc.toLowerCase().includes(search.toLowerCase())&&!t.ent.toLowerCase().includes(search.toLowerCase())&&!t.cat.toLowerCase().includes(search.toLowerCase())) return false;
      if(dateFrom&&t.data<dateFrom) return false;
      if(dateTo&&t.data>dateTo) return false;
      return true;
    });
  },[transMesWithBalance,search,dateFrom,dateTo]);

  const confirmP=id=>{
    const ed=pEd[id]||{},t=pend.find(p=>p.id===id);if(!t)return;
    // Use edited values OR original auto-detected values
    const catFinal=ed.cat!==undefined?ed.cat:t.cat;
    const subFinal=ed.sub!==undefined?ed.sub:t.sub;
    const entFinal=ed.ent!==undefined?ed.ent:t.ent;
    if(ed.newCatName){const c={...cats};c[ed.newCatName]={icon:ed.newCatIcon||"📌",color:ed.newCatColor||"#3b82f6",subs:ed.newCatSub?[ed.newCatSub]:[]};setCats(c);}
    if(catFinal&&ed.newSubName&&cats[catFinal]){const c={...cats};c[catFinal]={...c[catFinal],subs:[...c[catFinal].subs,ed.newSubName]};setCats(c);}
    const finalTrans={...t,cat:catFinal,sub:subFinal,ent:entFinal,data:ed.data||t.data,nota:ed.nota||t.nota||"",ok:true,contaOrigem:ed.contaOrigem||"",contaDestino:ed.contaDestino||""};
    setTrans(prev=>{const ids=new Set(prev.map(t=>t.desc+t.data+t.val));return ids.has(finalTrans.desc+finalTrans.data+finalTrans.val)?prev:[...prev,finalTrans];});
    // Update account balances if transfer between accounts
    if(ed.contaOrigem&&ed.contaDestino){
      setContas(prev=>prev.map(c=>{
        if(c.id===ed.contaOrigem) return{...c,saldo:Math.max(0,c.saldo-t.val)};
        if(c.id===ed.contaDestino) return{...c,saldo:c.saldo+t.val};
        return c;
      }));
    } else if(catFinal==="Receita"&&ed.contaDestino){
      setContas(prev=>prev.map(c=>c.id===ed.contaDestino?{...c,saldo:c.saldo+t.val}:c));
    } else if(catFinal!=="Transferência Interna"&&catFinal!=="Receita"&&ed.contaOrigem){
      setContas(prev=>prev.map(c=>c.id===ed.contaOrigem?{...c,saldo:Math.max(0,c.saldo-t.val)}:c));
    }
    const r=pend.filter(p=>p.id!==id);setPend(r);if(!r.length)setTab("transacoes");
  };

  // Confirm all pre-filled at once
  const confirmAll=()=>{
    const toConfirm=pend.filter(t=>t.ok&&!pEd[t.id]?.cat===undefined);
    const preenchidos=pend.filter(t=>t.ok);
    setTrans(prev=>{
      const ids=new Set(prev.map(t=>t.desc+t.data+t.val));
      const novos=preenchidos.filter(t=>!ids.has(t.desc+t.data+t.val));
      return[...prev,...novos];
    });
    const remaining=pend.filter(t=>!t.ok);
    setPend(remaining);
    if(!remaining.length)setTab("transacoes");
  };
  const markInt=id=>{const t=pend.find(p=>p.id===id);if(!t)return;setTrans(prev=>[...prev,{...t,cat:"Transferência Interna",sub:"Outro",ok:true}]);const r=pend.filter(p=>p.id!==id);setPend(r);if(!r.length)setTab("transacoes");};
  const ignP=id=>{const r=pend.filter(p=>p.id!==id);setPend(r);if(!r.length)setTab("transacoes");};
  const saveEdit=id=>{setTrans(prev=>prev.map(t=>t.id===id?{...t,...editD}:t));setEditId(null);};
  const delT=id=>{setTrans(prev=>prev.filter(t=>t.id!==id));setEditId(null);};

  const exportJSON=()=>{const blob=new Blob([JSON.stringify({trans,pend,contas,orcs,snaps,cats},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="financa_backup.json";a.click();};
  const importJSON=f=>{if(!f)return;const r=new FileReader();r.onload=e=>{try{const j=JSON.parse(e.target.result);if(j.trans)setTrans(j.trans);if(j.pend)setPend(j.pend);if(j.contas)setContas(j.contas);if(j.orcs)setOrcs(j.orcs);if(j.snaps)setSnaps(j.snaps);if(j.cats)setCats(j.cats);}catch{alert("Ficheiro inválido");}};r.readAsText(f);};

  const addNewCat=()=>{
    if(!newCat.nome.trim()) return;
    const subs=newCat.sub.split(",").map(s=>s.trim()).filter(Boolean);
    setCats(prev=>({...prev,[newCat.nome]:{icon:newCat.icon,color:newCat.color,subs}}));
    setNewCat({nome:"",icon:"📌",color:"#3b82f6",sub:""});
    setNewCatModal(false);
  };

  // Cat transactions modal
  const catTransactions=catModal?transMes.filter(t=>t.cat===catModal):[];

  const px=isMobile?"14px":"24px";
  const mainPad=isMobile?"14px 14px 80px":"24px 28px";

  const navItems=[
    {id:"dashboard",label:"Início",icon:"◈"},
    {id:"orcamento",label:"Orçamento",icon:"◉"},
    {id:"transacoes",label:"Movimentos",icon:"≡"},
    {id:"categorizar",label:`Categorizar${pend.length?` (${pend.length})`:""}`,icon:"◎"},
    {id:"importar",label:"Importar",icon:"↑"},
  ];

  // ── LANDING ───────────────────────────────────────────────
  if(screen==="landing") return (
    <>
      <style>{CSS}</style>
      <div className="fade" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:`32px ${px}`,background:"linear-gradient(160deg,#070d1a 0%,#0d1a2e 60%,#070d1a 100%)"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:40,marginBottom:12}}>✦</div>
          <h1 style={{fontSize:isMobile?34:44,fontWeight:300,color:"#fff",letterSpacing:-2,marginBottom:6}}>finança<span style={{color:"#3b82f6",fontWeight:600}}>.</span></h1>
          <p style={{fontSize:13,color:"#64748b"}}>Hub financeiro pessoal · Ana · 2026</p>
          <div style={{marginTop:12}}><DriveBtn status={driveStatus} isConnected={isConnected} onSignIn={signIn} onSignOut={signOut}/></div>

        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:480,marginBottom:24}}>
          <div onClick={()=>setScreen("gestao")} style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:18,padding:20,cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#3b82f6";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#1e3048";}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontSize:24,width:44,height:44,background:"rgba(59,130,246,0.12)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>💳</div>
              <div><h2 style={{fontSize:16,fontWeight:600,color:"#fff",marginBottom:2}}>Gestão Mensal</h2><p style={{fontSize:12,color:"#64748b"}}>Extratos · Orçamento · Categorias</p></div>
              <span style={{marginLeft:"auto",color:"#3b82f6",fontSize:18}}>›</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{background:"rgba(59,130,246,0.08)",borderRadius:10,padding:"8px 12px"}}><p style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Saldo Abr</p><p style={{fontSize:16,fontWeight:600,color:"#3b82f6"}}>{fE0(totR-totD)}</p></div>
              <div style={{background:"rgba(239,68,68,0.08)",borderRadius:10,padding:"8px 12px"}}><p style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Despesas</p><p style={{fontSize:16,fontWeight:600,color:"#ef4444"}}>{fE0(totD)}</p></div>
            </div>
          </div>
          <div onClick={()=>setScreen("plano")} style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:18,padding:20,cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#22c55e";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="#1e3048";}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontSize:24,width:44,height:44,background:"rgba(34,197,94,0.12)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🎯</div>
              <div><h2 style={{fontSize:16,fontWeight:600,color:"#fff",marginBottom:2}}>Liberdade Financeira</h2><p style={{fontSize:12,color:"#64748b"}}>4 Níveis · Progresso · Simulador</p></div>
              <span style={{marginLeft:"auto",color:"#22c55e",fontSize:18}}>›</span>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:"#64748b"}}>Nível 1</span><span style={{fontSize:11,fontWeight:600,color:"#22c55e"}}>{progressL1.toFixed(1)}%</span></div>
              <PBar val={appSaldo} max={10500} color="#22c55e" h={7}/>
            </div>
            <div style={{display:"flex",gap:6,padding:"6px 10px",background:deviation>=0?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",borderRadius:8}}>
              <span style={{fontSize:11}}>{deviation>=0?"✅":"⚠️"}</span>
              <span style={{fontSize:11,color:deviation>=0?"#22c55e":"#ef4444"}}>{deviation>=0?"No plano":"Abaixo"} · {deviation>=0?"+":""}{fE0(deviation)}</span>
            </div>
          </div>
        </div>
        <div style={{width:"100%",maxWidth:480}}>
          <div style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:12,padding:"12px 16px",textAlign:"center",marginBottom:10}}>
            <p style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:2,marginBottom:4}}>Património Total</p>
            <p style={{fontSize:26,fontWeight:600,color:"#fff"}}>{fE(patrimonioTotal)}</p>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={exportJSON} style={{flex:1,padding:"10px",background:"rgba(59,130,246,0.1)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.2)",borderRadius:10,fontSize:12}}>↓ Exportar backup</button>
            <label style={{flex:1,padding:"10px",background:"rgba(255,255,255,0.04)",color:"#94a3b8",border:"1px solid #1e3048",borderRadius:10,fontSize:12,cursor:"pointer",textAlign:"center",display:"block"}}>↑ Importar backup<input type="file" accept=".json" style={{display:"none"}} onChange={e=>importJSON(e.target.files[0])}/></label>
          </div>
        </div>
      </div>
    </>
  );

  // ── PLANO ─────────────────────────────────────────────────
  if(screen==="plano") return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",paddingBottom:isMobile?80:0}}>
        <div style={{background:"#0a1220",borderBottom:"1px solid #1e3048",padding:`12px ${px}`,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:50}}>
          <button onClick={()=>setScreen("landing")} style={{background:"rgba(255,255,255,0.05)",color:"#94a3b8",padding:"6px 12px",border:"1px solid #1e3048",fontSize:12}}>← Hub</button>
          <p style={{fontSize:15,fontWeight:600,color:"#fff"}}>🎯 Liberdade Financeira</p>
        </div>
        <div style={{padding:mainPad,maxWidth:isMobile?undefined:860,margin:"0 auto"}} className="fade">
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {PLAN_LEVELS.map(lv=>{const isA=lv.id===1;return(
              <div key={lv.id} style={{background:"#0d1a2e",border:`1px solid ${isA?lv.color+"55":"#1e3048"}`,borderRadius:14,padding:12,opacity:isA?1:0.55}}>
                <div style={{width:22,height:22,borderRadius:6,background:lv.color+"22",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><span style={{fontSize:10,fontWeight:700,color:lv.color}}>{lv.id}</span></div>
                <p style={{fontSize:11,fontWeight:600,color:isA?lv.color:"#94a3b8",marginBottom:2}}>{lv.name}</p>
                <p style={{fontSize:10,color:"#64748b",marginBottom:4}}>{lv.desc}</p>
                <p style={{fontSize:13,fontWeight:700,color:"#fff"}}>{fE0(lv.target)}</p>
                {isA&&<p style={{fontSize:9,color:lv.color,marginTop:2,fontWeight:700,letterSpacing:1}}>ATIVO</p>}
              </div>
            );})}
          </div>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><p style={{fontSize:14,fontWeight:600,color:"#fff"}}>Nível 1 — Fundo 3 Meses</p><Chip label="Abr–Nov 2026" color="#22c55e" sm/></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#94a3b8"}}>Apparte</span><span style={{fontSize:14,fontWeight:600,color:"#22c55e"}}>{fE0(appSaldo)} / {fE0(10500)}</span></div>
            <PBar val={appSaldo} max={10500} color="#22c55e" h={10}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}><span style={{fontSize:11,color:"#64748b"}}>{progressL1.toFixed(1)}%</span><span style={{fontSize:11,color:"#64748b"}}>≈ {monthsLeft} meses</span></div>
          </Card>
          <Card>
            <p style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:12}}>Simulador</p>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><Lbl>Poupança extra/mês</Lbl><span style={{fontSize:16,fontWeight:600,color:"#3b82f6"}}>+{fE0(simExtra)}</span></div>
            <input type="range" min={0} max={500} step={50} value={simExtra} onChange={e=>setSimExtra(parseInt(e.target.value))} style={{background:"none",border:"none",padding:0,cursor:"pointer",width:"100%",height:36,marginBottom:10}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{label:"Total/mês",val:fE0(800+simExtra),color:"#22c55e"},{label:"Meses",val:`${monthsLeft}m`,color:"#3b82f6"},{label:"Conclusão",val:(()=>{const d=new Date(2026,3,1);d.setMonth(d.getMonth()+monthsLeft);return MESES[d.getMonth()]+" "+d.getFullYear();})(),color:"#f59e0b"}].map(k=>(
                <div key={k.label} style={{background:"#070d1a",borderRadius:10,padding:10}}><p style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p><p style={{fontSize:14,fontWeight:600,color:k.color}}>{k.val}</p></div>
              ))}
            </div>
          </Card>
          <Card>
            <p style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:12}}>Histórico mensal</p>
            {snaps.map((s,i)=>{const dev=s.actual-s.planned;return(
              <div key={i} style={{display:"flex",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #0d1a2e"}}>
                <span style={{fontSize:12,color:i===snaps.length-1?"#f59e0b":"#64748b",minWidth:64}}>{s.label}</span>
                <span style={{fontSize:12,color:"#64748b",minWidth:60}}>{fE0(s.planned)}</span>
                <span style={{fontSize:13,fontWeight:600,color:"#fff",flex:1}}>{fE0(s.actual)}</span>
                <span style={{fontSize:12,color:dev>=0?"#22c55e":"#ef4444"}}>{dev>=0?"+":""}{fE0(dev)}</span>
              </div>
            );})}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <input type="number" placeholder="Valor acumulado no Apparte (€)" value={newSnap} onChange={e=>setNewSnap(e.target.value)} style={{flex:1}}/>
              <Btn variant="primary" style={{fontSize:12,padding:"10px 12px",whiteSpace:"nowrap"}} onClick={()=>{
                const v=parseFloat(newSnap);if(isNaN(v))return;
                const last=snaps[snaps.length-1];let nm=last.month+1,ny=last.year;if(nm>11){nm=0;ny++;}
                const extras=(nm>=5?1000:0)+(nm>=7?1000:0)+(nm>=10?1000:0);
                const pl=Math.min(1000+800*Math.max(0,nm-3+(ny-2026)*12)+extras,10500);
                setSnaps(prev=>[...prev,{label:`${MESES[nm]} ${ny}`,year:ny,month:nm,planned:Math.max(1000,pl),actual:v,note:v>=pl?"✓ No plano":"⚠ Abaixo"}]);setNewSnap("");
              }}>Registar</Btn>
            </div>
          </Card>
          <Card>
            <p style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:4}}>Projeção — Nível 4</p>
            <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>Nov 2028 · 1.200 €/mês</p>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:8}}>
              {[{age:"Aos 40",v5:"68k",v8:"72k",v10:"76k"},{age:"Aos 45",v5:"155k",v8:"180k",v10:"210k"},{age:"Aos 50",v5:"290k",v8:"350k",v10:"430k"},{age:"Aos 55",v5:"470k",v8:"640k",v10:"860k"},{age:"Aos 60",v5:"700k",v8:"1.05M",v10:"1.6M"}].map(r=>(
                <div key={r.age} style={{background:"#070d1a",borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
                  <p style={{fontSize:10,fontWeight:600,color:"#94a3b8",marginBottom:4}}>{r.age}</p>
                  <p style={{fontSize:10,color:"#64748b",marginBottom:2}}>5%·{r.v5}</p>
                  <p style={{fontSize:11,color:"#06b6d4",fontWeight:600,marginBottom:2}}>8%·{r.v8}</p>
                  <p style={{fontSize:11,color:"#f59e0b",fontWeight:600}}>10%·{r.v10}</p>
                </div>
              ))}
            </div>
            <div style={{marginTop:10,padding:"10px 12px",background:"rgba(34,197,94,0.08)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:12,color:"#94a3b8"}}>Objetivo IF · Regra 4%</span>
              <span style={{fontSize:15,fontWeight:700,color:"#22c55e"}}>1.050.000 €</span>
            </div>
          </Card>
        </div>
        {isMobile&&<div className="tabbar"><button onClick={()=>setScreen("landing")}><span style={{fontSize:18}}>🏠</span>Hub</button><button onClick={()=>{setScreen("gestao");setTab("dashboard");}}><span style={{fontSize:18}}>💳</span>Gestão</button></div>}
      </div>
    </>
  );

  // ── GESTÃO MENSAL ─────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",minHeight:"100vh"}}>

        {/* Desktop sidebar */}
        {!isMobile&&(
          <div style={{width:210,background:"#0a1220",borderRight:"1px solid #1e3048",display:"flex",flexDirection:"column",padding:"16px 0",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
            <div style={{padding:"0 16px 14px",borderBottom:"1px solid #1e3048",marginBottom:10}}>
              <button onClick={()=>setScreen("landing")} style={{background:"none",color:"#64748b",padding:"3px 0",border:"none",fontSize:11,marginBottom:8,cursor:"pointer"}}>← Hub</button>
              <p style={{fontSize:15,fontWeight:600,color:"#fff",letterSpacing:-0.5}}>finança<span style={{color:"#3b82f6"}}>.</span></p>
            </div>
            <div style={{display:"flex",gap:4,padding:"6px 10px 10px",borderBottom:"1px solid #1e3048",marginBottom:6}}>
              <select value={fMes} onChange={e=>setFMes(parseInt(e.target.value))} style={{flex:1,fontSize:12,padding:"5px 6px"}}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
              <select value={fAno} onChange={e=>setFAno(parseInt(e.target.value))} style={{width:62,fontSize:12,padding:"5px 6px"}}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div>
            {[...navItems,{id:"contas",label:"Contas",icon:"◇"},{id:"categorias",label:"Categorias",icon:"⊞"}].map(n=>(
              <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",fontSize:13,fontWeight:tab===n.id?600:400,color:tab===n.id?"#fff":"#64748b",background:tab===n.id?"rgba(59,130,246,0.12)":"transparent",borderLeft:tab===n.id?"3px solid #3b82f6":"3px solid transparent",border:"none",width:"100%",textAlign:"left",cursor:"pointer"}}>
                <span style={{fontFamily:"monospace",fontSize:12}}>{n.icon}</span><span>{n.label}</span>
              </button>
            ))}
            <div style={{marginTop:"auto",padding:"12px 16px",borderTop:"1px solid #1e3048"}}>
              <div style={{marginBottom:8}}><DriveBtn status={driveStatus} isConnected={isConnected} onSignIn={signIn} onSignOut={signOut}/></div>
              <p style={{fontSize:11,color:"#64748b"}}>Património</p>
              <p style={{fontSize:14,fontWeight:600,color:"#22c55e"}}>{fE0(patrimonioTotal)}</p>
            </div>
          </div>
        )}

        {/* Main */}
        <div style={{flex:1,padding:mainPad,overflowY:"auto",minWidth:0}} className="fade">


          {isMobile&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <p style={{fontSize:17,fontWeight:600,color:"#fff"}}>{navItems.find(n=>n.id===tab)?.label||tab}</p>
                <p style={{fontSize:11,color:"#64748b"}}>{MESES[fMes]} {fAno}</p>
              </div>
              <div style={{display:"flex",gap:6}}>
                <select value={fMes} onChange={e=>setFMes(parseInt(e.target.value))} style={{fontSize:12,padding:"6px 8px",width:"auto"}}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
                <select value={fAno} onChange={e=>setFAno(parseInt(e.target.value))} style={{fontSize:12,padding:"6px 6px",width:"auto"}}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {tab==="dashboard"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Dashboard</p><p style={{fontSize:12,color:"#64748b",marginBottom:14}}>{MESES[fMes]} {fAno}</p></>}
              {alerts.filter(a=>!dismissedAlerts.has(a.cat)).length>0&&(
                <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
                  <p style={{fontSize:12,fontWeight:600,color:"#ef4444",marginBottom:6}}>⚠️ Alertas de orçamento</p>
                  {alerts.filter(a=>!dismissedAlerts.has(a.cat)).map(a=>(
                    <div key={a.cat} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                      <input type="checkbox" onChange={()=>setDismissedAlerts(prev=>{const n=new Set(prev);n.add(a.cat);return n;})}
                        style={{width:14,height:14,cursor:"pointer",accentColor:"#3b82f6",flexShrink:0}}/>
                      <div style={{flex:1,display:"flex",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setCatModal(a.cat)}>
                        <span style={{fontSize:12,color:"#94a3b8"}}>{cats[a.cat]?.icon} {a.cat}</span>
                        <span style={{fontSize:12,color:a.pct>=100?"#ef4444":"#f59e0b",fontWeight:600}}>{a.pct.toFixed(0)}% · {fE0(a.net)}/{fE0(a.orc)}</span>
                      </div>
                    </div>
                  ))}
                  <p style={{fontSize:10,color:"#64748b",marginTop:6}}>✓ marca para ignorar este mês</p>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                {[{label:"Receitas",val:totR,color:"#22c55e"},{label:"Despesas",val:totD,color:"#ef4444"},{label:"Saldo",val:totR-totD,color:totR>=totD?"#22c55e":"#ef4444"},{label:"Movimentos",val:transMes.length,color:"#3b82f6",n:true}].map(k=>(
                  <div key={k.label} style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:12,padding:"12px 14px"}}>
                    <p style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p>
                    <p style={{fontSize:18,fontWeight:600,color:k.color}}>{k.n?k.val:fE0(k.val)}</p>
                  </div>
                ))}
              </div>

              {/* Contas */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><p style={{fontSize:14,fontWeight:600,color:"#fff"}}>Contas</p><button onClick={()=>setTab("contas")} style={{background:"none",border:"none",color:"#3b82f6",fontSize:12,cursor:"pointer"}}>Gerir →</button></div>
                <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                  {contas.map(c=>(
                    <div key={c.id} style={{background:"#070d1a",border:`1px solid ${c.cor}33`,borderRadius:10,padding:"10px 12px",flexShrink:0,minWidth:95}}>
                      <p style={{fontSize:15,marginBottom:3}}>{c.icon}</p>
                      <p style={{fontSize:10,color:"#64748b",marginBottom:2,whiteSpace:"nowrap"}}>{c.nome}</p>
                      <p style={{fontSize:13,fontWeight:600,color:"#fff"}}>{fE0(c.saldo)}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Pie chart + legend */}
              {pieData.length>0&&(
                <Card>
                  <p style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:14}}>Distribuição de despesas</p>
                  <div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:20,alignItems:"center",justifyContent:"center"}}>
                    <div style={{flexShrink:0}}>
                      <PieChart data={pieData} size={isMobile?150:170}/>
                    </div>
                    <div style={{width:"100%",maxWidth:320}}>
                      {(()=>{const total=pieData.reduce((a,x)=>a+x.val,0);return pieData.map(d=>{
                        const pct=total>0?Math.round(d.val/total*100):0;
                        return(
                          <div key={d.cat} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #0d1a2e",cursor:"pointer"}} onClick={()=>setCatModal(d.cat)}>
                            <div style={{width:10,height:10,borderRadius:3,background:d.color,flexShrink:0}}/>
                            <span style={{fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#e2e8f0"}}>{cats[d.cat]?.icon} {d.cat}</span>
                            <span style={{fontSize:11,color:"#64748b",flexShrink:0,width:32,textAlign:"right"}}>{pct}%</span>
                            <span style={{fontSize:12,fontWeight:600,color:"#fff",flexShrink:0,width:52,textAlign:"right"}}>{fE0(d.val)}</span>
                          </div>
                        );
                      });})()}
                    </div>
                  </div>
                </Card>
              )}

              {/* Monthly bar */}
              {transMes.length===0&&<Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:"#64748b",fontSize:14}}>Sem dados. Importa o extrato.</p></Card>}
            </div>
          )}

          {/* ORÇAMENTO */}
          {tab==="orcamento"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Orçamento</p><p style={{fontSize:12,color:"#64748b",marginBottom:14}}>{MESES[fMes]} {fAno}</p></>}
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                <Btn variant={orcEdit?"primary":"ghost"} onClick={()=>setOrcEdit(!orcEdit)} style={{fontSize:12,padding:"7px 14px"}}>{orcEdit?"Fechar":"Editar valores"}</Btn>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                {[{label:"Orçamentado",val:totalOrçamentado,color:"#3b82f6"},{label:"Gasto",val:totD,color:totD>totalOrçamentado?"#ef4444":"#e2e8f0"},{label:"Disponível",val:Math.max(0,totalOrçamentado-totD),color:"#22c55e"}].map(k=>(
                  <div key={k.label} style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:12,padding:"10px 12px"}}>
                    <p style={{fontSize:9,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p>
                    <p style={{fontSize:15,fontWeight:600,color:k.color}}>{fE0(k.val)}</p>
                  </div>
                ))}
              </div>
              <Card>
                {Object.keys(cats).filter(c=>!["Transferência Interna","Receita","Poupança"].includes(c)).map(cat=>{
                  const cfg=cats[cat],orc=orcMes[cat]||0,d=catData[cat]||{out:0,in:0,subs:{}};
                  const net=NET_CATS.has(cat)?d.out-d.in:d.out,over=net>orc&&orc>0;
                  return(
                    <div key={cat} style={{marginBottom:12,paddingBottom:12,borderBottom:"1px solid #1e3048"}}>
                      {/* Category header — clickable */}
                      <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:4}} onClick={()=>setCatModal(cat)}>
                        <span style={{fontSize:16,width:22,flexShrink:0}}>{cfg.icon}</span>
                        <span style={{fontSize:13,fontWeight:600,flex:1}}>{cat}</span>
                        <span style={{fontSize:13,fontWeight:600,color:over?"#ef4444":orc===0?"#64748b":"#fff"}}>{fE0(net)}</span>
                        {NET_CATS.has(cat)&&d.in>0&&<span style={{fontSize:10,color:"#22c55e"}}>-{fE0(d.in)}</span>}
                        {orcEdit?(
                          <input type="number" defaultValue={orc||""} placeholder="0" onClick={e=>e.stopPropagation()}
                            style={{width:70,textAlign:"right",padding:"4px 8px",fontSize:12}}
                            onBlur={e=>{const v=parseFloat(e.target.value)||0;setOrcs(prev=>({...prev,[mesKey]:{...(prev[mesKey]||{}),[cat]:v}}));}}/>
                        ):<span style={{fontSize:10,color:"#64748b",whiteSpace:"nowrap"}}>/{fE0(orc)}</span>}
                      </div>
                      {orc>0&&(()=>{const pct=orc>0?net/orc*100:0;const barColor=pct>=100?"#ef4444":pct>=75?"#f59e0b":"#22c55e";return<><PBar val={net} max={orc} color={barColor}/><div style={{display:"flex",justifyContent:"space-between",marginTop:2}}><span style={{fontSize:9,color:"#64748b"}}>{pct.toFixed(0)}%</span><span style={{fontSize:9,color:over?"#ef4444":"#64748b"}}>{over?`+${fE0(net-orc)} acima`:`${fE0(orc-net)} livre`}</span></div></>})()}
                      {/* Subcategories */}
                      {Object.entries(d.subs||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([sub,val])=>(
                        <div key={sub} style={{display:"flex",justifyContent:"space-between",padding:"2px 0 2px 30px",marginTop:3}}>
                          <span style={{fontSize:11,color:"#64748b"}}>{sub||"Sem subcategoria"}</span>
                          <span style={{fontSize:11,color:"#94a3b8"}}>{fE0(val)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {/* TRANSAÇÕES */}
          {tab==="transacoes"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Transações</p><p style={{fontSize:12,color:"#64748b",marginBottom:12}}>{transMes.length} movimentos · {MESES[fMes]} {fAno}</p></>}
              {/* Filters */}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                <input placeholder="🔍 Pesquisar por descrição, entidade ou categoria..." value={search} onChange={e=>setSearch(e.target.value)} style={{fontSize:13}}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><Lbl>De</Lbl><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
                  <div><Lbl>Até</Lbl><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
                </div>
                {(search||dateFrom||dateTo)&&<button onClick={()=>{setSearch("");setDateFrom("");setDateTo("");}} style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"none",padding:"6px",fontSize:12,borderRadius:8}}>✕ Limpar filtros</button>}
              </div>
              {!filteredTrans.length&&<Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:"#64748b",fontSize:14}}>Sem transações.</p></Card>}
              {filteredTrans.map(t=>(
                <div key={t.id}>
                  {editId===t.id?(
                    <Card>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                        <div><Lbl>Data</Lbl><input type="date" value={editD.data} onChange={e=>setEditD(d=>({...d,data:e.target.value}))}/></div>
                        <div><Lbl>Entidade</Lbl><input type="text" value={editD.ent} onChange={e=>setEditD(d=>({...d,ent:e.target.value}))}/></div>
                        <div><Lbl>Categoria</Lbl><select value={editD.cat} onChange={e=>setEditD(d=>({...d,cat:e.target.value,sub:""}))}>
                          {Object.keys(cats).map(c=><option key={c} value={c}>{c}</option>)}
                        </select></div>
                        <div><Lbl>Subcategoria</Lbl><select value={editD.sub} onChange={e=>setEditD(d=>({...d,sub:e.target.value}))}>
                          <option value="">—</option>{(cats[editD.cat]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                        </select></div>
                      </div>
                      <div style={{marginBottom:8}}><Lbl>Nota</Lbl><input type="text" value={editD.nota||""} placeholder="Nota opcional..." onChange={e=>setEditD(d=>({...d,nota:e.target.value}))}/></div>
                      <div style={{display:"flex",gap:8}}>
                        <Btn variant="primary" onClick={()=>saveEdit(t.id)} full>Guardar</Btn>
                        <Btn onClick={()=>setEditId(null)}>Cancelar</Btn>
                        <Btn variant="danger" onClick={()=>delT(t.id)}>×</Btn>
                      </div>
                    </Card>
                  ):(
                    <div style={{padding:"10px 0",borderBottom:"1px solid #0d1a2e"}} onClick={()=>{setEditId(t.id);setEditD({cat:t.cat,sub:t.sub,ent:t.ent,data:t.data,nota:t.nota||""});}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
                        <div style={{flex:1,minWidth:0,marginRight:8}}>
                          <p style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.ent||t.desc}</p>
                          <p style={{fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</p>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <p style={{fontSize:14,fontWeight:600,color:t.tipo==="c"?"#22c55e":isInt(t)?"#64748b":"#e2e8f0"}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</p>
                          <p style={{fontSize:10,color:"#64748b"}}>saldo {fE(t.saldoApos)}</p>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:"#64748b"}}>{t.data.slice(5).split("-").reverse().join("/")}</span>
                        {t.cat&&<Chip label={`${cats[t.cat]?.icon||""} ${t.cat}`} color={cats[t.cat]?.color||"#64748b"} sm/>}
                        {t.sub&&<span style={{fontSize:10,color:"#94a3b8"}}>· {t.sub}</span>}
                        {t.nota&&<span style={{fontSize:10,color:"#f59e0b"}}>📝 {t.nota}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* CATEGORIZAR — estilo Boonzi: lista com pré-preenchimento */}
          {tab==="categorizar"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Categorizar movimentos</p><p style={{fontSize:12,color:"#64748b",marginBottom:12}}>{pend.length} movimentos · {pend.filter(t=>t.ok).length} pré-preenchidos · {pend.filter(t=>!t.ok).length} por categorizar</p></>}
              {!pend.length&&<Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:"#64748b",fontSize:14}}>Tudo categorizado ✓</p></Card>}
              {pend.length>0&&(
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  <Btn variant="success" style={{fontSize:12,padding:"8px 16px"}} onClick={()=>{
                    const preench=pend.filter(t=>t.ok);
                    setTrans(prev=>{const ids=new Set(prev.map(t=>t.desc+t.data+t.val));return[...prev,...preench.filter(t=>!ids.has(t.desc+t.data+t.val))];});
                    setPend(pend.filter(t=>!t.ok));
                    if(pend.filter(t=>!t.ok).length===0)setTab("transacoes");
                  }}>✓ Confirmar {pend.filter(t=>t.ok).length} pré-preenchidos</Btn>
                  <Btn variant="primary" style={{fontSize:12,padding:"8px 16px"}} onClick={()=>{
                    setTrans(prev=>{const ids=new Set(prev.map(t=>t.desc+t.data+t.val));return[...prev,...pend.filter(t=>!ids.has(t.desc+t.data+t.val))];});
                    setPend([]);setTab("transacoes");
                  }}>✓✓ Confirmar todos ({pend.length})</Btn>
                </div>
              )}
              {/* Lista compacta estilo Boonzi */}
              <div style={{background:"#0d1a2e",border:"1px solid #1e3048",borderRadius:16,overflow:"hidden"}}>
                {/* Header */}
                <div style={{display:"grid",gridTemplateColumns:isMobile?"90px 1fr 90px":"100px 2fr 160px 150px 100px",gap:8,padding:"10px 16px",borderBottom:"1px solid #1e3048",background:"#0a1220"}}>
                  {["Data","Descrição / Entidade",isMobile?"":"Categoria",isMobile?"":"Subcategoria","Valor"].filter(Boolean).map(h=>(
                    <span key={h} style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>{h}</span>
                  ))}
                </div>
                {pend.map(t=>{
                  const ed=pEd[t.id]||{};
                  const catA=ed.cat!==undefined?ed.cat:t.cat;
                  const subA=ed.sub!==undefined?ed.sub:t.sub;
                  const entA=ed.ent!==undefined?ed.ent:t.ent;
                  const isExpanded=ed.expanded;
                  const isPrefilled=t.ok&&!isExpanded;
                  return(
                    <div key={t.id} style={{borderBottom:"1px solid #0a1220"}}>
                      {/* Compact row */}
                      <div style={{display:"grid",gridTemplateColumns:isMobile?"90px 1fr 90px":"100px 2fr 160px 150px 100px",gap:8,padding:"9px 16px",alignItems:"center",background:!t.ok?"rgba(239,68,68,0.06)":isPrefilled?"transparent":"rgba(59,130,246,0.04)",cursor:"pointer"}}
                        onClick={()=>setPEd(p=>({...p,[t.id]:{...p[t.id],expanded:!isExpanded}}))}>
                        <span style={{fontSize:11,color:"#64748b",fontFamily:"monospace"}}>{t.data.slice(5).split("-").reverse().join("/")}</span>
                        <div style={{minWidth:0}}>
                          <p style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ok?"#e2e8f0":"#94a3b8"}}>{entA||t.desc}</p>
                          <p style={{fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</p>
                        </div>
                        {!isMobile&&(
                          <>
                            <div onClick={e=>e.stopPropagation()}>
                              <select value={catA} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],cat:e.target.value,sub:""}}))}
                                style={{fontSize:11,padding:"4px 6px",background:!catA?"rgba(239,68,68,0.1)":"#0f1d2e",borderColor:!catA?"rgba(239,68,68,0.4)":"#1e3048"}}>
                                <option value="">-- categorizar --</option>
                                {Object.keys(cats).map(c=><option key={c} value={c}>{cats[c].icon} {c}</option>)}
                              </select>
                            </div>
                            <div onClick={e=>e.stopPropagation()}>
                              <select value={subA} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],sub:e.target.value}}))}
                                style={{fontSize:11,padding:"4px 6px"}}>
                                <option value="">—</option>
                                {(cats[catA]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}}>
                          <span style={{fontSize:12,fontWeight:600,color:t.tipo==="c"?"#22c55e":"#e2e8f0",whiteSpace:"nowrap"}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</span>
                          <span style={{fontSize:10,color:"#64748b"}}>{isExpanded?"▲":"▼"}</span>
                        </div>
                      </div>
                      {/* Expanded detail */}
                      {isExpanded&&(
                        <div style={{padding:"12px 14px",background:"#070d1a",borderTop:"1px solid #1e3048"}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                            <div><Lbl>Data</Lbl><input type="date" defaultValue={t.data} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],data:e.target.value}}))} /></div>
                            <div><Lbl>Entidade</Lbl><input type="text" defaultValue={entA} placeholder="Ex: Continente" onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],ent:e.target.value}}))} /></div>
                            {isMobile&&<>
                              <div><Lbl>Categoria</Lbl>
                                <select value={catA} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],cat:e.target.value,sub:""}}))}>
                                  <option value="">Selecionar...</option>{Object.keys(cats).map(c=><option key={c} value={c}>{cats[c].icon} {c}</option>)}
                                </select>
                              </div>
                              <div><Lbl>Subcategoria</Lbl>
                                <select value={subA} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],sub:e.target.value}}))}>
                                  <option value="">—</option>{(cats[catA]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </>}
                            {(catA==="Transferência Interna"||catA==="Receita"||catA==="Poupança")&&(
                            <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                              <div><Lbl>Conta origem</Lbl>
                                <select value={ed.contaOrigem||""} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],contaOrigem:e.target.value}}))}>
                                  <option value="">— nenhuma —</option>
                                  {contas.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome} ({fE0(c.saldo)})</option>)}
                                </select>
                              </div>
                              <div><Lbl>Conta destino</Lbl>
                                <select value={ed.contaDestino||""} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],contaDestino:e.target.value}}))}>
                                  <option value="">— nenhuma —</option>
                                  {contas.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome} ({fE0(c.saldo)})</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                          {catA&&catA!=="Transferência Interna"&&catA!=="Receita"&&catA!=="Poupança"&&(
                            <div style={{gridColumn:"1/-1"}}><Lbl>Conta (débito de)</Lbl>
                              <select value={ed.contaOrigem||""} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],contaOrigem:e.target.value}}))}>
                                <option value="">— não actualizar saldo —</option>
                                {contas.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome} ({fE0(c.saldo)})</option>)}
                              </select>
                            </div>
                          )}
                          <div style={{gridColumn:"1/-1"}}><Lbl>Nota</Lbl><input type="text" defaultValue={t.nota} placeholder="Nota opcional..." onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],nota:e.target.value}}))} /></div>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <Btn variant="primary" style={{flex:1,fontSize:12,padding:"8px"}} onClick={()=>confirmP(t.id)}>✓ Confirmar</Btn>
                            <Btn variant="danger" style={{fontSize:12,padding:"8px 12px"}} onClick={()=>ignP(t.id)}>×</Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CONTAS */}
          {tab==="contas"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Contas</p><p style={{fontSize:12,color:"#64748b",marginBottom:14}}>Atualiza os saldos</p></>}
              {contas.map(c=>(
                <div key={c.id} style={{background:"#0d1a2e",border:`1px solid ${c.cor}44`,borderRadius:14,padding:16,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0}}>
                      <div style={{width:36,height:36,borderRadius:10,background:c.cor+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{c.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <input type="text" value={c.nome} onChange={e=>setContas(prev=>prev.map(x=>x.id===c.id?{...x,nome:e.target.value}:x))} style={{background:"none",border:"none",borderBottom:"1px solid #1e3048",borderRadius:0,padding:"2px 0",fontSize:13,fontWeight:600,color:"#fff",marginBottom:2}}/>
                        <p style={{fontSize:10,color:c.cor,textTransform:"uppercase"}}>{c.tipo}</p>
                      </div>
                    </div>
                    <p style={{fontSize:20,fontWeight:700,color:"#fff",flexShrink:0,marginLeft:10}}>{fE(c.saldo)}</p>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <input type="number" placeholder="Novo saldo..." style={{flex:1,fontSize:14}}
                      onChange={e=>e.target._val=e.target.value}
                      onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)){setContas(prev=>prev.map(x=>x.id===c.id?{...x,saldo:v}:x));e.target.value="";}}}
                      onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(e.target.value);if(!isNaN(v)){setContas(prev=>prev.map(x=>x.id===c.id?{...x,saldo:v}:x));e.target.value="";e.target.blur();}}}}/>
                    <button onClick={()=>setContas(prev=>prev.filter(x=>x.id!==c.id))} style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"none",padding:"10px 14px",borderRadius:10}}>×</button>
                  </div>
                </div>
              ))}
              <button onClick={()=>setContas(prev=>[...prev,{id:crypto.randomUUID(),nome:"Nova Conta",tipo:"corrente",saldo:0,cor:"#3b82f6",icon:"🏦"}])} style={{width:"100%",padding:"12px",background:"rgba(59,130,246,0.08)",color:"#3b82f6",border:"1px dashed rgba(59,130,246,0.3)",borderRadius:14,marginBottom:10,fontSize:14}}>+ Adicionar conta</button>
              <Card><div style={{display:"flex",justifyContent:"space-between"}}><div><p style={{fontSize:11,color:"#64748b",marginBottom:3}}>Património total</p><p style={{fontSize:24,fontWeight:700,color:"#22c55e"}}>{fE(patrimonioTotal)}</p></div></div></Card>
            </div>
          )}

          {/* CATEGORIAS */}
          {tab==="categorias"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Categorias</p><p style={{fontSize:12,color:"#64748b",marginBottom:14}}>Gere as tuas categorias e subcategorias</p></>}
              <Btn variant="primary" full onClick={()=>setNewCatModal(true)} style={{marginBottom:12,fontSize:13}}>+ Nova categoria</Btn>
              {Object.entries(cats).map(([cat,cfg])=>(
                <Card key={cat} style={{marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <span style={{fontSize:20}}>{cfg.icon}</span>
                    <span style={{fontSize:14,fontWeight:600,color:cfg.color,flex:1}}>{cat}</span>
                    <div style={{width:16,height:16,borderRadius:4,background:cfg.color}}/>
                    <button onClick={()=>{if(confirm(`Apagar categoria "${cat}"?`)){const c={...cats};delete c[cat];setCats(c);}}} style={{background:"none",border:"none",color:"#64748b",fontSize:16,cursor:"pointer",padding:"0 4px"}}>×</button>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {(cfg.subs||[]).map(s=>(
                      <div key={s} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.05)",borderRadius:20,padding:"3px 10px"}}>
                        <span style={{fontSize:11,color:"#94a3b8"}}>{s}</span>
                        <button onClick={()=>setCats(prev=>({...prev,[cat]:{...prev[cat],subs:prev[cat].subs.filter(x=>x!==s)}}))} style={{background:"none",border:"none",color:"#64748b",fontSize:12,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
                      </div>
                    ))}
                    <button onClick={()=>{const s=prompt("Nova subcategoria:");if(s)setCats(prev=>({...prev,[cat]:{...prev[cat],subs:[...(prev[cat].subs||[]),s]}}));}} style={{background:"rgba(59,130,246,0.1)",border:"none",color:"#3b82f6",borderRadius:20,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>+ subcategoria</button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* IMPORTAR */}
          {tab==="importar"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:"#fff",marginBottom:2}}>Importar</p><p style={{fontSize:12,color:"#64748b",marginBottom:14}}>Millennium BCP → Movimentos → Exportar</p></>}
              <Btn variant="primary" full onClick={()=>fileRef.current?.click()} style={{marginBottom:10,fontSize:14,padding:"14px"}}>↑ Selecionar ficheiro Excel</Btn>
              <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv,.txt" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
              <Card>
                <Lbl>Ou cola o conteúdo aqui</Lbl>
                <textarea rows={isMobile?5:7} placeholder={"Data valor\tDescrição\tMontante\tTipo\tSaldo\n03-04-2026\tCOMPRA CONTINENTE\t-23.10\tDébito\t4 043,60"}
                  onChange={e=>{if(e.target.value.includes("Débito")||e.target.value.includes("Crédito")){processar(e.target.value);e.target.value="";}}}
                  style={{resize:"vertical",fontFamily:"monospace",fontSize:12}}/>
              </Card>
              {importMsg&&<div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:10}}><p style={{fontSize:13,color:"#22c55e"}}>{importMsg}</p></div>}
              <Card>
                <p style={{fontSize:12,color:"#64748b",marginBottom:6}}>Base de dados · {trans.length} transações · {pend.length} por categorizar</p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <Btn onClick={exportJSON} style={{fontSize:12}}>↓ Exportar backup</Btn>
                  <label style={{background:"rgba(255,255,255,0.05)",color:"#94a3b8",border:"1px solid #1e3048",borderRadius:10,padding:"8px 14px",fontSize:12,cursor:"pointer"}}>↑ Importar backup<input type="file" accept=".json" style={{display:"none"}} onChange={e=>importJSON(e.target.files[0])}/></label>
                  <Btn variant="danger" style={{fontSize:12}} onClick={()=>{if(confirm("Apagar todas as transações?")){setTrans([]);setPend([]);}}}>Apagar</Btn>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Mobile tab bar */}
        {isMobile&&(
          <div className="tabbar">
            <button onClick={()=>setScreen("landing")}><span style={{fontSize:18}}>🏠</span>Hub</button>
            {navItems.map(n=><button key={n.id} className={tab===n.id?"act":""} onClick={()=>setTab(n.id)}><span style={{fontSize:18}}>{n.icon}</span>{n.label}</button>)}
          </div>
        )}
      </div>

      {/* MODAL: transações de uma categoria */}
      {catModal&&(
        <Modal onClose={()=>setCatModal(null)}>
          <p style={{fontSize:16,fontWeight:600,color:"#fff",marginBottom:4}}>{cats[catModal]?.icon} {catModal}</p>
          <p style={{fontSize:12,color:"#64748b",marginBottom:14}}>{catTransactions.length} movimentos · {MESES[fMes]} {fAno}</p>
          {catTransactions.length===0&&<p style={{color:"#64748b",fontSize:13}}>Sem movimentos nesta categoria.</p>}
          {catTransactions.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:"1px solid #1e3048"}}>
              <div style={{flex:1,minWidth:0,marginRight:8}}>
                <p style={{fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.ent||t.desc}</p>
                <p style={{fontSize:10,color:"#64748b"}}>{t.data.slice(5).split("-").reverse().join("/")} {t.sub&&`· ${t.sub}`}</p>
                {t.nota&&<p style={{fontSize:10,color:"#f59e0b"}}>📝 {t.nota}</p>}
              </div>
              <span style={{fontSize:13,fontWeight:600,color:t.tipo==="c"?"#22c55e":"#e2e8f0",flexShrink:0}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</span>
            </div>
          ))}
          <div style={{marginTop:14,padding:"10px",background:"rgba(255,255,255,0.03)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#64748b"}}>Total saídas</span>
            <span style={{fontSize:14,fontWeight:600,color:"#ef4444"}}>{fE(catTransactions.filter(t=>t.tipo==="d").reduce((a,t)=>a+t.val,0))}</span>
          </div>
          {catTransactions.some(t=>t.tipo==="c")&&<div style={{padding:"6px 10px",background:"rgba(34,197,94,0.08)",borderRadius:10,display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:13,color:"#64748b"}}>Reembolsos/entradas</span>
            <span style={{fontSize:14,fontWeight:600,color:"#22c55e"}}>{fE(catTransactions.filter(t=>t.tipo==="c").reduce((a,t)=>a+t.val,0))}</span>
          </div>}
        </Modal>
      )}

      {/* MODAL: nova categoria */}
      {newCatModal&&(
        <Modal onClose={()=>setNewCatModal(false)}>
          <p style={{fontSize:16,fontWeight:600,color:"#fff",marginBottom:16}}>Nova categoria</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div style={{gridColumn:"1/-1"}}><Lbl>Nome</Lbl><input placeholder="Ex: Viagens" value={newCat.nome} onChange={e=>setNewCat(c=>({...c,nome:e.target.value}))}/></div>
            <div><Lbl>Ícone</Lbl><input placeholder="✈️" value={newCat.icon} onChange={e=>setNewCat(c=>({...c,icon:e.target.value}))}/></div>
            <div><Lbl>Cor</Lbl><input type="color" value={newCat.color} onChange={e=>setNewCat(c=>({...c,color:e.target.value}))} style={{height:44,padding:4}}/></div>
            <div style={{gridColumn:"1/-1"}}><Lbl>Subcategorias (separadas por vírgula)</Lbl><input placeholder="Ex: Voos, Hotel, Actividades" value={newCat.sub} onChange={e=>setNewCat(c=>({...c,sub:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="primary" full onClick={addNewCat}>Criar categoria</Btn>
            <Btn onClick={()=>setNewCatModal(false)}>Cancelar</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
