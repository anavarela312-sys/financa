import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";

const JSONBIN_KEY = "$2a$10$y53iHt0gLHnxq5urwPKidOkZSeReMZBPVHcEj.y80zx2YEa1.3Bc.";
const JSONBIN_BIN = "69d3e796aaba882197cd93e9";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN}`;

function useJSONBinSync(data, onLoad) {
  const [status, setStatus] = useState("idle");
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(null);

  // Load data from JSONBin on mount
  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      try {
        const res = await fetch(JSONBIN_URL + "/latest", {
          headers: {
            "X-Master-Key": JSONBIN_KEY,
            "X-Bin-Meta": "false",
          }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && (json.trans?.length > 0 || (json.contas?.length > 0) || Object.keys(json.orcs||{}).length > 0)) {
            onLoad(json);
          }
        }
        setStatus("synced");
        // Start saving only after load is complete
        setTimeout(() => setReady(true), 2000);
      } catch { setStatus("error"); }
    };
    load();
  }, []);

  // Auto-save with debounce — only after initial load
  useEffect(() => {
    if (!ready || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await fetch(JSONBIN_URL, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Master-Key": JSONBIN_KEY,
          },
          body: JSON.stringify(data)
        });
        setStatus("synced");
      } catch { setStatus("error"); }
    }, 2500);
    return () => clearTimeout(saveTimer.current);
  }, [data, ready]);

  return { status };
}

function useLS(key, def) {
  const [val, setVal] = useState(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } });
  const set = useCallback(v => {
    const n = typeof v === "function" ? v(val) : v;
    setVal(n);
    try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
  }, [key, val]);
  // forceSet: overwrites localStorage AND state — used when Drive loads
  const forceSet = useCallback(v => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);
  return [val, set, forceSet];
}
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 640);
  useEffect(() => { const fn = () => setM(window.innerWidth < 640); window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn); }, []);
  return m;
}

// ── DEFAULT CATS (user can add more) ─────────────────────────
const DEFAULT_CATS = {
  "Casa":              { icon:"🏠", color:"#3b82f6", subs:["Água","Condomínio","Electricidade","Engomadoria","Gás","Limpeza","Mobília","Reparações","Renda","Seguro Casa","Seguro Vida","Supermercado","Vários"] },
  "Saúde":             { icon:"🏥", color:"#ef4444", subs:["Consultas","Medicamentos","Estética / Cuidados Pessoais","Ginásio","Exames","Fisioterapia","Transporte"] },
  "Alimentação":       { icon:"🍽️", color:"#f97316", subs:["Cafetaria","Restauração"] },
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
  "Transferência Interna":{ icon:"↔️", color:"#94a3b8", subs:["Poupança","Apparte / Mealheiro","Caixinha Saúde","Caixinha Casa","Caixinha Lexie","Caixinha Prendas","Caixinha Veterinário","Cartão Crédito","Entre Contas","Empresa","Outro"] },
  "Receita":           { icon:"💵", color:"#22c55e", subs:["Vencimento","Reembolso Saúde","Pagamento Cliente","Devolução","Cheque Digital","Outro"] },
};
const NET_CATS = new Set(["Saúde","Vários / Extras","Lexie"]);

const REGRAS = [
  { m:["TRF P/ Apparte - Mealheiro"], cat:"Transferência Interna", sub:"Poupança", ent:"Apparte" },
  { m:["TRF P/ Apparte - Saude"], cat:"Transferência Interna", sub:"Caixinha Saúde", ent:"Apparte" },
  { m:["TRF P/ Apparte - Casa"], cat:"Transferência Interna", sub:"Caixinha Casa", ent:"Apparte" },
  { m:["TRF P/ Apparte - Lexie"], cat:"Transferência Interna", sub:"Caixinha Lexie", ent:"Apparte" },
  { m:["TRF P/ Apparte - Prendas"], cat:"Transferência Interna", sub:"Caixinha Prendas", ent:"Apparte" },
  { m:["TRF P/ Apparte - Veterinario"], cat:"Transferência Interna", sub:"Caixinha Veterinário", ent:"Apparte" },
  { m:["TRF DE Apparte"], cat:"Transferência Interna", sub:"Apparte / Mealheiro", ent:"Apparte" },
  { m:["DD Optimize","OPTIMIZE INVES"], cat:"Transferência Interna", sub:"Poupança", ent:"Optimize" },
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
  { m:["CONTINENTE"], cat:"Casa", sub:"Supermercado", ent:"Continente" },
  { m:["MERCADONA"], cat:"Casa", sub:"Supermercado", ent:"Mercadona" },
  { m:["PINGO DOCE"], cat:"Casa", sub:"Supermercado", ent:"Pingo Doce" },
  { m:["INTERMARCHE"], cat:"Casa", sub:"Supermercado", ent:"Intermarché" },
  { m:["E.LECLERC"], cat:"Casa", sub:"Supermercado", ent:"E.Leclerc" },
  { m:["PINHALSODI","NOTE PINHAL","SUPER SABBER"], cat:"Casa", sub:"Supermercado", ent:"" },
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
  // Track sequence per day — banco exporta mais recente primeiro dentro do mesmo dia
  // seqInDay=0 = primeiro no ficheiro = mais recente = saldoExtrato é o correcto para fim do dia
  const seqByDay = {};
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
    const saldoExtrato = p[4]?parseVal(p[4].trim()):null;
    // seqInDay: posição dentro do mesmo dia no ficheiro original (0 = mais recente)
    if(seqByDay[data]===undefined) seqByDay[data]=0; else seqByDay[data]++;
    const seqInDay = seqByDay[data];
    out.push({ id:crypto.randomUUID(), data:r?.d1?nextMonth(data):data, dataOrig:data, desc, val:Math.abs(val), tipo:cr?"c":"d", cat:r?.cat||"", sub:r?.sub||"", ent:r?.ent||"", nota:"", ok:!!r, contaId:"mill", saldoExtrato, seqInDay });
  }
  return out.sort((a,b)=>b.data.localeCompare(a.data)||(a.seqInDay??99)-(b.seqInDay??99));
}

const CONTA_SECOES = [
  { id:"corrente",    label:"Contas Correntes",     icon:"🏦" },
  { id:"caixinha",    label:"Apparte — Caixinhas",  icon:"🏺" },
  { id:"investimento",label:"Investimento",          icon:"📈" },
];

const DEF_CONTAS=[
  // Correntes
  {id:"mill",  nome:"Millennium",       tipo:"corrente",    secao:"corrente",    saldo:0,    cor:"#3b82f6", icon:"🏦"},
  {id:"cart",  nome:"Carteira",         tipo:"corrente",    secao:"corrente",    saldo:0,    cor:"#78716c", icon:"👛"},
  {id:"ref_ana",nome:"Refeição Ana",    tipo:"corrente",    secao:"corrente",    saldo:0,    cor:"#6366f1", icon:"🍽️"},
  {id:"ref_joa",nome:"Refeição João",   tipo:"corrente",    secao:"corrente",    saldo:0,    cor:"#8b5cf6", icon:"🍽️"},
  // Caixinhas Apparte
  {id:"cx_meal",nome:"Mealheiro",       tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#22c55e", icon:"🏺"},
  {id:"cx_fer", nome:"Férias",          tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#10b981", icon:"✈️"},
  {id:"cx_vet", nome:"Veterinário",     tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#84cc16", icon:"🐾"},
  {id:"cx_cas", nome:"Casa",            tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#14b8a6", icon:"🏠"},
  {id:"cx_edu", nome:"Educação",        tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#06b6d4", icon:"📚"},
  {id:"cx_lex", nome:"Lexie",           tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#ec4899", icon:"👧"},
  {id:"cx_sau", nome:"Saúde",           tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#ef4444", icon:"🏥"},
  {id:"cx_pre", nome:"Prendas",         tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#a855f7", icon:"🎁"},
  {id:"cx_dep", nome:"Despesas Mensais",tipo:"caixinha",    secao:"caixinha",    saldo:0,    cor:"#f59e0b", icon:"📋"},
  // Poupança (vazia por agora)
  // Investimento
  {id:"opt_ana",nome:"Optimize Ana",    tipo:"investimento",secao:"investimento",saldo:0,    cor:"#06b6d4", icon:"📊"},
  {id:"opt_joa",nome:"Optimize João",   tipo:"investimento",secao:"investimento",saldo:0,    cor:"#0284c7", icon:"📊"},
  {id:"sag_ana",nome:"Save & Grow Ana", tipo:"investimento",secao:"investimento",saldo:0,    cor:"#10b981", icon:"🌱"},
  {id:"sag_joa",nome:"Save & Grow João",tipo:"investimento",secao:"investimento",saldo:0,    cor:"#059669", icon:"🌱"},
  {id:"ppr_lex",nome:"PPR Alves Ribeiro — Lexie",tipo:"investimento",secao:"investimento",saldo:0,cor:"#ec4899",icon:"👧"},
  {id:"xtb",   nome:"XTB",             tipo:"investimento",secao:"investimento",saldo:1400, cor:"#f59e0b", icon:"📈"},
];
// Migrate old accounts to new structure
function migrateContas(old) {
  if (!old || !old.length) return DEF_CONTAS;
  // Check if already migrated (has secao field)
  if (old[0]?.secao) return old;
  // Map old ids to new structure
  const map = {
    "mill": {secao:"corrente"},
    "app":  {secao:"caixinha", id:"cx_meal", nome:"Mealheiro", icon:"🏺"},
    "opt":  {secao:"investimento", id:"opt_ana", nome:"Optimize Ana", icon:"📊"},
    "xtb":  {secao:"investimento"},
    "cart": {secao:"corrente"},
    "lexc": {secao:"caixinha", id:"cx_lex", nome:"Lexie", icon:"👧"},
  };
  const migrated = old.map(c => {
    const m = map[c.id] || {secao:"corrente"};
    return {...c, ...m, secao: m.secao};
  });
  // Add missing new accounts that don't exist yet
  const existingIds = new Set(migrated.map(c => c.id));
  const missing = DEF_CONTAS.filter(c => !existingIds.has(c.id));
  return [...migrated, ...missing];
}

const DEF_ORC={"2026-04":{"Casa":1826,"Saúde":626,"Créditos":310,"Animais":161,"Alimentação":185,"Mensalidades":57,"Mina Santos":87,"Educação":112,"Lazer":75,"Lexie":51,"Prendas":31,"Carro":100,"Vários / Extras":100,"Investimento":100,"Donativos":11,"Despesas bancárias":10}};
const DEF_SNAPS=[{label:"Mar 2026",year:2026,month:2,planned:1000,actual:1000,note:"Início"},{label:"Abr 2026",year:2026,month:3,planned:1800,actual:1350,note:"Imprevistos"}];

// ── PATRIMONIO ────────────────────────────────────────────────
const PATRIMONIO_ATIVOS = [
  // Imobiliário
  { id:"casa",     label:"Casa Própria",          grupo:"imovel",      icon:"🏠", color:"#3b82f6", fixo:true },
  { id:"imovel2",  label:"Investimento Imobiliário",grupo:"imovel",    icon:"🏗️", color:"#6366f1", fixo:false },
  // PPR / Investimentos — v0=valor inicial Mar 2026, mensal=contribuição mensal
  { id:"ppr_lex",     label:"PPR Alves Ribeiro — Lexie",  grupo:"investimento",icon:"👧",color:"#ec4899", contaId:"ppr_lex",  v0:1856.85, mensal:0 },
  { id:"ppr_opt_ana", label:"PPR Optimize Ana",            grupo:"investimento",icon:"📊",color:"#06b6d4", contaId:"opt_ana",  v0:446.97,  mensal:25 },
  { id:"ppr_opt_joa", label:"PPR Optimize João",           grupo:"investimento",icon:"📊",color:"#0284c7", contaId:"opt_joa",  v0:546.57,  mensal:30 },
  { id:"ppr_grow_ana",label:"PPR Grow Ana",                grupo:"investimento",icon:"🌱",color:"#10b981", contaId:"sag_ana",  v0:3077.02, mensal:0 },
  { id:"ppr_grow_joa",label:"PPR Grow João",               grupo:"investimento",icon:"🌱",color:"#059669", contaId:"sag_joa",  v0:1278.74, mensal:0 },
  { id:"xtb",         label:"Investimento em Bolsa (XTB)", grupo:"investimento",icon:"📈",color:"#f59e0b", contaId:"xtb",      v0:1439.00, mensal:100 },
  // Liquidez
  { id:"aforro",      label:"Conta Aforro",          grupo:"liquidez",   icon:"🏦", color:"#64748b", contaId:"aforro" },
  { id:"apparte_total",label:"Apparte (total)",       grupo:"liquidez",   icon:"💰", color:"#22c55e", contaId:"cx_meal" },
];

const PATRIMONIO_PASSIVOS = [
  { id:"cred_hab",  label:"Crédito Habitação",     icon:"🏠", color:"#ef4444" },
  { id:"cred_pes",  label:"Crédito Pessoal Millennium", icon:"💳", color:"#f43f5e" },
];

const EMPRESA_ITEMS = [
  { id:"emp_dp",    label:"Depósito a Prazo",       icon:"🏦", color:"#f59e0b" },
  { id:"emp_outro", label:"Outros",                 icon:"📦", color:"#64748b" },
];

const DEF_PAT_SNAPSHOT = {
  mes: new Date().toISOString().slice(0,7),
  ativos: {},    // id -> { valor, investido }
  passivos: {},  // id -> valor
  empresa: {},   // id -> valor
};

const GRUPOS_ATIVOS = [
  { id:"imovel",       label:"Imobiliário",   icon:"🏠", color:"#3b82f6" },
  { id:"investimento", label:"Investimentos", icon:"📈", color:"#f59e0b" },
  { id:"liquidez",     label:"Liquidez",      icon:"💰", color:"#22c55e" },
];


// ── EMPRESA ───────────────────────────────────────────────────
const EMP_TAXA_DIARIA = 200.85;

const EMP_DESPESAS_FIXAS = [
  { id:"tsu",        label:"TSU / Segurança Social",     valor:347.50, icon:"🏛️",  cat:"rh" },
  { id:"leasing",    label:"Leasing CA Auto Bank",        valor:416.31, icon:"🚗",  cat:"fixo", nota:"Até Ago 2027" },
  { id:"inelconta",  label:"Inelconta (Contabilidade)",   valor:196.80, icon:"📊",  cat:"fixo" },
  { id:"cvfx_ref",   label:"Cover Flex — Refeição",       valor:240.00, icon:"🍽️", cat:"rh" },
  { id:"cvfx_inf",   label:"Cover Flex — Cheque Infância",valor:450.00, icon:"👧",  cat:"rh" },
  { id:"fidelidade", label:"Fidelidade — Seguro Saúde",   valor:135.47, icon:"🏥",  cat:"fixo" },
  { id:"salario",    label:"Salário João (líquido)",       valor:1000.00,icon:"👤",  cat:"rh" },
  { id:"ajudas",     label:"Ajudas de Custo / Kms",       valor:750.00, icon:"⛽",  cat:"rh", nota:"Variável" },
  { id:"vodafone",   label:"Vodafone",                    valor:103.75, icon:"📱",  cat:"fixo" },
  { id:"zoom",       label:"Zoom",                        valor:15.99,  icon:"💻",  cat:"fixo" },
  { id:"claude",     label:"Claude AI",                   valor:18.00,  icon:"🤖",  cat:"fixo" },
  { id:"irs_ret",    label:"Retenção IRS",                valor:14.00,  icon:"🏦",  cat:"fiscal" },
  { id:"metlife",    label:"Seguros Metlife",              valor:81.16,  icon:"🛡️",  cat:"fixo", nota:"11,02+16,59+17,62+13,13+22,80" },
];

const EMP_DESPESAS_PONTUAIS = [
  { id:"seg_carro",  label:"Seguro Carro (semestral)",    valor:571.00, icon:"🚘",  meses:[2,8] },
  { id:"seg_at",     label:"Seguro Acidentes Trabalho",   valor:130.00, icon:"⚕️",  meses:[0] },
];

// Categorias de despesas variáveis com taxa de tributação autónoma
const EMP_CATS_VARIAVEIS = [
  { id:"rep_refeicao",  label:"Refeição de negócio",        icon:"🍽️", ta:0.10 },
  { id:"rep_outro",     label:"Representação (outro)",       icon:"🤝",  ta:0.10 },
  { id:"desl_outro",    label:"Deslocação (outro)",          icon:"🚗",  ta:0.05 },
  { id:"material",      label:"Material de escritório",      icon:"📎",  ta:0 },
  { id:"software",      label:"Software / Subscrição",       icon:"💻",  ta:0 },
  { id:"formacao",      label:"Formação / Mentoria",         icon:"📚",  ta:0 },
  { id:"outro",         label:"Outro",                       icon:"📦",  ta:0 },
];

// TA rates
const EMP_TA_AJUDAS = 0.05; // 5% sobre ajudas de custo (dentro dos limites legais)
const EMP_TA_REP    = 0.10; // 10% sobre despesas de representação

const fE=n=>(n==null?"-":(+n).toLocaleString("pt-PT",{style:"currency",currency:"EUR",maximumFractionDigits:2}));
const fE0=n=>(n==null?"-":(+n).toLocaleString("pt-PT",{style:"currency",currency:"EUR",maximumFractionDigits:0}));
const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CAT_COLORS=["#3b82f6","#ef4444","#f97316","#84cc16","#6366f1","#ec4899","#8b5cf6","#eab308","#14b8a6","#f59e0b","#06b6d4","#22c55e","#a855f7","#78716c"];

// Meses com subsídios extra (Junho=5, Dezembro=11)
const EMP_MESES_SUBSIDIO = [5, 11];

const EMP_DIAS_UTEIS_BASE = {
  "2026-01":19,"2026-02":18,"2026-03":22,"2026-04":20,"2026-05":20,
  "2026-06":20,"2026-07":23,"2026-08":21,"2026-09":22,"2026-10":22,
  "2026-11":20,"2026-12":20
};

const EMP_OBRIGACOES = [
  { id:"irc_2025",label:"IRC 2025 (liquidação)",   data:"2026-05-31", valor_est:910.72, tipo:"irc" },
  { id:"iva_q1",  label:"IVA 1º Trim (Jan-Mar)",  data:"2026-05-15", valor_est:null, tipo:"iva" },
  { id:"iva_q2",  label:"IVA 2º Trim (Abr-Jun)",  data:"2026-08-15", valor_est:null, tipo:"iva" },
  { id:"iva_q3",  label:"IVA 3º Trim (Jul-Set)",  data:"2026-11-15", valor_est:null, tipo:"iva" },
  { id:"ppc1",    label:"Pagamento por Conta",     data:"2026-07-31", valor_est:134,  tipo:"irc" },
  { id:"ppc2",    label:"Pagamento por Conta",     data:"2026-09-30", valor_est:134,  tipo:"irc" },
  { id:"ppc3",    label:"Pagamento por Conta",     data:"2026-12-15", valor_est:134,  tipo:"irc" },
  { id:"seg_carro1",label:"Seguro Carro",          data:"2026-03-23", valor_est:571,  tipo:"seguro" },
  { id:"seg_carro2",label:"Seguro Carro",          data:"2026-09-23", valor_est:571,  tipo:"seguro" },
  { id:"seg_at",  label:"Seguro Acidentes Trab.",  data:"2026-01-01", valor_est:130,  tipo:"seguro" },
];

const PLAN_LEVELS=[{id:1,name:"Fundo 3 Meses",target:10500,color:"#22c55e",desc:"Rede mínima"},{id:2,name:"Limpar Crédito",target:16000,color:"#f59e0b",desc:"Dívida eliminada"},{id:3,name:"Fundo 6 Meses",target:21000,color:"#06b6d4",desc:"Rede robusta"},{id:4,name:"Investimento",target:1050000,color:"#8b5cf6",desc:"Independência"}];


// ── TEMA ─────────────────────────────────────────────────────
const DARK_THEME = {
  bg:       "#070d1a",
  bgAlt:    "#0a1220",
  bgCard:   "#0d1a2e",
  bgInput:  "#0f1d2e",
  border:   "#1e3048",
  text:     "#e2e8f0",
  textMid:  "#94a3b8",
  textLow:  "#64748b",
  textLow2: "#475569",
  hover:    "#0d1a2e",
  hoverRow: "rgba(0,0,0,0.04)",
  hoverCat: "rgba(59,130,246,0.10)",
  modalBg:  "rgba(0,0,0,0.7)",
};
const LIGHT_THEME = {
  bg:       "#f0ece4",   // warm parchment
  bgAlt:    "#e8e3d8",   // slightly darker warm
  bgCard:   "#faf8f4",   // cream white
  bgInput:  "#f5f2ec",   // input background
  border:   "#d5cfc4",   // warm grey border
  text:     "#1e2530",   // near-black warm
  textMid:  "#4a5568",   // medium grey
  textLow:  "#7a8694",   // low contrast
  textLow2: "#9aa3ad",   // very low
  hover:    "#ede9e0",
  hoverRow: "rgba(0,0,0,0.03)",
  hoverCat: "rgba(59,130,246,0.08)",
  modalBg:  "rgba(0,0,0,0.45)",
};

function buildCSS(th) {
  return `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;background:${th.bg};color:${th.text};font-family:'DM Sans',sans-serif;transition:background 0.25s,color 0.25s}
input,select,textarea{font-family:'DM Sans',sans-serif;background:${th.bgInput};border:1px solid ${th.border};color:${th.text};border-radius:10px;padding:10px 14px;font-size:14px;width:100%;outline:none;transition:border 0.15s;-webkit-appearance:none}
input:focus,select:focus,textarea:focus{border-color:#3b82f6}
select option{background:${th.bgInput};color:${th.text}}
button{font-family:'DM Sans',sans-serif;cursor:pointer;border:none;border-radius:10px;font-size:14px;font-weight:500;transition:all 0.15s;-webkit-tap-highlight-color:transparent}
button:active{transform:scale(0.97)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${th.border};border-radius:4px}
.fade{animation:fi 0.3s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.hrow:hover{background:${th.hover}}
.tabbar{position:fixed;bottom:0;left:0;right:0;background:${th.bgAlt};border-top:1px solid ${th.border};display:flex;z-index:100;padding-bottom:env(safe-area-inset-bottom)}
.tabbar button{flex:1;padding:10px 2px;background:none;border:none;display:flex;flex-direction:column;align-items:center;gap:2px;color:${th.textLow};font-size:10px;font-weight:500}
.tabbar button.act{color:#3b82f6}
.catrow{transition:background 0.12s}
.catrow:hover{background:${th.hoverCat} !important}
.trans-row:hover{background:${th.hoverRow} !important}
.modal-bg{position:fixed;inset:0;background:${th.modalBg};z-index:200;display:flex;align-items:flex-end;justify-content:center}
.modal{background:${th.bgCard};border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:600px;max-height:85vh;overflow-y:auto;border:1px solid ${th.border}}
@media(min-width:640px){.modal-bg{align-items:center}.modal{border-radius:20px;max-height:80vh}}

.card-default{background:${th.bgCard};border:1px solid ${th.border};border-radius:16px;padding:16px;margin-bottom:12px}
.sidebar-bg{background:${th.bgAlt};border-right:1px solid ${th.border}}
.topbar-bg{background:${th.bgAlt};border-bottom:1px solid ${th.border}}
.day-header-bg{background:${th.bgAlt}}
.chip-text{color:${th.text}}
`;
}

function PBar({val,max,color="#3b82f6",h=6}){
  const th=React.useContext(ThemeCtx)||{border:"#1e3048"};
  const pct=max>0?Math.min((val/max)*100,100):0;const over=val>max,warn=pct>75&&!over;
  return <div style={{background:th.border,borderRadius:100,height:h,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",borderRadius:100,background:over?"#ef4444":warn?"#f59e0b":color,transition:"width 0.5s"}}/></div>;
}
function Chip({label,color,sm}){return <span style={{display:"inline-flex",padding:sm?"1px 7px":"2px 10px",borderRadius:20,background:color+"22",color,fontSize:sm?10:11,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>;}
// Theme context — allows Card/Btn/Lbl to be theme-aware without prop drilling
const ThemeCtx = React.createContext(null);
function Card({children,style={},onClick}){
  const th=React.useContext(ThemeCtx)||{bgCard:"#0d1a2e",border:"#1e3048"};
  return <div onClick={onClick} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:16,padding:"16px",marginBottom:12,...style,cursor:onClick?"pointer":"default"}}>{children}</div>;
}
function Btn({children,variant="ghost",onClick,style={},full}){
  const th=React.useContext(ThemeCtx)||{border:"#1e3048"};
  const bg=variant==="primary"?"#3b82f6":variant==="success"?"#22c55e":variant==="danger"?"rgba(239,68,68,0.12)":`rgba(128,128,128,0.08)`;
  const color=variant==="primary"||variant==="success"?"#fff":variant==="danger"?"#ef4444":th.textMid||"#94a3b8";
  return <button onClick={onClick} style={{padding:"10px 16px",background:bg,color,border:variant==="ghost"?`1px solid ${th.border}`:"none",width:full?"100%":"auto",...style}}>{children}</button>;
}
function Lbl({children}){
  const th=React.useContext(ThemeCtx)||{textLow:"#64748b"};
  return <span style={{fontSize:11,color:th.textLow,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>{children}</span>;
}
function Modal({children,onClose}){
  const th=React.useContext(ThemeCtx)||{bgCard:"#0d1a2e",border:"#1e3048",textMid:"#94a3b8"};
  return(
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div/>
          <button onClick={onClose} style={{background:`rgba(128,128,128,0.08)`,color:th.textMid,padding:"4px 12px",border:`1px solid ${th.border}`,fontSize:18,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── PIE CHART ─────────────────────────────────────────────────
function PieChart({data,size=160}){
  const th=React.useContext(ThemeCtx)||{bg:"#070d1a",bgCard:"#0d1a2e"};
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
        <path key={i} d={describeArc(cx,cy,r,s.startAngle,s.startAngle+s.angle)} fill={s.color} stroke={th.bg} strokeWidth={2}/>
      ))}
      <circle cx={cx} cy={cy} r={r*0.55} fill={th.bgCard}/>
    </svg>
  );
}




// ── FIRE SIMULATOR CARD ───────────────────────────────────────────
function FireSimCard({autoCapital, autoMensal, th, darkMode, fE, fmtV}) {
  const [capital, setCapital] = React.useState(Math.round(autoCapital));
  const [mensal, setMensal] = React.useState(autoMensal);
  const [mensal2, setMensal2] = React.useState(1355); // 155€ actuais + 1200€ XTB
  const [fase2Ano, setFase2Ano] = React.useState(2.5); // Nov 2028 ≈ 2.5 anos
  const [despMensal, setDespMensal] = React.useState(3500);
  const [lf, setLf] = React.useState(500000);
  const [fire, setFire] = React.useState(()=>Math.round(3500*12/0.04));
  const [selYr, setSelYr] = React.useState(20);
  const [tooltip, setTooltip] = React.useState(null);

  const apply4pct = () => setFire(Math.round(despMensal * 12 / 0.04));

  const projYears = 40;
  const rates = {r5:5/100/12, r8:8/100/12, r10:10/100/12};
  // Projecção faseada: Fase 1 (mensal) até fase2Ano, depois Fase 2 (mensal2)
  const buildP = (rate) => {
    const pts=[]; let c=capital;
    const fase2Month = Math.round(fase2Ano * 12);
    for(let i=0;i<=projYears*12;i+=12){
      pts.push({yr:i/12, val:Math.round(c)});
      for(let m=0;m<12;m++){
        const contrib = (i+m) >= fase2Month ? mensal2 : mensal;
        c=c*(1+rate)+contrib;
      }
    }
    return pts;
  };
  const p5=buildP(rates.r5), p8=buildP(rates.r8), p10=buildP(rates.r10);

  // Find when each scenario reaches LF and FIRE
  const whenReach=(pts,target)=>{
    const pt=pts.find(p=>p.val>=target);
    return pt?pt.yr:null;
  };
  const fmtWhen=(yr)=>{
    if(yr===null) return "Não atingido";
    const anoReal = new Date().getFullYear() + yr;
    return `${yr}a (${anoReal})`;
  };

  const maxV = Math.max(...p10.map(p=>p.val), fire, lf, 1);
  const IPL=52,IPR=12,IPT=20,IPB=24,IW=600,IH=180;
  const innerIW=IW-IPL-IPR, innerIH=IH-IPT-IPB;
  const toIX=yr=>IPL+(yr/projYears)*innerIW;
  const toIY=v=>IPT+innerIH-((v/maxV)*innerIH);
  const xTicks=[0,5,10,15,20,25,30,35,40];
  const fmtAxis=v=>v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"k":"0";

  const selVals={v5:p5.find(p=>p.yr===selYr)?.val??0, v8:p8.find(p=>p.yr===selYr)?.val??0, v10:p10.find(p=>p.yr===selYr)?.val??0};
  const lines=[
    {pts:p5,color:"#94a3b8",label:"5%"},
    {pts:p8,color:"#06b6d4",label:"8%"},
    {pts:p10,color:"#f59e0b",label:"10%"},
  ];

  return(
    <ThemeCtx.Consumer>{()=>(
    <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:16,padding:16,marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:20}}>🔥</span>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:th.text}}>Simulador FIRE — Liberdade Financeira</p>
          <p style={{fontSize:10,color:th.textLow}}>Baseado em todos os investimentos excl. PPR Lexie</p>
        </div>
      </div>

      {/* Inputs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:14}}>
        <div>
          <span style={{fontSize:10,color:th.textLow,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Capital inicial (€)</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={capital} step="100"
              onChange={e=>setCapital(parseFloat(e.target.value)||0)}
              style={{fontSize:13,flex:1}}/>
            <button onClick={()=>setCapital(Math.round(autoCapital))}
              style={{background:"rgba(6,182,212,0.1)",color:"#06b6d4",border:`1px solid rgba(6,182,212,0.3)`,borderRadius:8,padding:"6px 10px",fontSize:11,whiteSpace:"nowrap"}}>
              ↺ auto
            </button>
          </div>
        </div>
        <div>
          <span style={{fontSize:10,color:th.textLow,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Contribuição mensal — Fase 1 (€)</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={mensal} step="10"
              onChange={e=>setMensal(parseFloat(e.target.value)||0)}
              style={{fontSize:13,flex:1}}/>
            <button onClick={()=>setMensal(autoMensal)}
              style={{background:"rgba(6,182,212,0.1)",color:"#06b6d4",border:`1px solid rgba(6,182,212,0.3)`,borderRadius:8,padding:"6px 10px",fontSize:11,whiteSpace:"nowrap"}}>
              ↺ auto
            </button>
          </div>
        </div>
        <div>
          <span style={{fontSize:10,color:th.textLow,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Contribuição Fase 2 (€) · a partir de</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={mensal2} step="100"
              onChange={e=>setMensal2(parseFloat(e.target.value)||0)}
              style={{fontSize:13,flex:1}}/>
            <span style={{fontSize:10,color:th.textLow,flexShrink:0}}>após</span>
            <input type="number" value={fase2Ano} step="0.5" min="0" max="40"
              onChange={e=>setFase2Ano(parseFloat(e.target.value)||0)}
              style={{fontSize:13,width:85}}/>
            <span style={{fontSize:10,color:th.textLow,flexShrink:0}}>anos</span>
          </div>
          <p style={{fontSize:9,color:th.textLow,marginTop:2}}>Ex: 1.200€/mês após atingir Nível 4 (~{new Date().getFullYear()+Math.round(fase2Ano)})</p>
        </div>
        <div>
          <span style={{fontSize:10,color:th.textLow,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Objectivo LF (€)</span>
          <input type="number" value={lf} step="10000"
            onChange={e=>setLf(parseFloat(e.target.value)||0)}
            style={{fontSize:13}}/>
        </div>
        <div>
          <span style={{fontSize:10,color:th.textLow,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Objectivo FIRE (€)</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={fire} step="10000"
              onChange={e=>setFire(parseFloat(e.target.value)||0)}
              style={{fontSize:13,flex:1}}/>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <input type="number" value={despMensal} step="100" title="Despesas mensais"
                onChange={e=>setDespMensal(parseFloat(e.target.value)||0)}
                style={{fontSize:11,width:72,padding:"6px 8px"}} placeholder="Desp/mês"/>
              <button onClick={apply4pct}
                style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:`1px solid rgba(239,68,68,0.3)`,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                4%
              </button>
            </div>
          </div>
          <p style={{fontSize:9,color:th.textLow,marginTop:3}}>Regra dos 4%: {fE(despMensal*12)} anuais → FIRE = {fE(despMensal*12/0.04)}</p>
        </div>
      </div>

      {/* Quando atinge */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {lines.map(({color,label})=>{
          const pts=label==="5%"?p5:label==="8%"?p8:p10;
          const yrLF=whenReach(pts,lf);
          const yrFIRE=whenReach(pts,fire);
          return(
            <div key={label} style={{background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:10,padding:"10px 12px",border:`1px solid ${color}33`}}>
              <p style={{fontSize:11,fontWeight:700,color,marginBottom:6}}>Cenário {label}</p>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div>
                  <p style={{fontSize:9,color:th.textLow}}>🌅 LF {fE(lf)}</p>
                  <p style={{fontSize:12,fontWeight:600,color:yrLF?color:th.textLow2}}>{fmtWhen(yrLF)}</p>
                </div>
                <div>
                  <p style={{fontSize:9,color:th.textLow}}>🔥 FIRE {fE(fire)}</p>
                  <p style={{fontSize:12,fontWeight:600,color:yrFIRE?color:th.textLow2}}>{fmtWhen(yrFIRE)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráfico */}
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <svg viewBox={`0 0 ${IW} ${IH}`} width="100%" height={IH} style={{overflow:"visible",cursor:"crosshair"}}
            onMouseLeave={()=>setTooltip(null)}>
            {/* Y grid */}
            {[0,0.25,0.5,0.75,1].map((p,i)=>{
              const v=maxV*p;
              return(<g key={i}>
                <line x1={IPL} y1={toIY(v)} x2={IW-IPR} y2={toIY(v)} stroke={th.border} strokeWidth="1" strokeDasharray="3,3"/>
                <text x={IPL-4} y={toIY(v)+4} textAnchor="end" fill={th.textLow} fontSize="9">{fmtAxis(v)}</text>
              </g>);
            })}
            {/* Eixos */}
            <line x1={IPL} y1={IPT} x2={IPL} y2={IH-IPB} stroke={th.border} strokeWidth="1"/>
            <line x1={IPL} y1={IH-IPB} x2={IW-IPR} y2={IH-IPB} stroke={th.border} strokeWidth="1"/>
            {/* Linha LF */}
            {lf<=maxV&&<>
              <line x1={IPL} y1={toIY(lf)} x2={IW-IPR} y2={toIY(lf)} stroke="#06b6d4" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
              <text x={IW-IPR+3} y={toIY(lf)+4} fill="#06b6d4" fontSize="8">LF</text>
            </>}
            {/* Linha FIRE */}
            {fire<=maxV&&<>
              <line x1={IPL} y1={toIY(fire)} x2={IW-IPR} y2={toIY(fire)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
              <text x={IW-IPR+3} y={toIY(fire)+4} fill="#ef4444" fontSize="8">FIRE</text>
            </>}
            {/* X ticks */}
            {xTicks.map(yr=>{
              const isSel=selYr===yr;
              const x=toIX(yr);
              return(<g key={yr} style={{cursor:"pointer"}} onClick={()=>setSelYr(yr)}>
                <line x1={x} y1={IPT} x2={x} y2={IH-IPB}
                  stroke={isSel?"#3b82f6":th.border} strokeWidth={isSel?2:1}
                  strokeDasharray={isSel?"none":"2,4"} opacity={isSel?0.9:0.4}/>
                <rect x={x-14} y={IH-IPB+2} width={28} height={16} rx={4}
                  fill={isSel?"#3b82f6":"transparent"} opacity={0.15}/>
                <text x={x} y={IH-IPB+13} textAnchor="middle"
                  fill={isSel?"#3b82f6":th.textLow} fontSize="8" fontWeight={isSel?"700":"400"}>{yr}a</text>
              </g>);
            })}
            {/* Linha vertical seleccionada */}
            <line x1={toIX(selYr)} y1={IPT} x2={toIX(selYr)} y2={IH-IPB}
              stroke="#3b82f6" strokeWidth="1.5" opacity="0.35"/>
            {/* Projecções */}
            {lines.map(({pts,color:lc,label:ll},li)=>(
              <g key={li}>
                <polyline
                  points={pts.map(p=>`${toIX(p.yr)},${toIY(p.val)}`).join(" ")}
                  fill="none" stroke={lc} strokeWidth={li===1?2:1.5} strokeDasharray="5,3" opacity="0.9"/>
                {pts.filter(p=>p.yr>0).map((p,pi)=>(
                  <circle key={pi} cx={toIX(p.yr)} cy={toIY(p.val)} r="6"
                    fill="transparent" stroke="transparent"
                    onMouseEnter={()=>setTooltip({x:toIX(p.yr),y:toIY(p.val),val:p.val,lc,ll,yr:p.yr})}
                    style={{cursor:"pointer"}}/>
                ))}
                {(()=>{const sp=pts.find(p=>p.yr===selYr);if(!sp)return null;return(
                  <circle cx={toIX(sp.yr)} cy={toIY(sp.val)} r="4" fill={lc} stroke={th.bgCard} strokeWidth="1.5"/>
                );})()}
              </g>
            ))}
            {/* Tooltip */}
            {tooltip&&(()=>{
              const TW=85,TH=28;
              const tx=Math.min(tooltip.x+8,IW-IPR-TW);
              const ty=Math.max(tooltip.y-TH-6,IPT);
              return(<g>
                <rect x={tx} y={ty} width={TW} height={TH} rx={5}
                  fill={th.bgCard} stroke={tooltip.lc} strokeWidth="1.5" opacity="0.97"/>
                <text x={tx+TW/2} y={ty+10} textAnchor="middle" fill={tooltip.lc} fontSize="8" fontWeight="700">{tooltip.ll} · {tooltip.yr}a</text>
                <text x={tx+TW/2} y={ty+22} textAnchor="middle" fill={th.text} fontSize="10" fontWeight="700">{fmtV(tooltip.val)}</text>
              </g>);
            })()}
          </svg>
        </div>
        {/* Painel lateral */}
        <div style={{width:110,flexShrink:0,background:th.bgAlt,borderRadius:10,padding:"10px 12px",border:`1px solid ${th.border}`}}>
          <p style={{fontSize:10,fontWeight:700,color:"#3b82f6",marginBottom:8,textAlign:"center"}}>📍 {selYr} anos</p>
          {[{v:selVals.v5,c:"#94a3b8",l:"5%"},{v:selVals.v8,c:"#06b6d4",l:"8%"},{v:selVals.v10,c:"#f59e0b",l:"10%"}].map(({v,c,l})=>(
            <div key={l} style={{marginBottom:6,padding:"4px 6px",borderRadius:6,background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}}>
              <p style={{fontSize:9,color:th.textLow,marginBottom:1}}>{l}</p>
              <p style={{fontSize:13,fontWeight:700,color:c}}>{fmtV(v)}</p>
            </div>
          ))}
          <p style={{fontSize:8,color:th.textLow,marginTop:6,textAlign:"center"}}>clica no eixo X</p>
          <div style={{marginTop:8,padding:"6px",background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:6}}>
            <p style={{fontSize:8,color:th.textLow,marginBottom:2}}>Fase 1: {fmtV(mensal)}/mês</p>
            <p style={{fontSize:8,color:"#06b6d4"}}>Fase 2: {fmtV(mensal2)}/mês</p>
            <p style={{fontSize:8,color:th.textLow}}>a partir de {fase2Ano}a</p>
          </div>
        </div>
      </div>
      {/* Legenda */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:8}}>
        {[{color:"#94a3b8",label:"5%",dash:true},{color:"#06b6d4",label:"8%",dash:true},{color:"#f59e0b",label:"10%",dash:true},{color:"#06b6d4",label:"LF",dash:true,dashed2:true},{color:"#ef4444",label:"FIRE",dash:true}].map(l=>(
          <div key={l.label} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:16,height:2,background:l.color,borderRadius:1,borderTop:l.dash?`2px dashed ${l.color}`:"none"}}/>
            <span style={{fontSize:10,color:th.textLow}}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
    )}</ThemeCtx.Consumer>
  );
}

export default function App(){
  const isMobile=useIsMobile();
  const [screen,setScreen]=useState("landing");
  const [tab,setTab]=useState("dashboard");
  const [fMes,setFMes]=useState(3);
  const [fAno,setFAno]=useState(2026);
  const [darkMode,setDarkMode]=useState(()=>{try{return localStorage.getItem("fin_theme")!=="light";}catch{return true;}});
  const th=darkMode?DARK_THEME:LIGHT_THEME;
  const CSS=buildCSS(th);
  const toggleTheme=()=>{const next=!darkMode;setDarkMode(next);try{localStorage.setItem("fin_theme",next?"dark":"light");}catch{}};
  // Theme-aware helpers
  const cardStyle=(extra={})=>({background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:16,padding:"16px",marginBottom:12,...extra});
  const ThemeToggle=()=>(<button onClick={toggleTheme} title={darkMode?"Modo claro":"Modo escuro"} style={{background:"none",border:`1px solid ${th.border}`,borderRadius:20,padding:"4px 10px",fontSize:13,color:th.textMid,cursor:"pointer",display:"flex",alignItems:"center",gap:4,flexShrink:0}}>{darkMode?"☀️":"🌙"}</button>);

  const [trans,setTrans,forceTrans]=useLS("fin_trans_v6",[]);
  const [pend,setPend,forcePend]=useLS("fin_pend_v6",[]);
  const [contas,setContas,forceContas]=useLS("fin_contas_v6",DEF_CONTAS);
  // Auto-migrate accounts on first load
  useEffect(() => {
    if (contas.length && !contas[0]?.secao) {
      forceContas(migrateContas(contas));
    }
  }, []);
  const [orcs,setOrcs,forceOrcs]=useLS("fin_orcs_v6",DEF_ORC);
  const [snaps,setSnaps,forceSnaps]=useLS("fin_snaps_v6",DEF_SNAPS);

  const [cats,setCats,forceCats]=useLS("fin_cats_v6",DEFAULT_CATS);
  // Migrate cats on mount (fix Supermercado location)
  useEffect(()=>{
    setCats(prev=>{
      const next={...prev};
      let changed=false;
      if(next["Alimentação"]?.subs?.includes("Supermercado")){
        next["Alimentação"]={...next["Alimentação"],subs:next["Alimentação"].subs.filter(s=>s!=="Supermercado")};
        changed=true;
      }
      if(next["Casa"]&&!next["Casa"]?.subs?.includes("Supermercado")){
        next["Casa"]={...next["Casa"],subs:[...(next["Casa"].subs||[]),"Supermercado"]};
        changed=true;
      }
      if(next["Transferência Interna"]&&!next["Transferência Interna"]?.subs?.includes("Poupança")){
        next["Transferência Interna"]={...next["Transferência Interna"],subs:["Poupança",...(next["Transferência Interna"].subs||[])]};
        changed=true;
      }
      return changed?next:prev;
    });
  },[]);

  const [patSnaps,setPatSnaps]=useLS("fin_pat_v1",[]);
  const [empTab,setEmpTab]=useState("mensal");
  const [empData,setEmpData]=useLS("fin_emp_v1",{
    diasTrabalhados:{}, // mesKey -> dias reais
    despesasReais:{},   // mesKey -> {id: valor_real}
    despesasVar:{},     // mesKey -> [{id, cat, label, valor, nota}]
    saldoConta:1096.32,
    reservaIVA:0,
  });
  const allData=useMemo(()=>({trans,pend,contas,orcs,snaps,cats,patSnaps,empData}),[trans,pend,contas,orcs,snaps,cats,patSnaps,empData]);
  // Helper: migrate orcs keys Alimentação::Supermercado → Casa::Supermercado
  // Migrate cats: mover Supermercado de Alimentação → Casa
  const migrateCats = (catsObj) => {
    if (!catsObj) return catsObj;
    const next = {...catsObj};
    // Remove Supermercado das subs de Alimentação
    if (next["Alimentação"]?.subs?.includes("Supermercado")) {
      next["Alimentação"] = {...next["Alimentação"], subs: next["Alimentação"].subs.filter(s=>s!=="Supermercado")};
    }
    // Garantir que Casa tem Supermercado
    if (next["Casa"] && !next["Casa"]?.subs?.includes("Supermercado")) {
      next["Casa"] = {...next["Casa"], subs: [...(next["Casa"].subs||[]), "Supermercado"]};
    }
    // Garantir que Transferência Interna tem Poupança
    if (next["Transferência Interna"] && !next["Transferência Interna"]?.subs?.includes("Poupança")) {
      next["Transferência Interna"] = {...next["Transferência Interna"], subs: ["Poupança",...(next["Transferência Interna"].subs||[])]};
    }
    return next;
  };

  const migrateOrcs = (orcsObj) => {
    if (!orcsObj) return orcsObj;
    let changed = false;
    const next = {};
    Object.entries(orcsObj).forEach(([mk, mo]) => {
      if (mo["Alimentação::Supermercado"] != null) {
        changed = true;
        const { ["Alimentação::Supermercado"]: val, ...rest } = mo;
        next[mk] = { ...rest, "Casa::Supermercado": (rest["Casa::Supermercado"] || 0) + val };
      } else {
        next[mk] = mo;
      }
    });
    return changed ? next : orcsObj;
  };

  const handleDriveLoad=useCallback(json=>{
    if(!json) return;
    if(json.trans?.length>0) forceTrans(json.trans.map(t=>
      t.cat==="Alimentação"&&t.sub==="Supermercado" ? {...t,cat:"Casa"} : t
    ));
    if(json.pend?.length>0) forcePend(json.pend);
    if(json.contas?.length>0) forceContas(migrateContas(json.contas));
    if(json.orcs && Object.keys(json.orcs).length>0) forceOrcs(migrateOrcs(json.orcs));
    if(json.snaps?.length>0) forceSnaps(json.snaps);
    if(json.cats && Object.keys(json.cats).length>0) forceCats(migrateCats(json.cats));
    if(json.patSnaps?.length>0) setPatSnaps(json.patSnaps);
    if(json.empData) setEmpData(json.empData);
  },[forceTrans,forcePend,forceContas,forceOrcs,forceSnaps,forceCats,setPatSnaps]);
  const {status:driveStatus}=useJSONBinSync(allData,handleDriveLoad);


  const [pEd,setPEd]=useState({});
  const [editId,setEditId]=useState(null);
  const [editD,setEditD]=useState({});
  const [orcEdit,setOrcEdit]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const [simExtra,setSimExtra]=useState(0);
  const [planoTab,setPlanoTab]=useState("plano");
  const [simCapital,setSimCapital]=useState(1500);
  const [simMensal,setSimMensal]=useState(100);
  const [simTaxa,setSimTaxa]=useState(8);
  const [patSubTab,setPatSubTab]=useState("geral");
  const [invSelected,setInvSelected]=useState("xtb");
  const [invMensais,setInvMensais,forceInvMensais]=useLS("fin_inv_mensais_v1",{ppr_opt_ana:25,ppr_opt_joa:30,xtb:100});
  const [newSnap,setNewSnap]=useState("");
  const [snapConta,setSnapConta]=useState("");
  const [snapData,setSnapData]=useState(new Date().toISOString().slice(0,10));
  const [snapVal,setSnapVal]=useState("");
  const [snapFonte,setSnapFonte]=useState("apparte"); // "apparte" | "ca"
  const [snapApparte,setSnapApparte]=useState("");
  const [snapCA,setSnapCA]=useState("");
  const [patEdit,setPatEdit]=useState(null); // month being edited e.g. "2026-04"
  const [patDraft,setPatDraft]=useState({ativos:{},passivos:{},empresa:{}});

  const [addManual,setAddManual]=useState(false);
  const [contaFiltro,setContaFiltro]=useState("mill"); // selected account in transactions
  const [manualT,setManualT]=useState({data:new Date().toISOString().slice(0,10),desc:"",val:"",tipo:"d",cat:"",sub:"",ent:"",nota:"",contaOrigem:"mill",contaDestino:""});
  // Keep manualT.contaOrigem in sync with contaFiltro when not "all"
  useEffect(()=>{
    if(contaFiltro&&contaFiltro!=="all"){
      setManualT(prev=>({...prev,contaOrigem:contaFiltro}));
    }
  },[contaFiltro]);

  const [search,setSearch]=useState("");
  const [globalSearch,setGlobalSearch]=useState("");
  const [showGlobalSearch,setShowGlobalSearch]=useState(false);
  const [searchVal,setSearchVal]=useState("");
  const [splitModal,setSplitModal]=useState(null); // transaction id to split
  const [splitParts,setSplitParts]=useState([]); // [{id, val, cat, sub, nota}]
  const [highlightTransId,setHighlightTransId]=useState(null); // id to scroll/highlight in transações
  const highlightRef=useRef(null);
  useEffect(()=>{
    if(!highlightTransId) return;
    const timer=setTimeout(()=>setHighlightTransId(null),3000);
    return()=>clearTimeout(timer);
  },[highlightTransId]);
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [catModal,setCatModal]=useState(null); // cat name to show transactions
  const [newCatModal,setNewCatModal]=useState(false);
  const [newCat,setNewCat]=useState({nome:"",icon:"📌",color:"#3b82f6",sub:""});
  const [catEditModal,setCatEditModal]=useState(false);
  const [catEditando,setCatEditando]=useState(null);
  const [catNomeEdit,setCatNomeEdit]=useState("");
  const fileRef=useRef();

  const mesKey=`${fAno}-${String(fMes+1).padStart(2,"0")}`;
  const orcMes=orcs[mesKey]||{};
  // totalOrçamentado: para cada categoria usa Σ subcategorias se existirem, senão valor directo
  // Evita duplicação de cat + subcat
  const totalOrçamentado=Object.keys(cats)
    .filter(cat=>!["Transferência Interna","Receita","Poupança"].includes(cat))
    .reduce((total,cat)=>{
      const subTotal=Object.keys(orcMes)
        .filter(k=>k.startsWith(cat+"::"))
        .reduce((a,k)=>a+orcMes[k],0);
      const catVal=subTotal>0?subTotal:(orcMes[cat]||0);
      return total+catVal;
    },0);
  const [dismissedAlertsArr,setDismissedAlertsArr]=useLS("fin_dismissed_"+mesKey,[]);
  const dismissedAlerts=useMemo(()=>new Set(dismissedAlertsArr),[dismissedAlertsArr]);
  const dismissAlert=useCallback(cat=>{
    setDismissedAlertsArr(prev=>[...new Set([...prev,cat])]);
  },[setDismissedAlertsArr]);

  const processar=useCallback(text=>{
    const novas=parseLines(text,cats);
    if(!novas.length){setImportMsg("Nenhuma transação encontrada.");return;}
    const existingIds=new Set(trans.map(t=>t.desc+t.data+t.val));
    const novasFiltradas=novas.filter(t=>!existingIds.has(t.desc+t.data+t.val));
    if(!novasFiltradas.length){setImportMsg("Sem movimentos novos — já importados anteriormente.");return;}
    // Calculate date range
    const datas=novasFiltradas.map(t=>t.data).sort();
    const dataMin=datas[0].slice(5).split("-").reverse().join("/");
    const dataMax=datas[datas.length-1].slice(5).split("-").reverse().join("/");
    setPend(novasFiltradas);
    setTab("categorizar");
    const preench=novasFiltradas.filter(t=>t.ok).length;
    const semCat=novasFiltradas.filter(t=>!t.ok).length;
    setImportMsg(`${novasFiltradas.length} movimentos · ${dataMin} a ${dataMax} · ${preench} pré-preenchidos · ${semCat} por categorizar`);
  },[cats,trans,setPend]);

  const handleFile=f=>{if(!f)return;const r=new FileReader();r.onload=e=>processar(e.target.result);r.readAsText(f,"utf-8");};
  const isInt=t=>t.cat==="Transferência Interna"||t.cat==="Poupança";
  const isCO=t=>t.sub==="Compras Outros";
  const isComprasOutros=t=>t.sub==="Compras Outros";

  // All transactions in month (for budget/summary)
  const transMesTodos=trans.filter(t=>{
    const[y,m]=t.data.split("-");
    return parseInt(m)-1===fMes&&parseInt(y)===fAno;
  });
  // Filtered by account (for transaction list)
  const transMes=trans.filter(t=>{
    const[y,m]=t.data.split("-");
    const inMonth=parseInt(m)-1===fMes&&parseInt(y)===fAno;
    if(!inMonth) return false;
    if(contaFiltro==="all") return true;
    return (t.contaId||t.contaOrigem||"mill")===contaFiltro;
  });

  // Running balance: sort by date then seqInDay (0=mais recente no ficheiro banco = topo do dia)
  const transMesWithBalance = useMemo(()=>{
    // Ordenar: data ASC, depois seqInDay ASC (0=mais recente do dia vem primeiro → fica no topo do grupo)
    const sorted=[...transMes].sort((a,b)=>
      a.data.localeCompare(b.data) ||
      ((a.seqInDay??999)-(b.seqInDay??999))
    );
    return sorted.map(t=>({...t, saldoApos: t.saldoExtrato??null})).reverse();
  },[transMes]);

  const desp=transMesTodos.filter(t=>t.tipo==="d"&&!isInt(t)&&!isComprasOutros(t));
  const rec=transMesTodos.filter(t=>t.tipo==="c"&&!isInt(t)&&!isComprasOutros(t));
  const totD=desp.reduce((a,t)=>a+t.val,0);
  const totR=rec.reduce((a,t)=>a+t.val,0);

  const catData=useMemo(()=>{
    const d={};
    transMesTodos.filter(t=>!isInt(t)).forEach(t=>{
      if(!d[t.cat])d[t.cat]={out:0,in:0,subs:{},subsIn:{}};
      if(t.tipo==="d"){
        d[t.cat].out+=t.val;
        if(!d[t.cat].subs[t.sub])d[t.cat].subs[t.sub]=0;
        d[t.cat].subs[t.sub]+=t.val;
      } else {
        d[t.cat].in+=t.val;
        if(!d[t.cat].subsIn[t.sub])d[t.cat].subsIn[t.sub]=0;
        d[t.cat].subsIn[t.sub]+=t.val;
      }
    });
    return d;
  },[transMesTodos]);

  const alerts=useMemo(()=>
    Object.entries(catData).filter(([cat])=>orcMes[cat]).map(([cat,d])=>{
      const orc=orcMes[cat],net=NET_CATS.has(cat)?d.out-d.in:d.out,pct=net/orc*100;
      return{cat,net,orc,pct};
    }).filter(a=>a.pct>=80).sort((a,b)=>b.pct-a.pct)
  ,[catData,orcMes]);

  const pieData=useMemo(()=>
    Object.entries(catData)
      .filter(([c])=>c!==""&&c!=="Receita"&&c!=="Transferência Interna"&&c!=="Poupança")
      .map(([cat,d])=>({
        cat, val:NET_CATS.has(cat)?Math.max(0,d.out-d.in):d.out, color:cats[cat]?.color||th.textLow
      }))
      .filter(d=>d.val>0)
      .sort((a,b)=>b.val-a.val)
      .slice(0,8)
  ,[catData,cats]);

  const appSaldo=contas.find(c=>c.id==="cx_meal")?.saldo??1350; // Mealheiro
  const caSaldo=contas.find(c=>c.id==="aforro"||c.id==="ca")?.saldo??0; // Certificados de Aforro
  // Level 1: Apparte 1500 + CA 9000 = 10500
  const L1_APPARTE=1500; const L1_CA=9000; const L1_TOTAL=10500;
  const L1_INVEST=1500; // XTB already invested
  const progressApparte=Math.min((appSaldo/L1_APPARTE)*100,100);
  const progressCA=Math.min((caSaldo/L1_CA)*100,100);
  const progressL1=Math.min(((appSaldo+caSaldo)/L1_TOTAL)*100,100);
  const monthsLeft=Math.max(0,Math.ceil((L1_TOTAL-appSaldo-caSaldo)/800));
  const latestSnap=snaps[snaps.length-1];
  const deviation=latestSnap.actual-latestSnap.planned;
  // Auto-calculate Millennium saldo from all confirmed transactions
  // Receitas - Despesas - Transferências para outras contas (Apparte, XTB, etc.)
  const millSaldo = useMemo(() => {
    if (!trans.length) return 0;
    return trans.reduce((total, t) => {
      if (t.cat === "Transferência Interna" || t.cat === "Poupança") {
        // Money leaving Millennium to other accounts
        if (t.tipo === "d") return total - t.val;
        // Money coming back (rare)
        if (t.tipo === "c") return total + t.val;
      }
      if (t.tipo === "c") return total + t.val;
      if (t.tipo === "d") return total - t.val;
      return total;
    }, 0);
  }, [trans]);

  // Sync Millennium saldo automatically
  useEffect(() => {
    if (!trans.length) return;
    setContas(prev => prev.map(c => c.id === "mill" ? {...c, saldo: millSaldo} : c));
  }, [millSaldo]);

  // Migrate Alimentação/Supermercado → Casa/Supermercado (trans + orcs)
  useEffect(() => {
    const needs = trans.filter(t=>t.cat==="Alimentação"&&t.sub==="Supermercado");
    if(needs.length) {
      setTrans(prev=>prev.map(t=>
        t.cat==="Alimentação"&&t.sub==="Supermercado"
          ? {...t, cat:"Casa", sub:"Supermercado"}
          : t
      ));
    }
    // Migrate orcs: rename "Alimentação::Supermercado" → "Casa::Supermercado" in all months
    setOrcs(prev=>{
      let changed=false;
      const next={};
      Object.entries(prev).forEach(([mk,mo])=>{
        if(mo["Alimentação::Supermercado"]!=null){
          changed=true;
          const {["Alimentação::Supermercado"]:val,...rest}=mo;
          next[mk]={...rest,"Casa::Supermercado":(rest["Casa::Supermercado"]||0)+val};
        } else {
          next[mk]=mo;
        }
      });
      return changed?next:prev;
    });
  }, []);

  // Compute real saldo per conta = saldoRef + movements after saldoRefData
  const contaSaldos=useMemo(()=>{
    const result={};
    contas.forEach(c=>{
      if(c.saldoRef!=null&&c.saldoRefData){
        const refDate=c.saldoRefData;
        const movs=trans.filter(t=>{
          const tContaId=t.contaId||t.contaOrigem||"mill";
          const matches=tContaId===c.id;
          const after=t.data>refDate;
          return matches&&after;
        });
        const delta=movs.reduce((a,t)=>a+(t.tipo==="c"?t.val:-t.val),0);
        result[c.id]=c.saldoRef+delta;
      } else {
        result[c.id]=c.saldo||0;
      }
    });
    return result;
  },[contas,trans]);
  const patrimonioTotal=contas.reduce((a,c)=>a+(contaSaldos[c.id]||0),0);

  // Filtered transactions for list
  const globalResults=useMemo(()=>{
    if(!globalSearch||globalSearch.length<2) return [];
    const q=globalSearch.toLowerCase();
    return trans.filter(t=>
      t.desc.toLowerCase().includes(q)||
      (t.ent||"").toLowerCase().includes(q)||
      (t.cat||"").toLowerCase().includes(q)||
      (t.sub||"").toLowerCase().includes(q)||
      (t.nota||"").toLowerCase().includes(q)||
      String(t.val).includes(q)
    ).sort((a,b)=>b.data.localeCompare(a.data)).slice(0,50);
  },[trans,globalSearch]);

  const filteredTrans=useMemo(()=>{
    return transMesWithBalance.filter(t=>{
      if(search&&!t.desc.toLowerCase().includes(search.toLowerCase())&&!t.ent.toLowerCase().includes(search.toLowerCase())&&!t.cat.toLowerCase().includes(search.toLowerCase())) return false;
      if(dateFrom&&t.data<dateFrom) return false;
      if(dateTo&&t.data>dateTo) return false;
      if(searchVal){const sv=parseFloat(searchVal);if(!isNaN(sv)&&Math.abs(t.val-sv)>0.01) return false;}
      return true;
    });
  },[transMesWithBalance,search,dateFrom,dateTo,searchVal]);

  // Apply balance changes to accounts
  const applyBalance = useCallback((catFinal, val, tipo, contaOrigem, contaDestino) => {
    if (catFinal==="Transferência Interna"||catFinal==="Poupança") {
      if (contaOrigem && contaDestino) {
        setContas(prev=>prev.map(c=>{
          if(c.id===contaOrigem) return{...c,saldo:c.saldo-val};
          if(c.id===contaDestino) return{...c,saldo:c.saldo+val};
          return c;
        }));
      }
    } else if (catFinal==="Receita") {
      if (contaDestino) setContas(prev=>prev.map(c=>c.id===contaDestino?{...c,saldo:c.saldo+val}:c));
    } else {
      // Regular expense/income — only if not Millennium (auto-calculated)
      if (contaOrigem && contaOrigem!=="mill") {
        setContas(prev=>prev.map(c=>{
          if(c.id===contaOrigem) return{...c,saldo:tipo==="d"?c.saldo-val:c.saldo+val};
          return c;
        }));
      }
    }
  }, [setContas]);

  const confirmP=id=>{
    const ed=pEd[id]||{},t=pend.find(p=>p.id===id);if(!t)return;
    const catFinal=ed.cat!==undefined?ed.cat:t.cat;
    const subFinal=ed.sub!==undefined?ed.sub:t.sub;
    const entFinal=ed.ent!==undefined?ed.ent:t.ent;
    if(ed.newCatName){const c={...cats};c[ed.newCatName]={icon:ed.newCatIcon||"📌",color:ed.newCatColor||"#3b82f6",subs:ed.newCatSub?[ed.newCatSub]:[]};setCats(c);}
    if(catFinal&&ed.newSubName&&cats[catFinal]){const c={...cats};c[catFinal]={...c[catFinal],subs:[...c[catFinal].subs,ed.newSubName]};setCats(c);}
    const finalTrans={...t,cat:catFinal,sub:subFinal,ent:entFinal,data:ed.data||t.data,nota:ed.nota||t.nota||"",ok:true,contaOrigem:ed.contaOrigem||"",contaDestino:ed.contaDestino||"",contaId:t.contaId||ed.contaOrigem||"mill"};
    setTrans(prev=>{const ids=new Set(prev.map(t=>t.desc+t.data+t.val));return ids.has(finalTrans.desc+finalTrans.data+finalTrans.val)?prev:[...prev,finalTrans];});
    applyBalance(catFinal, t.val, t.tipo, ed.contaOrigem, ed.contaDestino);
    const r=pend.filter(p=>p.id!==id);setPend(r);if(!r.length)setTab("transacoes");
  };

  // Confirm all pre-filled at once
  const confirmAll=()=>{
    // Aplicar edições de pEd antes de confirmar
    const pendComEd=pend.map(t=>{
      const ed=pEd[t.id]||{};
      const cat=ed.cat!==undefined?ed.cat:t.cat;
      const sub=ed.sub!==undefined?ed.sub:t.sub;
      const ent=ed.ent!==undefined?ed.ent:t.ent;
      const nota=ed.nota!==undefined?ed.nota:t.nota;
      const data=ed.data||t.data;
      return{...t,cat,sub,ent,nota,data,ok:!!cat,contaId:t.contaId||ed.contaOrigem||"mill"};
    });
    const preenchidos=pendComEd.filter(t=>t.ok);
    setTrans(prev=>{
      const ids=new Set(prev.map(t=>t.desc+t.data+t.val));
      return[...prev,...preenchidos.filter(t=>!ids.has(t.desc+t.data+t.val))];
    });
    const remaining=pendComEd.filter(t=>!t.ok);
    setPend(remaining);
    if(!remaining.length)setTab("transacoes");
  };

  // Dupla validação de saldo: chamada após confirmar TODOS os pendentes
  const validarSaldoAposImport = useCallback((pendToValidate, transAtuais) => {
    // Linha mais recente do import = menor seqInDay, maior data
    const comSaldo = pendToValidate.filter(t=>t.saldoExtrato!=null&&t.contaId==="mill");
    if(!comSaldo.length) return null;
    // Ordenar por data DESC, seqInDay ASC → primeiro = mais recente do banco
    const sorted = [...comSaldo].sort((a,b)=>
      b.data.localeCompare(a.data) || (a.seqInDay??999)-(b.seqInDay??999)
    );
    const maisRecente = sorted[0];
    const saldoBanco = maisRecente.saldoExtrato;
    const dataRef = maisRecente.data;
    // Actualizar saldoRef do Millennium automaticamente com o saldo do banco
    setContas(prev=>prev.map(c=>c.id==="mill"?{...c,saldoRef:saldoBanco,saldoRefData:dataRef}:c));
    // Calcular saldo para validação
    const allTrans = [...transAtuais, ...pendToValidate];
    const millConta = contas.find(c=>c.id==="mill");
    let saldoCalculado = null;
    if(millConta?.saldoRef!=null && millConta?.saldoRefData) {
      const movs = allTrans.filter(t=>(t.contaId||t.contaOrigem||"mill")==="mill" && t.data>millConta.saldoRefData);
      saldoCalculado = millConta.saldoRef + movs.reduce((a,t)=>a+(t.tipo==="c"?t.val:-t.val),0);
    }
    return { saldoBanco, saldoCalculado, dataRef };
  }, [contas, setContas]);
  const markInt=id=>{const t=pend.find(p=>p.id===id);if(!t)return;setTrans(prev=>[...prev,{...t,cat:"Transferência Interna",sub:"Outro",ok:true}]);const r=pend.filter(p=>p.id!==id);setPend(r);if(!r.length)setTab("transacoes");};
  const ignP=id=>{const r=pend.filter(p=>p.id!==id);setPend(r);if(!r.length)setTab("transacoes");};
  const saveEdit=id=>{setTrans(prev=>prev.map(t=>t.id===id?{...t,...editD}:t));setEditId(null);};
  const delT=id=>{setTrans(prev=>prev.filter(t=>t.id!==id));setEditId(null);};

  const exportJSON=()=>{const blob=new Blob([JSON.stringify({trans,pend,contas,orcs,snaps,cats},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="financa_backup.json";a.click();};
  const exportExcel=()=>{
    const headers=["Data","Entidade","Descricao","Categoria","Subcategoria","Tipo","Valor","Nota","Conta"];
    const dataRows=[...trans].sort((a,b)=>b.data.localeCompare(a.data)).map(t=>{
      const conta=contas.find(c=>c.id===(t.contaId||t.contaOrigem||"mill"));
      return [t.data,t.ent||"",t.desc,t.cat||"",t.sub||"",t.tipo==="c"?"Credito":"Debito",(t.tipo==="c"?1:-1)*t.val,t.nota||"",conta?.nome||"Millennium"];
    });
    const allRows=[headers,...dataRows];
    const lines=allRows.map(r=>r.map(v=>{const s=String(v);return s.includes(";")||s.includes('"')?'"'+s.replace(/"/g,'""')+'"':s;}).join(";"));
    const csv=lines.join("\r\n");
    const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="financa_"+new Date().toISOString().slice(0,10)+".csv";a.click();
  };
  const importJSON=f=>{if(!f)return;const r=new FileReader();r.onload=e=>{try{const j=JSON.parse(e.target.result);if(j.trans)setTrans(j.trans);if(j.pend)setPend(j.pend);if(j.contas)setContas(j.contas);if(j.orcs)setOrcs(j.orcs);if(j.snaps)setSnaps(j.snaps);if(j.cats)setCats(j.cats);}catch{alert("Ficheiro inválido");}};r.readAsText(f);};

  const addNewCat=()=>{
    if(!newCat.nome.trim()) return;
    const subs=newCat.sub.split(",").map(s=>s.trim()).filter(Boolean);
    setCats(prev=>({...prev,[newCat.nome]:{icon:newCat.icon,color:newCat.color,subs}}));
    setNewCat({nome:"",icon:"📌",color:"#3b82f6",sub:""});
    setNewCatModal(false);
  };

  // Cat transactions modal
  const catTransactions=catModal?(()=>{
    if(catModal==="__SEM_CATEGORIA__")
      return trans.filter(t=>!t.cat||(!t.sub&&cats[t.cat]?.subs?.length>0&&t.cat!=="Transferência Interna"&&t.cat!=="Receita"))
        .sort((a,b)=>b.data.localeCompare(a.data));
    if(catModal.includes("::")){
      const [cat,sub]=catModal.split("::");
      return transMesTodos.filter(t=>t.cat===cat&&(t.sub===sub||(t.splits&&t.splits.some(s=>s.cat===cat&&s.sub===sub)))).sort((a,b)=>b.data.localeCompare(a.data));
    }
    if(catModal==="Receita") return transMesTodos.filter(t=>t.tipo==="c"&&!isInt(t)&&!isCO(t)).sort((a,b)=>b.data.localeCompare(a.data));
    return transMesTodos.filter(t=>t.cat===catModal).sort((a,b)=>b.data.localeCompare(a.data));
  })():[];
  const catModalLabel=catModal==="__SEM_CATEGORIA__"?"Sem categoria / subcategoria":catModal?.includes("::")?catModal.split("::")[1]:catModal;
  const catModalCat=catModal?.includes("::")?catModal.split("::")[0]:catModal;

  const px=isMobile?"14px":"24px";
  const mainPad=isMobile?"14px 14px 80px":"24px 28px";

  const navItems=[
    {id:"dashboard",label:"Início",icon:"◈"},
    {id:"orcamento",label:"Orçamento",icon:"◉"},
    {id:"transacoes",label:"Movimentos",icon:"≡"},
    {id:"importar",label:"Importar",icon:"↑"},
    {id:"config",label:"Configurações",icon:"⚙"},
  ];
  const configSubTabs=[
    {id:"contas",label:"Contas",icon:"◇"},
    {id:"categorizar",label:`Categorizar${pend.length?` (${pend.length})`:""}`,icon:"◎"},
    {id:"categorias",label:"Categorias",icon:"⊞"},
  ];

  // ── LANDING ───────────────────────────────────────────────
  if(screen==="landing") return (
    <ThemeCtx.Provider value={th}>
    <>
      <style>{CSS}</style>
      <div className="fade" style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:`32px ${px}`,background:darkMode?"linear-gradient(160deg,#070d1a 0%,#0d1a2e 60%,#070d1a 100%)":th.bg}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{position:"absolute",top:16,right:16}}><ThemeToggle/></div>
          <div style={{fontSize:40,marginBottom:12}}>✦</div>
          <h1 style={{fontSize:isMobile?34:44,fontWeight:300,color:th.text,letterSpacing:-2,marginBottom:6}}>finança<span style={{color:"#3b82f6",fontWeight:600}}>.</span></h1>
          <p style={{fontSize:13,color:th.textLow}}>Hub financeiro pessoal · Ana · 2026</p>
          {(()=>{const cfg={idle:{dot:"⚪",label:"A ligar...",color:th.textLow},loading:{dot:"🟡",label:"A carregar...",color:"#f59e0b"},saving:{dot:"🟡",label:"A guardar...",color:"#f59e0b"},synced:{dot:"🟢",label:"Sincronizado",color:"#22c55e"},error:{dot:"🔴",label:"Erro de ligação",color:"#ef4444"}}[driveStatus]||{dot:"⚪",label:"",color:th.textLow};return<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10}}>{cfg.dot}</span><span style={{fontSize:10,color:cfg.color}}>{cfg.label}</span></div>;})()}

        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:480,marginBottom:24}}>
          <div onClick={()=>setScreen("gestao")} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:18,padding:20,cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#3b82f6";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontSize:24,width:44,height:44,background:"rgba(59,130,246,0.12)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>💳</div>
              <div><h2 style={{fontSize:16,fontWeight:600,color:th.text,marginBottom:2}}>Gestão Mensal</h2><p style={{fontSize:12,color:th.textLow}}>Extratos · Orçamento · Categorias</p></div>
              <span style={{marginLeft:"auto",color:"#3b82f6",fontSize:18}}>›</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{background:"rgba(59,130,246,0.08)",borderRadius:10,padding:"8px 12px"}}><p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Saldo Abr</p><p style={{fontSize:16,fontWeight:600,color:"#3b82f6"}}>{fE(totR-totD)}</p></div>
              <div style={{background:"rgba(239,68,68,0.08)",borderRadius:10,padding:"8px 12px"}}><p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Despesas</p><p style={{fontSize:16,fontWeight:600,color:"#ef4444"}}>{fE(totD)}</p></div>
            </div>
          </div>
          <div onClick={()=>setScreen("plano")} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:18,padding:20,cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#22c55e";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontSize:24,width:44,height:44,background:"rgba(34,197,94,0.12)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🎯</div>
              <div><h2 style={{fontSize:16,fontWeight:600,color:th.text,marginBottom:2}}>Liberdade Financeira</h2><p style={{fontSize:12,color:th.textLow}}>4 Níveis · Progresso · Simulador</p></div>
              <span style={{marginLeft:"auto",color:"#22c55e",fontSize:18}}>›</span>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:th.textLow}}>Nível 1</span><span style={{fontSize:11,fontWeight:600,color:"#22c55e"}}>{progressL1.toFixed(1)}%</span></div>
              <PBar val={appSaldo} max={10500} color="#22c55e" h={7}/>
            </div>
            <div style={{display:"flex",gap:6,padding:"6px 10px",background:deviation>=0?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",borderRadius:8}}>
              <span style={{fontSize:11}}>{deviation>=0?"✅":"⚠️"}</span>
              <span style={{fontSize:11,color:deviation>=0?"#22c55e":"#ef4444"}}>{deviation>=0?"No plano":"Abaixo"} · {deviation>=0?"+":""}{fE(deviation)}</span>
            </div>
          </div>

        </div>
        <div style={{width:"100%",maxWidth:480}}>
          {/* Empresa card */}
          <div onClick={()=>setScreen("empresa")} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:18,padding:20,marginBottom:12,cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={e=>{if(!isMobile){e.currentTarget.style.borderColor="#f59e0b";e.currentTarget.style.transform="translateY(-3px)";}}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.transform="translateY(0)";}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{fontSize:24,width:44,height:44,background:"rgba(245,158,11,0.1)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🏢</div>
              <div style={{flex:1}}>
                <h2 style={{fontSize:16,fontWeight:600,color:th.text,marginBottom:2}}>Linguagem Entusiasta</h2>
                <p style={{fontSize:12,color:th.textLow}}>P&L · Fiscal · Projeção Anual</p>
              </div>
              <span style={{color:"#f59e0b",fontSize:18}}>›</span>
            </div>
            {(()=>{
              const mk=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
              const dias=empData?.diasTrabalhados?.[mk]??EMP_DIAS_UTEIS_BASE[mk]??20;
              const rec=dias*EMP_TAXA_DIARIA;
              const desp=EMP_DESPESAS_FIXAS.reduce((a,d)=>a+(empData?.despesasReais?.[mk]?.[d.id]??d.valor),0);
              const res=rec-desp;
              const hoje=new Date();
              const proxObrig=EMP_OBRIGACOES.filter(o=>new Date(o.data)>=hoje).sort((a,b)=>new Date(a.data)-new Date(b.data))[0];
              const diasObrig=proxObrig?Math.ceil((new Date(proxObrig.data)-hoje)/(1000*60*60*24)):null;
              return(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <div style={{background:"rgba(34,197,94,0.08)",borderRadius:10,padding:"8px 12px"}}>
                    <p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Receita {MESES[new Date().getMonth()]}</p>
                    <p style={{fontSize:14,fontWeight:600,color:"#22c55e"}}>{fE(rec)}</p>
                  </div>
                  <div style={{background:res>=0?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",borderRadius:10,padding:"8px 12px"}}>
                    <p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Resultado</p>
                    <p style={{fontSize:14,fontWeight:600,color:res>=0?"#22c55e":"#ef4444"}}>{fE(res)}</p>
                  </div>
                  <div style={{background:"rgba(245,158,11,0.08)",borderRadius:10,padding:"8px 12px"}}>
                    <p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Próx. Obrigação</p>
                    <p style={{fontSize:12,fontWeight:600,color:"#f59e0b"}}>{proxObrig?`${diasObrig}d`:"—"}</p>
                    {proxObrig&&<p style={{fontSize:9,color:th.textLow}}>{proxObrig.label}</p>}
                  </div>
                </div>
              );
            })()}
          </div>

          <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:12,padding:"12px 16px",textAlign:"center",marginBottom:10}}>
            <p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:2,marginBottom:4}}>Património Total em Contas</p>
            <p style={{fontSize:26,fontWeight:600,color:th.text}}>{fE(patrimonioTotal)}</p>
            <p style={{fontSize:10,color:th.textLow,marginTop:3}}>Millennium + Caixinhas + Investimentos</p>
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={exportJSON} style={{flex:1,padding:"10px",background:"rgba(59,130,246,0.1)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.2)",borderRadius:10,fontSize:12}}>↓ Exportar backup</button>
            <label style={{flex:1,padding:"10px",background:darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",color:th.textMid,border:`1px solid ${th.border}`,borderRadius:10,fontSize:12,cursor:"pointer",textAlign:"center",display:"block"}}>↑ Importar backup<input type="file" accept=".json" style={{display:"none"}} onChange={e=>importJSON(e.target.files[0])}/></label>
          </div>
        </div>
      </div>
      {isMobile&&<div className="tabbar">
        <button onClick={()=>setScreen("landing")} style={{color:th.textLow,flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none",fontSize:10}}><span style={{fontSize:18}}>🏠</span>Hub</button>
        <button onClick={()=>{setScreen("gestao");setTab("dashboard");}} style={{color:th.textLow,flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none",fontSize:10}}><span style={{fontSize:18}}>💳</span>Gestão</button>
        <button onClick={()=>setScreen("plano")} style={{color:th.textLow,flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none",fontSize:10}}><span style={{fontSize:18}}>🎯</span>Plano</button>
      </div>}
    </>
    </ThemeCtx.Provider>
  );


    // ── EMPRESA ───────────────────────────────────────────────────
  if(screen==="empresa") {
    const hoje = new Date();
    const empMesKey = `${fAno}-${String(fMes+1).padStart(2,"0")}`;
    const diasBase = EMP_DIAS_UTEIS_BASE[empMesKey] || 20;
    const diasReais = empData.diasTrabalhados?.[empMesKey] ?? diasBase;
    const receitaCalculada = diasReais * EMP_TAXA_DIARIA;
    // Valor ajustado manualmente (override) ou calculado
    const receitaBruta = empData.receitaReal?.[empMesKey] ?? receitaCalculada;
    const ivaRecebido = receitaBruta * 0.23;
    const isSubsidio = EMP_MESES_SUBSIDIO.includes(fMes);

    // Calculate real or projected expenses for current month
    const despMes = {};
    EMP_DESPESAS_FIXAS.forEach(d => {
      despMes[d.id] = empData.despesasReais?.[empMesKey]?.[d.id] ?? d.valor;
    });
    // Add pontuais
    EMP_DESPESAS_PONTUAIS.forEach(d => {
      if(d.meses.includes(fMes)) despMes[d.id] = empData.despesasReais?.[empMesKey]?.[d.id] ?? d.valor;
    });
    // Subsidio extra: salário + TSU completa + retenção IRS (Cover Flex não duplica)
    const subsidioExtra = isSubsidio ? (despMes["salario"]||0) + (despMes["tsu"]||0) + (despMes["irs_ret"]||0) : 0;
    const totalDespesasFixas = Object.values(despMes).reduce((a,b)=>a+b,0) + subsidioExtra;

    // Despesas variáveis do mês
    const despVar = empData.despesasVar?.[empMesKey] || [];
    const totalDespVar = despVar.reduce((a,d)=>a+(d.valor||0), 0);

    const totalDespesas = totalDespesasFixas + totalDespVar;
    const resultado = receitaBruta - totalDespesas;

    // Tributações Autónomas
    const taAjudas = (despMes["ajudas"]||750) * EMP_TA_AJUDAS;
    const taRep = despVar
      .filter(d => EMP_CATS_VARIAVEIS.find(c=>c.id===d.cat)?.ta === 0.10)
      .reduce((a,d)=>a+(d.valor||0)*0.10, 0);
    const taOutras = despVar
      .filter(d => EMP_CATS_VARIAVEIS.find(c=>c.id===d.cat)?.ta === 0.05)
      .reduce((a,d)=>a+(d.valor||0)*0.05, 0);
    const totalTA = taAjudas + taRep + taOutras;

    // Annual overview
    const anoOverview = Array.from({length:12},(_,m)=>{
      const mk = `${fAno}-${String(m+1).padStart(2,"0")}`;
      const dias = empData.diasTrabalhados?.[mk] ?? EMP_DIAS_UTEIS_BASE[mk] ?? 20;
      const recCalc = dias * EMP_TAXA_DIARIA;
      const rec = empData.receitaReal?.[mk] ?? recCalc;
      let desp = EMP_DESPESAS_FIXAS.reduce((a,d)=>{
        return a + (empData.despesasReais?.[mk]?.[d.id] ?? d.valor);
      },0);
      EMP_DESPESAS_PONTUAIS.forEach(d=>{ if(d.meses.includes(m)) desp += empData.despesasReais?.[mk]?.[d.id] ?? d.valor; });
      if(EMP_MESES_SUBSIDIO.includes(m)) {
        const sal = empData.despesasReais?.[mk]?.salario ?? 1000;
        const tsu = empData.despesasReais?.[mk]?.tsu ?? 347.50;
        const irs = empData.despesasReais?.[mk]?.irs_ret ?? 14;
        desp += sal + tsu + irs;
      }
      const ajudas = empData.despesasReais?.[mk]?.ajudas ?? 750;
      const varDespesas = empData.despesasVar?.[mk] || [];
      const taAnual = ajudas*EMP_TA_AJUDAS +
        varDespesas.filter(d=>EMP_CATS_VARIAVEIS.find(c=>c.id===d.cat)?.ta===0.10).reduce((a,d)=>a+(d.valor||0)*0.10,0) +
        varDespesas.filter(d=>EMP_CATS_VARIAVEIS.find(c=>c.id===d.cat)?.ta===0.05).reduce((a,d)=>a+(d.valor||0)*0.05,0);
      const varTotal = varDespesas.reduce((a,d)=>a+(d.valor||0),0);
      return { mes:m, mk, rec, desp:desp+varTotal, res:rec-desp-varTotal, iva:rec*0.23, ta:taAnual };
    });
    const totalRec = anoOverview.reduce((a,m)=>a+m.rec,0);
    const totalDesp = anoOverview.reduce((a,m)=>a+m.desp,0);
    const totalRes = totalRec - totalDesp;
    const totalTAAnual = anoOverview.reduce((a,m)=>a+(m.ta||0), 0);
    const ivaAnual = totalRec * 0.23;

    // Next obligations
    const proximasObrig = EMP_OBRIGACOES
      .filter(o=>new Date(o.data) >= hoje)
      .sort((a,b)=>new Date(a.data)-new Date(b.data))
      .slice(0,4);

    // IVA acumulado por trimestre
    const ivaQ = [
      {label:"1º Trim", meses:[0,1,2], data:"2026-05-15"},
      {label:"2º Trim", meses:[3,4,5], data:"2026-08-15"},
      {label:"3º Trim", meses:[6,7,8], data:"2026-11-15"},
      {label:"4º Trim", meses:[9,10,11], data:"2027-02-15"},
    ].map(q=>({
      ...q,
      iva: q.meses.reduce((a,m)=>{
        const mk=`${fAno}-${String(m+1).padStart(2,"0")}`;
        const dias=empData.diasTrabalhados?.[mk]??EMP_DIAS_UTEIS_BASE[mk]??20;
        return a+(dias*EMP_TAXA_DIARIA*0.23);
      },0)
    }));

    return (
      <ThemeCtx.Provider value={th}>
      <>
        <style>{CSS}</style>
        <div style={{minHeight:"100vh",paddingBottom:isMobile?80:0,background:th.bg,color:th.text}}>
          {/* Header */}
          <div style={{background:th.bgAlt,borderBottom:`1px solid ${th.border}`,padding:`12px ${px}`,display:"flex",alignItems:"center",gap:8,position:"sticky",top:0,zIndex:50,flexWrap:"wrap"}}>
            <button onClick={()=>setScreen("landing")} style={{background:`rgba(${th.bg==="#f0ece4"?"0,0,0":"255,255,255"},0.05)`,color:th.textMid,padding:"6px 12px",border:`1px solid ${th.border}`,fontSize:12,borderRadius:8}}>← Hub</button>
            <p style={{fontSize:15,fontWeight:600,color:th.text}}>🏢 Linguagem Entusiasta</p>
            {/* Tabs */}
            <div style={{display:"flex",gap:0,background:`rgba(${th.bg==="#f0ece4"?"0,0,0":"255,255,255"},0.05)`,borderRadius:10,padding:3,marginLeft:"auto"}}>
              {[{id:"mensal",label:"📅 Mensal"},{id:"anual",label:"📈 Anual"}].map(t=>(
                <button key={t.id} onClick={()=>setEmpTab(t.id)}
                  style={{padding:"5px 14px",fontSize:12,fontWeight:500,borderRadius:8,background:empTab===t.id?"rgba(245,158,11,0.3)":"none",color:empTab===t.id?th.text:th.textLow,border:"none",cursor:"pointer"}}>
                  {t.label}
                </button>
              ))}
            </div>
            {empTab==="mensal"&&<div style={{display:"flex",gap:6}}>
              <select value={fMes} onChange={e=>setFMes(parseInt(e.target.value))} style={{fontSize:12,padding:"5px 8px",width:"auto"}}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
              <select value={fAno} onChange={e=>setFAno(parseInt(e.target.value))} style={{fontSize:12,padding:"5px 8px",width:"auto"}}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div>}
            {empTab==="anual"&&<select value={fAno} onChange={e=>setFAno(parseInt(e.target.value))} style={{fontSize:12,padding:"5px 8px",width:"auto"}}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>}
          </div>

          <div style={{padding:mainPad,maxWidth:isMobile?undefined:1000,margin:"0 auto"}} className="fade">

            {/* ── TAB MENSAL ── */}
            <div style={{display:empTab==="mensal"?"block":"none"}}>

              {/* Receita s/IVA · IVA · c/IVA */}
              <div style={{background:th.bgCard,border:"1px solid rgba(34,197,94,0.3)",borderRadius:14,padding:"14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1}}>
                    💰 Receita {MESES[fMes]} (ref. dias {MESES[fMes===0?11:fMes-1]}) — {diasReais} dias × {fE(EMP_TAXA_DIARIA)}
                  </p>
                  {empData.receitaReal?.[empMesKey]!=null&&(
                    <span style={{fontSize:9,color:"#f59e0b",background:"rgba(245,158,11,0.1)",borderRadius:6,padding:"2px 8px"}}>
                      ✏ ajustado · calc: {fE(receitaCalculada)}
                      <button onClick={()=>setEmpData(p=>{const r={...p.receitaReal};delete r[empMesKey];return{...p,receitaReal:r};})}
                        style={{background:"none",border:"none",color:"#f59e0b",cursor:"pointer",marginLeft:4,fontSize:9}}>↺ repor</button>
                    </span>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <div style={{background:"rgba(34,197,94,0.08)",borderRadius:10,padding:"10px 12px"}}>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:4}}>s/ IVA</p>
                    <p style={{fontSize:18,fontWeight:700,color:"#22c55e"}}>{fE(receitaBruta)}</p>
                  </div>
                  <div style={{background:"rgba(245,158,11,0.08)",borderRadius:10,padding:"10px 12px"}}>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:4}}>IVA (23%)</p>
                    <p style={{fontSize:18,fontWeight:700,color:"#f59e0b"}}>{fE(ivaRecebido)}</p>
                    <p style={{fontSize:9,color:th.textLow,marginTop:2}}>↗ reservar</p>
                  </div>
                  <div style={{background:"rgba(59,130,246,0.08)",borderRadius:10,padding:"10px 12px"}}>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:4}}>c/ IVA</p>
                    <p style={{fontSize:18,fontWeight:700,color:"#3b82f6"}}>{fE(receitaBruta+ivaRecebido)}</p>
                    <p style={{fontSize:9,color:th.textLow,marginTop:2}}>ref. {MESES[fMes===0?11:fMes-1]} · recebido a dia 17</p>
                  </div>
                </div>
              </div>

              {/* KPIs mensais */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:10,marginBottom:12}}>
                {[
                  {label:"Total Despesas",val:totalDespesas,color:"#ef4444",sub:isSubsidio?"⚠ incl. subsídio":(totalDespVar>0?`incl. ${fE(totalDespVar)} variáveis`:"")},
                  {label:"Resultado",val:resultado,color:resultado>=0?"#22c55e":"#ef4444",sub:resultado>=0?"✓ Positivo":"⚠ Negativo"},
                  {label:"Saldo Conta",val:empData.saldoConta||0,color:"#a855f7",sub:"actualizar manualmente"},
                ].map(k=>(
                  <div key={k.label} style={{background:th.bgCard,border:`1px solid ${k.color}33`,borderRadius:14,padding:"14px"}}>
                    <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p>
                    <p style={{fontSize:18,fontWeight:700,color:k.color}}>{fE(k.val)}</p>
                    {k.sub&&<p style={{fontSize:10,color:th.textLow,marginTop:3}}>{k.sub}</p>}
                  </div>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
                {/* Dias trabalhados */}
                <Card>
                  <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:12}}>📅 Dias Trabalhados — {MESES[fMes]}</p>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <p style={{fontSize:11,color:th.textLow,marginBottom:4}}>Dias úteis base</p>
                      <p style={{fontSize:16,fontWeight:600,color:th.textMid}}>{diasBase} dias</p>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontSize:11,color:th.textLow,marginBottom:4}}>Dias reais</p>
                      <input type="number" value={diasReais} min={0} max={31} step={0.5}
                        onChange={e=>setEmpData(p=>({...p,diasTrabalhados:{...p.diasTrabalhados,[empMesKey]:parseFloat(e.target.value)||0}}))}
                        style={{fontSize:20,fontWeight:700,color:"#22c55e",background:"none",border:"none",borderBottom:"2px solid #22c55e",borderRadius:0,padding:"2px 4px",width:70,textAlign:"center"}}/>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontSize:11,color:th.textLow,marginBottom:4}}>Receita s/IVA</p>
                      <input type="number" value={empData.receitaReal?.[empMesKey]??receitaCalculada} step="0.01"
                        onChange={e=>setEmpData(p=>({...p,receitaReal:{...(p.receitaReal||{}),[empMesKey]:parseFloat(e.target.value)||0}}))}
                        style={{fontSize:15,fontWeight:700,color:"#22c55e",background:"none",border:"none",borderBottom:"2px solid #22c55e",borderRadius:0,padding:"2px 4px",width:"100%"}}/>
                    </div>
                  </div>
                  <PBar val={diasReais} max={diasBase} color="#22c55e"/>
                  {isSubsidio&&<div style={{marginTop:8,padding:"6px 10px",background:"rgba(245,158,11,0.1)",borderRadius:8}}>
                    <p style={{fontSize:11,color:"#f59e0b"}}>⚠️ Mês de subsídio — custo extra: {fE(subsidioExtra)}</p>
                    <p style={{fontSize:10,color:th.textLow}}>Salário {fE(despMes["salario"]||1000)} + TSU {fE(despMes["tsu"]||347.50)} + IRS {fE(despMes["irs_ret"]||14)}</p>
                  </div>}
                </Card>

                {/* Próximas obrigações */}
                <Card>
                  <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:12}}>📆 Próximas Obrigações</p>
                  {proximasObrig.map(o=>{
                    const dias=Math.ceil((new Date(o.data)-hoje)/(1000*60*60*24));
                    const cor=dias<=30?"#ef4444":dias<=60?"#f59e0b":"#22c55e";
                    const tipoColor=o.tipo==="iva"?"#f59e0b":o.tipo==="irc"?"#3b82f6":th.textMid;
                    return(
                      <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #0d1a2e"}}>
                        <div style={{width:36,height:36,borderRadius:8,background:tipoColor+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:9,fontWeight:700,color:tipoColor}}>{o.tipo.toUpperCase()}</span>
                        </div>
                        <div style={{flex:1}}>
                          <p style={{fontSize:12,fontWeight:500}}>{o.label}</p>
                          <p style={{fontSize:10,color:th.textLow}}>{o.data}</p>
                        </div>
                        <div style={{textAlign:"right"}}>
                          {o.valor_est&&<p style={{fontSize:12,fontWeight:600,color:th.text}}>{fE(o.valor_est)}</p>}
                          <p style={{fontSize:11,fontWeight:600,color:cor}}>{dias}d</p>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>

              {/* Despesas do mês — editáveis */}
              <Card>
                <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:12}}>💸 Despesas — {MESES[fMes]} {fAno}</p>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:th.bgAlt}}>
                      {["Despesa","Base","Real","Δ"].map(h=>(
                        <th key={h} style={{textAlign:h==="Despesa"?"left":"right",padding:"7px 10px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {EMP_DESPESAS_FIXAS.map(d=>{
                      const real=despMes[d.id]??d.valor;
                      const diff=real-d.valor;
                      return(
                        <tr key={d.id} className="hrow" style={{borderBottom:"1px solid #0a1220"}}>
                          <td style={{padding:"7px 10px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span>{d.icon}</span>
                              <div>
                                <p style={{fontSize:12}}>{d.label}</p>
                                {d.nota&&<p style={{fontSize:10,color:th.textLow}}>{d.nota}</p>}
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:th.textLow}}>{fE(d.valor)}</td>
                          <td style={{padding:"4px 6px",textAlign:"right"}}>
                            <input type="number" value={real} step="0.01"
                              onChange={e=>setEmpData(p=>({...p,despesasReais:{...p.despesasReais,[empMesKey]:{...(p.despesasReais?.[empMesKey]||{}),[d.id]:parseFloat(e.target.value)||0}}}))}
                              style={{textAlign:"right",width:100,fontSize:12,padding:"4px 6px"}}/>
                          </td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:diff===0?th.textLow:diff>0?"#ef4444":"#22c55e",fontWeight:diff!==0?600:400}}>
                            {diff===0?"—":`${diff>0?"+":""}${fE(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                    {EMP_DESPESAS_PONTUAIS.filter(d=>d.meses.includes(fMes)).map(d=>{
                      const real=despMes[d.id]??d.valor;
                      const diff=real-d.valor;
                      return(
                        <tr key={d.id} className="hrow" style={{borderBottom:"1px solid #0a1220",background:"rgba(245,158,11,0.03)"}}>
                          <td style={{padding:"7px 10px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span>{d.icon}</span>
                              <div>
                                <p style={{fontSize:12}}>{d.label}</p>
                                <p style={{fontSize:10,color:"#f59e0b"}}>pontual</p>
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:th.textLow}}>{fE(d.valor)}</td>
                          <td style={{padding:"4px 6px",textAlign:"right"}}>
                            <input type="number" value={real} step="0.01"
                              onChange={e=>setEmpData(p=>({...p,despesasReais:{...p.despesasReais,[empMesKey]:{...(p.despesasReais?.[empMesKey]||{}),[d.id]:parseFloat(e.target.value)||0}}}))}
                              style={{textAlign:"right",width:100,fontSize:12,padding:"4px 6px"}}/>
                          </td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:diff>0?"#ef4444":diff<0?"#22c55e":th.textLow}}>{diff===0?"—":`${diff>0?"+":""}${fE(diff)}`}</td>
                        </tr>
                      );
                    })}
                    {isSubsidio&&(
                      <tr style={{background:"rgba(245,158,11,0.06)",borderTop:"1px solid rgba(245,158,11,0.3)"}}>
                        <td style={{padding:"7px 10px",color:"#f59e0b"}}>⚠️ Subsídio extra (sal+TSU+IRS)</td>
                        <td colSpan={2} style={{padding:"7px 10px",textAlign:"right",color:"#f59e0b",fontWeight:600}}>{fE(subsidioExtra)}</td>
                        <td/>
                      </tr>
                    )}
                    {/* Despesas variáveis como linhas individuais */}
                    {despVar.length>0&&<>
                      <tr><td colSpan={4} style={{padding:"6px 10px 2px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,background:"rgba(59,130,246,0.03)",borderTop:`1px solid ${th.border}`}}>Despesas variáveis</td></tr>
                      {despVar.map(dv=>{
                        const catInfo=EMP_CATS_VARIAVEIS.find(c=>c.id===dv.cat);
                        return(<tr key={dv.id} style={{background:"rgba(59,130,246,0.02)",borderBottom:`1px solid ${th.border}`}}>
                          <td style={{padding:"6px 10px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span>{catInfo?.icon||"📦"}</span>
                              <div>
                                <p style={{fontSize:12}}>{dv.nota||catInfo?.label||"Despesa variável"}</p>
                                <p style={{fontSize:10,color:th.textLow}}>{catInfo?.label}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"6px 10px",textAlign:"right",color:th.textLow,fontSize:12}}>—</td>
                          <td style={{padding:"6px 10px",textAlign:"right",color:"#ef4444",fontSize:12}}>{fE(dv.valor)}</td>
                          <td style={{padding:"6px 10px",textAlign:"right",fontSize:10,color:"#f59e0b"}}>{catInfo?.ta>0?`TA ${(catInfo.ta*100).toFixed(0)}%`:""}</td>
                        </tr>);
                      })}
                    </>}
                    <tr style={{background:"rgba(239,68,68,0.08)",borderTop:"2px solid rgba(239,68,68,0.3)"}}>
                      <td style={{padding:"9px 10px",fontWeight:700,color:"#ef4444"}}>TOTAL</td>
                      <td style={{padding:"9px 10px",textAlign:"right",color:th.textLow,fontWeight:600}}>{fE(EMP_DESPESAS_FIXAS.reduce((a,d)=>a+d.valor,0))}</td>
                      <td style={{padding:"9px 10px",textAlign:"right",fontWeight:700,color:"#ef4444"}}>{fE(totalDespesas)}</td>
                      <td/>
                    </tr>
                    <tr style={{background:resultado>=0?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",borderTop:"2px solid "+(resultado>=0?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)")}}>
                      <td style={{padding:"9px 10px",fontWeight:700,color:resultado>=0?"#22c55e":"#ef4444"}}>RESULTADO</td>
                      <td colSpan={2} style={{padding:"9px 10px",textAlign:"right",fontWeight:700,fontSize:16,color:resultado>=0?"#22c55e":"#ef4444"}}>{fE(resultado)}</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </Card>

              {/* Despesas variáveis */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <p style={{fontSize:13,fontWeight:600,color:th.text}}>➕ Despesas Variáveis — {MESES[fMes]}</p>
                    <p style={{fontSize:10,color:th.textLow,marginTop:2}}>Refeições negócio, representação, outros pontuais</p>
                  </div>
                  <button onClick={()=>setEmpData(p=>{
                    const cur=p.despesasVar?.[empMesKey]||[];
                    return{...p,despesasVar:{...p.despesasVar,[empMesKey]:[...cur,{id:crypto.randomUUID(),cat:"rep_refeicao",label:"",valor:0,nota:""}]}};
                  })} style={{background:"rgba(59,130,246,0.1)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.3)",borderRadius:8,padding:"6px 12px",fontSize:12}}>
                    + Adicionar
                  </button>
                </div>

                {despVar.length===0&&<p style={{fontSize:12,color:th.textLow,textAlign:"center",padding:"12px 0"}}>Sem despesas variáveis este mês.</p>}

                {despVar.map((d,i)=>{
                  const catInfo=EMP_CATS_VARIAVEIS.find(c=>c.id===d.cat);
                  const ta=(d.valor||0)*(catInfo?.ta||0);
                  return(
                    <div key={d.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 90px 70px 28px",gap:6,marginBottom:8,padding:"8px 10px",background:darkMode?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)",borderRadius:10,alignItems:"center"}}>
                      <div>
                        <Lbl>Categoria</Lbl>
                        <select value={d.cat}
                          onChange={e=>setEmpData(p=>{const v=[...(p.despesasVar?.[empMesKey]||[])];v[i]={...v[i],cat:e.target.value};return{...p,despesasVar:{...p.despesasVar,[empMesKey]:v}};})}
                          style={{fontSize:11,padding:"4px 6px"}}>
                          {EMP_CATS_VARIAVEIS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}{c.ta>0?` (TA ${c.ta*100}%)`:"" }</option>)}
                        </select>
                      </div>
                      <div>
                        <Lbl>Descrição</Lbl>
                        <input type="text" value={d.nota} placeholder="Ex: Almoço cliente X"
                          onChange={e=>setEmpData(p=>{const v=[...(p.despesasVar?.[empMesKey]||[])];v[i]={...v[i],nota:e.target.value};return{...p,despesasVar:{...p.despesasVar,[empMesKey]:v}};})}
                          style={{fontSize:11,padding:"4px 6px"}}/>
                      </div>
                      <div>
                        <Lbl>Valor (€)</Lbl>
                        <input type="number" value={d.valor} step="0.01"
                          onChange={e=>setEmpData(p=>{const v=[...(p.despesasVar?.[empMesKey]||[])];v[i]={...v[i],valor:parseFloat(e.target.value)||0};return{...p,despesasVar:{...p.despesasVar,[empMesKey]:v}};})}
                          style={{fontSize:11,padding:"4px 6px",textAlign:"right"}}/>
                      </div>
                      <div style={{textAlign:"right"}}>
                        {ta>0&&<><Lbl>TA</Lbl><span style={{fontSize:11,color:"#f59e0b",fontWeight:600}}>{fE(ta)}</span></>}
                      </div>
                      <button onClick={()=>setEmpData(p=>{const v=(p.despesasVar?.[empMesKey]||[]).filter((_,j)=>j!==i);return{...p,despesasVar:{...p.despesasVar,[empMesKey]:v}};})}
                        style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"none",borderRadius:6,padding:"4px 6px",fontSize:14}}>×</button>
                    </div>
                  );
                })}

                {despVar.length>0&&(
                  <div style={{marginTop:10,borderTop:`1px solid ${th.border}`,paddingTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:th.textLow}}>Total despesas variáveis</span>
                      <span style={{fontSize:13,fontWeight:600,color:"#ef4444"}}>{fE(totalDespVar)}</span>
                    </div>
                    {totalTA>0&&<>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:12,color:th.textLow}}>TA ajudas de custo (5% × {fE(despMes["ajudas"]||750)})</span>
                        <span style={{fontSize:12,color:"#f59e0b"}}>{fE(taAjudas)}</span>
                      </div>
                      {taRep>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:12,color:th.textLow}}>TA representação (10%)</span>
                        <span style={{fontSize:12,color:"#f59e0b"}}>{fE(taRep)}</span>
                      </div>}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",background:"rgba(245,158,11,0.08)",borderRadius:8,marginTop:4}}>
                        <span style={{fontSize:12,fontWeight:600,color:"#f59e0b"}}>Total Tributações Autónomas</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#f59e0b"}}>{fE(totalTA)}</span>
                      </div>
                    </>}
                  </div>
                )}
                {/* Always show TA on ajudas */}
                {despVar.length===0&&<div style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",background:"rgba(245,158,11,0.06)",borderRadius:8,marginTop:8}}>
                  <span style={{fontSize:11,color:th.textLow}}>TA ajudas de custo (5% × {fE(despMes["ajudas"]||750)})</span>
                  <span style={{fontSize:11,fontWeight:600,color:"#f59e0b"}}>{fE(taAjudas)}</span>
                </div>}
              </Card>

            </div>

            {/* ── TAB ANUAL ── */}
            <div style={{display:empTab==="anual"?"block":"none"}}>

              {/* KPIs anuais */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
                {[
                  {label:"Receita Total s/IVA",val:totalRec,color:"#22c55e"},
                  {label:"Receita Total c/IVA",val:totalRec*1.23,color:"#3b82f6"},
                  {label:"Despesas Total",val:totalDesp,color:"#ef4444"},
                  {label:"Resultado Bruto",val:totalRes,color:totalRes>=0?"#22c55e":"#ef4444"},
                ].map(k=>(
                  <div key={k.label} style={{background:th.bgCard,border:`1px solid ${k.color}33`,borderRadius:14,padding:"14px"}}>
                    <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p>
                    <p style={{fontSize:18,fontWeight:700,color:k.color}}>{fE(k.val)}</p>
                  </div>
                ))}
              </div>

              {/* IRC + resultado líquido */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
                <div style={{background:th.bgCard,border:"1px solid rgba(168,85,247,0.3)",borderRadius:14,padding:"14px"}}>
                  <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Carga Fiscal estimada</p>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:th.textLow}}>IRC (17% PME)</span>
                      <span style={{fontSize:12,fontWeight:600,color:"#a855f7"}}>{totalRes>0?fE(totalRes*0.17):"—"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:th.textLow}}>Tributações autónomas</span>
                      <span style={{fontSize:12,fontWeight:600,color:"#f59e0b"}}>{fE(totalTAAnual)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${th.border}`,paddingTop:4,marginTop:2}}>
                      <span style={{fontSize:11,fontWeight:600,color:th.text}}>Total fiscal</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#a855f7"}}>{totalRes>0?fE(totalRes*0.17+totalTAAnual):fE(totalTAAnual)}</span>
                    </div>
                  </div>
                  <p style={{fontSize:10,color:th.textLow,marginTop:8}}>PPC: 3×{fE(134)} = {fE(402)} · Acerto Mai 2027</p>
                </div>
                <div style={{background:th.bgCard,border:`1px solid ${totalRes>0?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,borderRadius:14,padding:"14px"}}>
                  <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Resultado líquido estimado</p>
                  <p style={{fontSize:22,fontWeight:700,color:totalRes>0?"#22c55e":"#ef4444"}}>
                    {totalRes>0?fE(totalRes*0.17+totalTAAnual>totalRes?0:totalRes-(totalRes*0.17+totalTAAnual)):fE(totalRes)}
                  </p>
                  <p style={{fontSize:10,color:th.textLow,marginTop:4}}>Após IRC + Tributações Autónomas</p>
                  <p style={{fontSize:10,color:th.textLow}}>Margem média: {fE((totalRes>0?totalRes*0.83:totalRes)/12)}/mês</p>
                </div>
              </div>

              {/* IVA por trimestre */}
              <Card>
                <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:10}}>🧾 IVA por Trimestre</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
                  {ivaQ.map(q=>{
                    const passado=new Date(q.data)<hoje;
                    return(
                      <div key={q.label} style={{background:"rgba(245,158,11,0.06)",border:`1px solid ${passado?th.border:"rgba(245,158,11,0.2)"}`,borderRadius:10,padding:"10px 12px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <p style={{fontSize:11,fontWeight:600,color:passado?th.textLow:"#f59e0b"}}>{q.label}</p>
                          <p style={{fontSize:10,color:th.textLow}}>{q.data.slice(5)}</p>
                        </div>
                        <p style={{fontSize:16,fontWeight:700,color:passado?th.textLow:"#f59e0b"}}>{fE(q.iva)}</p>
                        {!passado&&<p style={{fontSize:9,color:th.textLow,marginTop:2}}>{Math.ceil((new Date(q.data)-hoje)/(1000*60*60*24))}d</p>}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:"rgba(245,158,11,0.08)",borderRadius:8}}>
                  <span style={{fontSize:12,color:th.textMid}}>Total IVA anual estimado</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#f59e0b"}}>{fE(ivaAnual)}</span>
                </div>
              </Card>

              {/* Próximas obrigações (todas) */}
              <Card>
                <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:12}}>📆 Calendário Fiscal {fAno}</p>
                {EMP_OBRIGACOES.sort((a,b)=>new Date(a.data)-new Date(b.data)).map(o=>{
                  const d=new Date(o.data);
                  const passado=d<hoje;
                  const diasR=Math.ceil((d-hoje)/(1000*60*60*24));
                  const cor=passado?th.textLow:diasR<=30?"#ef4444":diasR<=60?"#f59e0b":"#22c55e";
                  const tipoColor=o.tipo==="iva"?"#f59e0b":o.tipo==="irc"?"#3b82f6":th.textMid;
                  return(
                    <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #0d1a2e",opacity:passado?0.45:1}}>
                      <div style={{width:36,height:36,borderRadius:8,background:tipoColor+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:9,fontWeight:700,color:tipoColor}}>{o.tipo.toUpperCase()}</span>
                      </div>
                      <div style={{flex:1}}>
                        <p style={{fontSize:12,fontWeight:500}}>{o.label}</p>
                        <p style={{fontSize:10,color:th.textLow}}>{o.data}</p>
                      </div>
                      <div style={{textAlign:"right"}}>
                        {o.valor_est&&<p style={{fontSize:12,fontWeight:600,color:th.text}}>{fE(o.valor_est)}</p>}
                        <p style={{fontSize:11,fontWeight:600,color:cor}}>{passado?"✓":diasR+"d"}</p>
                      </div>
                    </div>
                  );
                })}
              </Card>

              {/* Tabela anual */}
              <Card>
                <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:12}}>📊 Detalhe Anual — {fAno}</p>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:600}}>
                    <thead>
                      <tr style={{background:th.bgAlt}}>
                        {["Mês","Dias","s/IVA","c/IVA","IVA","Despesas","Resultado"].map(h=>(
                          <th key={h} style={{padding:"6px 8px",textAlign:h==="Mês"||h==="Dias"?"left":"right",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {anoOverview.map(m=>(
                        <tr key={m.mes} className="hrow" style={{borderBottom:"1px solid #0a1220",background:m.mes===fMes?"rgba(59,130,246,0.06)":"transparent"}}>
                          <td style={{padding:"7px 8px",fontWeight:m.mes===fMes?700:400,color:m.mes===fMes?"#3b82f6":th.text}}>
                            {MESES[m.mes]}{EMP_MESES_SUBSIDIO.includes(m.mes)&&<span style={{fontSize:9,color:"#f59e0b",marginLeft:4}}>+sub</span>}
                          </td>
                          <td style={{padding:"4px 6px"}}>
                            <input type="number" value={empData.diasTrabalhados?.[m.mk]??EMP_DIAS_UTEIS_BASE[m.mk]??20} min={0} max={31} step={0.5}
                              onChange={e=>setEmpData(p=>({...p,diasTrabalhados:{...p.diasTrabalhados,[m.mk]:parseFloat(e.target.value)||0}}))}
                              style={{width:54,fontSize:11,padding:"2px 4px",textAlign:"center"}}/>
                          </td>
                          <td style={{padding:"4px 6px",textAlign:"right"}}>
                            <input type="number" value={empData.receitaReal?.[m.mk]??Math.round((empData.diasTrabalhados?.[m.mk]??EMP_DIAS_UTEIS_BASE[m.mk]??20)*EMP_TAXA_DIARIA*100)/100} step="0.01"
                              onChange={e=>setEmpData(p=>({...p,receitaReal:{...(p.receitaReal||{}),[m.mk]:parseFloat(e.target.value)||0}}))}
                              style={{width:80,fontSize:11,padding:"2px 4px",textAlign:"right",color:"#22c55e",fontWeight:600}}/>
                          </td>
                          <td style={{padding:"7px 8px",textAlign:"right",color:"#3b82f6"}}>{fE(m.rec*1.23)}</td>
                          <td style={{padding:"7px 8px",textAlign:"right",color:"#f59e0b"}}>{fE(m.iva)}</td>
                          <td style={{padding:"7px 8px",textAlign:"right",color:"#ef4444"}}>{fE(m.desp)}</td>
                          <td style={{padding:"7px 8px",textAlign:"right",fontWeight:600,color:m.res>=0?"#22c55e":"#ef4444"}}>{fE(m.res)}</td>
                        </tr>
                      ))}
                      <tr style={{background:darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",borderTop:`2px solid ${th.border}`,fontWeight:700}}>
                        <td style={{padding:"8px",color:th.text}} colSpan={2}>TOTAL</td>
                        <td style={{padding:"8px",textAlign:"right",color:"#22c55e"}}>{fE(totalRec)}</td>
                        <td style={{padding:"8px",textAlign:"right",color:"#3b82f6"}}>{fE(totalRec*1.23)}</td>
                        <td style={{padding:"8px",textAlign:"right",color:"#f59e0b"}}>{fE(ivaAnual)}</td>
                        <td style={{padding:"8px",textAlign:"right",color:"#ef4444"}}>{fE(totalDesp)}</td>
                        <td style={{padding:"8px",textAlign:"right",color:totalRes>=0?"#22c55e":"#ef4444"}}>{fE(totalRes)}</td>
                      </tr>
                      {totalRes>0&&(
                        <>
                          <tr style={{background:"rgba(168,85,247,0.06)",borderTop:"1px solid rgba(168,85,247,0.2)"}}>
                            <td style={{padding:"7px 8px",color:"#a855f7",fontWeight:600}} colSpan={6}>IRC estimado (17%)</td>
                            <td style={{padding:"7px 8px",textAlign:"right",fontWeight:700,color:"#a855f7"}}>-{fE(totalRes*0.17)}</td>
                          </tr>
                          <tr style={{background:"rgba(34,197,94,0.06)",borderTop:"1px solid rgba(34,197,94,0.2)"}}>
                            <td style={{padding:"8px",color:"#22c55e",fontWeight:700}} colSpan={6}>Resultado líquido estimado</td>
                            <td style={{padding:"8px",textAlign:"right",fontWeight:700,fontSize:14,color:"#22c55e"}}>{fE(totalRes*0.83)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

            </div>

          </div>


          {isMobile&&<div className="tabbar">
            <button onClick={()=>setScreen("landing")} style={{color:th.textLow,flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none",fontSize:10}}><span style={{fontSize:18}}>🏠</span>Hub</button>
            <button onClick={()=>{setEmpTab("mensal");}} className={empTab==="mensal"?"act":""} style={{flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none",fontSize:10}}><span style={{fontSize:18}}>📅</span>Mensal</button>
            <button onClick={()=>{setEmpTab("anual");}} className={empTab==="anual"?"act":""} style={{flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none",fontSize:10}}><span style={{fontSize:18}}>📊</span>Anual</button>
          </div>}
        </div>
      </>
      </ThemeCtx.Provider>
    );
  }

  // ── PLANO ─────────────────────────────────────────────────
  if(screen==="plano") return (
    <ThemeCtx.Provider value={th}>
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",paddingBottom:isMobile?80:0,background:th.bg,color:th.text}}>
        <div style={{background:th.bgAlt,borderBottom:`1px solid ${th.border}`,padding:`12px ${px}`,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:50}}>
          <button onClick={()=>setScreen("landing")} style={{background:`rgba(128,128,128,0.08)`,color:th.textMid,padding:"6px 12px",border:`1px solid ${th.border}`,fontSize:12,borderRadius:8}}>← Hub</button>
          <p style={{fontSize:15,fontWeight:600,color:th.text}}>🎯 Liberdade Financeira</p>
          <div style={{display:"flex",gap:6,marginLeft:"auto",alignItems:"center"}}>
            <div style={{display:"flex",gap:0,background:`rgba(128,128,128,0.08)`,borderRadius:10,padding:3}}>
              {["plano","patrimonio"].map(t=>(
                <button key={t} onClick={()=>setPlanoTab(t)}
                  style={{padding:"5px 14px",fontSize:12,fontWeight:500,borderRadius:8,background:planoTab===t?"rgba(59,130,246,0.3)":"none",color:planoTab===t?th.text:th.textLow,border:"none",cursor:"pointer"}}>
                  {t==="plano"?"📋 Plano":"💎 Património"}
                </button>
              ))}
            </div>
            <ThemeToggle/>
          </div>
        </div>
        <div style={{padding:mainPad,maxWidth:isMobile?undefined:960,margin:"0 auto"}} className="fade">

        {/* ── TAB: PLANO ── */}
        <div style={{display:planoTab==="plano"?"block":"none"}}>

          {/* 4 níveis overview */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {PLAN_LEVELS.map(lv=>{
              const isA=lv.id===1;
              // Determine progress for each level
              const progVal=lv.id===1?appSaldo+caSaldo:0;
              const pct=lv.id===1?progressL1:0;
              // Dates
              const datas={1:{ini:"Abr 2026",fim:"Nov 2026"},2:{ini:"Jan 2027",fim:"Fev 2028"},3:{ini:"Mar 2028",fim:"Out 2028"},4:{ini:"Nov 2028",fim:"IF"}};
              return(
                <div key={lv.id} style={{background:th.bgCard,border:`1px solid ${isA?lv.color+"55":th.border}`,borderRadius:14,padding:14,opacity:isA?1:0.5}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{width:24,height:24,borderRadius:6,background:lv.color+"22",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:lv.color}}>{lv.id}</span>
                    </div>
                    {isA&&<Chip label="ATIVO" color={lv.color} sm/>}
                  </div>
                  <p style={{fontSize:12,fontWeight:600,color:isA?lv.color:th.textMid,marginBottom:2}}>{lv.name}</p>
                  <p style={{fontSize:11,fontWeight:700,color:th.text,marginBottom:4}}>{fE(lv.target)}</p>
                  <div style={{fontSize:9,color:th.textLow,marginBottom:6}}>📅 {datas[lv.id].ini} → {datas[lv.id].fim}</div>
                  {isA&&<>
                    <PBar val={appSaldo+caSaldo} max={L1_TOTAL} color={lv.color} h={6}/>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{fontSize:9,color:th.textLow}}>{progressL1.toFixed(1)}%</span>
                      <span style={{fontSize:9,color:th.textLow}}>≈{monthsLeft}m</span>
                    </div>
                  </>}
                </div>
              );
            })}
          </div>

          {/* Nível 1 detalhe — 2 sub-barras */}
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <p style={{fontSize:14,fontWeight:600,color:th.text}}>Nível 1 — Fundo de Emergência</p>
              <span style={{fontSize:12,color:"#22c55e",fontWeight:600}}>{fE(appSaldo+caSaldo)} / {fE(L1_TOTAL)}</span>
            </div>
            {/* Sub-barra Apparte */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13}}>🏺</span>
                  <span style={{fontSize:12,color:th.text}}>Apparte Mealheiro</span>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#22c55e"}}>{fE(appSaldo)}</span>
                  <span style={{fontSize:11,color:th.textLow}}>/ {fE(L1_APPARTE)}</span>
                  <span style={{fontSize:11,color:"#22c55e"}}>{progressApparte.toFixed(0)}%</span>
                </div>
              </div>
              <PBar val={appSaldo} max={L1_APPARTE} color="#22c55e" h={8}/>
              <p style={{fontSize:10,color:th.textLow,marginTop:3}}>Acesso imediato · Buffer de emergência</p>
            </div>
            {/* Sub-barra CA */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13}}>🏦</span>
                  <span style={{fontSize:12,color:th.text}}>Certificados de Aforro</span>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#3b82f6"}}>{fE(caSaldo)}</span>
                  <span style={{fontSize:11,color:th.textLow}}>/ {fE(L1_CA)}</span>
                  <span style={{fontSize:11,color:"#3b82f6"}}>{progressCA.toFixed(0)}%</span>
                </div>
              </div>
              <PBar val={caSaldo} max={L1_CA} color="#3b82f6" h={8}/>
              <p style={{fontSize:10,color:th.textLow,marginTop:3}}>Resgate após 3 meses · Taxa ~2,1% · Garantia Estado</p>
            </div>
            {/* Barra total */}
            <div style={{padding:"10px 12px",background:"rgba(34,197,94,0.06)",borderRadius:10,marginTop:4}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:12,fontWeight:600,color:"#22c55e"}}>Total Nível 1</span>
                <span style={{fontSize:12,color:th.textLow}}>{progressL1.toFixed(1)}% · ≈ {monthsLeft} meses restantes</span>
              </div>
              <PBar val={appSaldo+caSaldo} max={L1_TOTAL} color="#22c55e" h={10}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                <span style={{fontSize:11,color:th.textLow}}>📅 Início: Abr 2026</span>
                <span style={{fontSize:11,color:"#f59e0b"}}>🎯 Previsto: {(()=>{const d=new Date(2026,3,1);d.setMonth(d.getMonth()+monthsLeft);return MESES[d.getMonth()]+" "+d.getFullYear();})()}</span>
              </div>
            </div>
          </Card>

          {/* Histórico Nível 1 */}
          <Card>
            <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:4}}>Histórico — Nível 1</p>
            <p style={{fontSize:11,color:th.textLow,marginBottom:12}}>Total acumulado: Apparte + Certificados de Aforro</p>
            {snaps.map((s,i)=>{const dev=s.actual-s.planned;const hasDetail=s.apparte!=null||s.ca!=null;return(
              <div key={i} style={{padding:"9px 0",borderBottom:`1px solid ${th.border}`}}>
                <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr 80px",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:i===snaps.length-1?"#f59e0b":th.textLow,fontWeight:i===snaps.length-1?700:400}}>{s.label}</span>
                  <div>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:1}}>Plano</p>
                    <p style={{fontSize:12,color:th.textLow}}>{fE(s.planned)}</p>
                  </div>
                  <div>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:1}}>Real</p>
                    <p style={{fontSize:13,fontWeight:600,color:th.text}}>{fE(s.actual)}</p>
                  </div>
                  <span style={{fontSize:12,color:dev>=0?"#22c55e":"#ef4444",fontWeight:600,textAlign:"right"}}>{dev>=0?"+":""}{fE(dev)}</span>
                </div>
                {hasDetail&&<div style={{display:"flex",gap:16,marginTop:4,paddingLeft:88}}>
                  {s.apparte!=null&&<span style={{fontSize:10,color:th.textLow}}>🏺 Mealheiro: <span style={{color:"#22c55e",fontWeight:600}}>{fE(s.apparte)}</span></span>}
                  {s.ca!=null&&<span style={{fontSize:10,color:th.textLow}}>🏦 Cert. Aforro: <span style={{color:"#3b82f6",fontWeight:600}}>{fE(s.ca)}</span></span>}
                </div>}
              </div>
            );})}
            <div style={{marginTop:14,background:darkMode?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)",borderRadius:12,padding:12}}>
              <p style={{fontSize:11,fontWeight:600,color:th.textMid,marginBottom:10}}>Registar novo mês</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <Lbl>Apparte Mealheiro (€)</Lbl>
                  <input type="number" placeholder="Ex: 1350" value={snapApparte}
                    onChange={e=>setSnapApparte(e.target.value)} step="0.01"/>
                </div>
                <div>
                  <Lbl>Certificados de Aforro (€)</Lbl>
                  <input type="number" placeholder="Ex: 0" value={snapCA}
                    onChange={e=>setSnapCA(e.target.value)} step="0.01"/>
                </div>
              </div>
              {(snapApparte||snapCA)&&(
                <div style={{padding:"6px 10px",background:"rgba(34,197,94,0.08)",borderRadius:8,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:th.textLow}}>Total calculado</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>{fE((parseFloat(snapApparte)||0)+(parseFloat(snapCA)||0))}</span>
                </div>
              )}
              <Btn variant="primary" full style={{fontSize:13}} onClick={()=>{
                const vApp=parseFloat(snapApparte)||0;
                const vCA=parseFloat(snapCA)||0;
                const v=vApp+vCA;
                if(!v)return;
                const last=snaps[snaps.length-1];let nm=last.month+1,ny=last.year;if(nm>11){nm=0;ny++;}
                const pl=Math.min(800*Math.max(0,nm-3+(ny-2026)*12),L1_TOTAL);
                setSnaps(prev=>[...prev,{label:`${MESES[nm]} ${ny}`,year:ny,month:nm,planned:Math.max(0,pl),actual:v,apparte:vApp,ca:vCA,note:v>=pl?"✓ No plano":"⚠ Abaixo"}]);
                setSnapApparte("");setSnapCA("");
              }}>✓ Registar {(()=>{const last=snaps[snaps.length-1];let nm=last.month+1,ny=last.year;if(nm>11){nm=0;ny++;}return `${MESES[nm]} ${ny}`;})()}</Btn>
            </div>
          </Card>

          {/* Nível 4 — projecção melhorada */}
          <Card>
            <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:4}}>Nível 4 — Independência Financeira</p>
            <p style={{fontSize:11,color:th.textLow,marginBottom:12}}>Capital actual: {fE(L1_INVEST)} · 100€/mês até Out 2028, depois 1.200€/mês</p>

            {/* Milestones */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {[{label:"🌅 Liberdade Financeira",val:500000,color:"#06b6d4"},{label:"🔥 FIRE",val:1050000,color:"#8b5cf6"}].map(m=>(
                <div key={m.label} style={{background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:10,padding:"10px 12px",border:`1px solid ${m.color}33`}}>
                  <p style={{fontSize:10,color:th.textLow,marginBottom:3}}>{m.label}</p>
                  <p style={{fontSize:16,fontWeight:700,color:m.color}}>{fE(m.val)}</p>
                </div>
              ))}
            </div>

            {(()=>{
              const hoje = new Date(2026,3,1);
              const calcMilestone=(taxa,target)=>{
                let cap=L1_INVEST; const r=taxa/100/12; let m=0;
                while(cap<target&&m<720){cap=cap*(1+r)+(m<30?100:1200);m++;}
                return m;
              };
              const calcFull=(taxa,years)=>{
                let cap=L1_INVEST; const r=taxa/100/12;
                for(let i=0;i<30;i++) cap=cap*(1+r)+100;
                for(let i=0;i<years*12-30;i++) cap=cap*(1+r)+1200;
                return cap;
              };
              const cenarios=[{taxa:5,color:th.textLow},{taxa:8,color:"#06b6d4"},{taxa:10,color:"#f59e0b"}];

              // Chart data — 40 years
              const chartYears=40;
              const chartPts=cenarios.map(s=>{
                const pts=[{yr:0,val:L1_INVEST}];
                let cap=L1_INVEST; const r=s.taxa/100/12;
                for(let m=1;m<=chartYears*12;m++){
                  cap=cap*(1+r)+(m<=30?100:1200);
                  if(m%12===0) pts.push({yr:m/12,val:cap});
                }
                return{...s,pts};
              });
              const maxVal=Math.max(...chartPts.flatMap(s=>s.pts.map(p=>p.val)),1050000);
              const W=600,H=180,pad={l:60,r:10,t:10,b:30};
              const toX=yr=>(yr/chartYears)*(W-pad.l-pad.r)+pad.l;
              const toY=v=>H-pad.b-((v/maxVal)*(H-pad.t-pad.b));
              // Y axis ticks
              const yTicks=[0,250000,500000,750000,1050000];
              const fmtY=v=>v>=1000000?(v/1000000).toFixed(2)+"M":v>=1000?(v/1000).toFixed(0)+"k":"0";
              // X axis ticks
              const xTicks=[0,5,10,15,20,25,30,35,40];

              return(<>
                {/* Cenários grid */}
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:8,marginBottom:14}}>
                  {cenarios.map(s=>{
                    const mLF=calcMilestone(s.taxa,500000);
                    const mFIRE=calcMilestone(s.taxa,1050000);
                    const dtLF=new Date(hoje);dtLF.setMonth(dtLF.getMonth()+mLF);
                    const dtFIRE=new Date(hoje);dtFIRE.setMonth(dtFIRE.getMonth()+mFIRE);
                    const anosLF=Math.round(mLF/12);
                    const anosFIRE=Math.round(mFIRE/12);
                    const v10=calcFull(s.taxa,10),v20=calcFull(s.taxa,20),v30=calcFull(s.taxa,30);
                    return(
                      <div key={s.taxa} style={{background:th.bg,borderRadius:10,padding:"12px",border:`1px solid ${s.color}22`}}>
                        <p style={{fontSize:12,fontWeight:700,color:s.color,marginBottom:10}}>Cenário {s.taxa}%</p>
                        <div style={{display:"flex",flexDirection:"column",gap:5}}>
                          <div style={{padding:"6px 8px",background:"rgba(6,182,212,0.08)",borderRadius:6}}>
                            <p style={{fontSize:9,color:th.textLow,marginBottom:1}}>🌅 Liberdade Financeira</p>
                            <p style={{fontSize:11,fontWeight:600,color:"#06b6d4"}}>{MESES[dtLF.getMonth()]} {dtLF.getFullYear()} <span style={{color:th.textLow,fontWeight:400}}>· daqui a {anosLF}a</span></p>
                          </div>
                          <div style={{padding:"6px 8px",background:"rgba(139,92,246,0.08)",borderRadius:6}}>
                            <p style={{fontSize:9,color:th.textLow,marginBottom:1}}>🔥 FIRE</p>
                            <p style={{fontSize:11,fontWeight:600,color:"#8b5cf6"}}>{MESES[dtFIRE.getMonth()]} {dtFIRE.getFullYear()} <span style={{color:th.textLow,fontWeight:400}}>· daqui a {anosFIRE}a</span></p>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                            <span style={{fontSize:10,color:th.textLow}}>10a</span>
                            <span style={{fontSize:10,color:th.text}}>{v10>=1000000?(v10/1000000).toFixed(2)+"M":(v10/1000).toFixed(0)+"k"}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:10,color:th.textLow}}>20a</span>
                            <span style={{fontSize:11,fontWeight:600,color:th.text}}>{v20>=1000000?(v20/1000000).toFixed(2)+"M":(v20/1000).toFixed(0)+"k"}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:10,color:th.textLow}}>30a</span>
                            <span style={{fontSize:12,fontWeight:700,color:s.color}}>{v30>=1000000?(v30/1000000).toFixed(2)+"M":(v30/1000).toFixed(0)+"k"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Gráfico linhas */}
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:600,color:th.text,marginBottom:8}}>Projecção de crescimento</p>
                  {(()=>{
                    // Better Y scale
                    const maxChartVal=Math.max(...chartPts.find(s=>s.taxa===10).pts.map(p=>p.val));
                    const mag=Math.pow(10,Math.floor(Math.log10(maxChartVal)));
                    const niceMax=Math.ceil(maxChartVal/mag)*mag;
                    const yStep=niceMax/5;
                    const yTicks2=Array.from({length:6},(_,i)=>i*yStep);
                    const toY2=v=>pad.t+((1-v/niceMax)*(H-pad.t-pad.b));
                    const fmtY2=v=>v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"k":"0";
                    return(
                      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{overflow:"visible"}}>
                        {/* Grid horizontal + Y labels */}
                        {yTicks2.map(v=>(
                          <g key={v}>
                            <line x1={pad.l} y1={toY2(v)} x2={W-pad.r} y2={toY2(v)} stroke={th.border} strokeWidth="1" strokeDasharray="3,3"/>
                            <text x={pad.l-5} y={toY2(v)+4} textAnchor="end" fill={th.textMid} fontSize="10" fontWeight="500">{fmtY2(v)}</text>
                          </g>
                        ))}
                        {/* Grid vertical + X labels */}
                        {xTicks.map(yr=>(
                          <g key={yr}>
                            <line x1={toX(yr)} y1={pad.t} x2={toX(yr)} y2={H-pad.b} stroke={th.border} strokeWidth="1" strokeDasharray="2,4"/>
                            <text x={toX(yr)} y={H-pad.b+13} textAnchor="middle" fill={th.textMid} fontSize="10">{yr}a</text>
                          </g>
                        ))}
                        {/* LF e FIRE lines */}
                        <line x1={pad.l} y1={toY2(500000)} x2={W-pad.r} y2={toY2(500000)} stroke="#06b6d4" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
                        <text x={W-pad.r+3} y={toY2(500000)+4} fill="#06b6d4" fontSize="9">LF</text>
                        <line x1={pad.l} y1={toY2(1050000)} x2={W-pad.r} y2={toY2(1050000)} stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
                        <text x={W-pad.r+3} y={toY2(1050000)+4} fill="#8b5cf6" fontSize="9">FIRE</text>
                        {/* Cenário lines + endpoint labels */}
                        {chartPts.map(s=>{
                          const lastPt=s.pts[s.pts.length-1];
                          return(
                            <g key={s.taxa}>
                              <polyline
                                points={s.pts.map(p=>`${toX(p.yr)},${toY2(p.val)}`).join(" ")}
                                fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"/>
                              <circle cx={toX(lastPt.yr)} cy={toY2(lastPt.val)} r="4" fill={s.color} stroke={th.bg} strokeWidth="2"/>
                              <text x={toX(lastPt.yr)-5} y={toY2(lastPt.val)-10} textAnchor="end" fill={s.color} fontSize="10" fontWeight="700">{fmtY2(lastPt.val)}</text>
                            </g>
                          );
                        })}
                        {/* Eixos */}
                        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H-pad.b} stroke={th.border} strokeWidth="1"/>
                        <line x1={pad.l} y1={H-pad.b} x2={W-pad.r} y2={H-pad.b} stroke={th.border} strokeWidth="1"/>
                      </svg>
                    );
                  })()}
                  {/* Legenda */}
                  <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:6}}>
                    {cenarios.map(s=>(
                      <div key={s.taxa} style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:16,height:2,background:s.color,borderRadius:1}}/>
                        <span style={{fontSize:10,color:th.textLow}}>{s.taxa}%</span>
                      </div>
                    ))}
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{width:16,height:1,background:"#06b6d4",borderRadius:1,borderTop:"1px dashed #06b6d4"}}/>
                      <span style={{fontSize:10,color:th.textLow}}>LF 500k</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{width:16,height:1,background:"#8b5cf6",borderRadius:1,borderTop:"1px dashed #8b5cf6"}}/>
                      <span style={{fontSize:10,color:th.textLow}}>FIRE 1.05M</span>
                    </div>
                  </div>
                </div>
              </>);
            })()}
          </Card>

          {/* Sub-tab Simulador */}
          <Card>
            <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:12}}>🧮 Simulador de Investimento</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              <div><Lbl>Capital inicial (€)</Lbl>
                <input type="number" value={simCapital} onChange={e=>setSimCapital(parseFloat(e.target.value)||0)} style={{fontSize:14}}/>
              </div>
              <div><Lbl>Mensal (€)</Lbl>
                <input type="number" value={simMensal} onChange={e=>setSimMensal(parseFloat(e.target.value)||0)} style={{fontSize:14}}/>
              </div>
              <div><Lbl>Taxa anual (%)</Lbl>
                <input type="number" value={simTaxa} step="0.5" onChange={e=>setSimTaxa(parseFloat(e.target.value)||0)} style={{fontSize:14}}/>
              </div>
            </div>
            {/* Chart */}
            {(()=>{
              const anos=[5,10,15,20,25,30];
              const calcSim=(anos)=>{let c=simCapital;const r=simTaxa/100/12;for(let i=0;i<anos*12;i++)c=c*(1+r)+simMensal;return c;};
              const vals=anos.map(a=>({anos:a,val:calcSim(a)}));
              const maxV=Math.max(...vals.map(v=>v.val),1);
              return(
                <div>
                  <div style={{display:"flex",gap:6,alignItems:"flex-end",height:120,marginBottom:8}}>
                    {vals.map(v=>(
                      <div key={v.anos} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <p style={{fontSize:9,color:"#22c55e",fontWeight:600}}>{v.val>=1000000?(v.val/1000000).toFixed(1)+"M":(v.val/1000).toFixed(0)+"k"}</p>
                        <div style={{width:"100%",background:"linear-gradient(to top,#22c55e,#06b6d4)",borderRadius:"4px 4px 0 0",height:`${(v.val/maxV)*90}px`,minHeight:4}}/>
                        <p style={{fontSize:10,color:th.textLow}}>{v.anos}a</p>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                    {[10,20,30].map(a=>{
                      const v=calcSim(a);
                      const inv=simCapital+simMensal*a*12;
                      const ganho=v-inv;
                      return(
                        <div key={a} style={{background:th.bg,borderRadius:8,padding:"8px 10px"}}>
                          <p style={{fontSize:9,color:th.textLow,marginBottom:3}}>Aos {a} anos</p>
                          <p style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>{v>=1000000?(v/1000000).toFixed(2)+"M":fE(v)}</p>
                          <p style={{fontSize:9,color:th.textLow}}>Investido: {fE(inv)}</p>
                          <p style={{fontSize:9,color:"#06b6d4"}}>Ganho: +{ganho>=1000000?(ganho/1000000).toFixed(2)+"M":fE(ganho)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </Card>

        </div>
        </div>

        {/* ── TAB: PATRIMÓNIO ── */}
        <div style={{display:planoTab==="patrimonio"?"block":"none"}}>

          {/* Sub-tabs */}
          <div style={{display:"flex",gap:0,background:`rgba(${th.bg==="#f0ece4"?"0,0,0":"255,255,255"},0.05)`,borderRadius:10,padding:3,marginBottom:14,width:"fit-content"}}>
            {[{id:"geral",label:"📊 Geral"},{id:"investimentos",label:"📈 Investimentos"},{id:"registar",label:"✏️ Registar"}].map(t=>(
              <button key={t.id} onClick={()=>setPatSubTab(t.id)}
                style={{padding:"6px 14px",fontSize:12,fontWeight:500,borderRadius:8,background:patSubTab===t.id?"rgba(168,85,247,0.3)":"none",color:patSubTab===t.id?th.text:th.textLow,border:"none",cursor:"pointer"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── SUB-TAB GERAL ── */}
          <div style={{maxWidth:isMobile?undefined:1100,margin:"0 auto"}}>
          {patSubTab==="geral"&&(()=>{
            const latest=patSnaps[patSnaps.length-1];
            const prev=patSnaps[patSnaps.length-2];
            if(!latest) return <Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:th.textLow}}>Ainda sem dados. Vai a ✏️ Registar para começar.</p></Card>;
            const tA=Object.values(latest.ativos||{}).reduce((a,v)=>a+(v.valor||0),0);
            const tP=Object.values(latest.passivos||{}).reduce((a,v)=>a+v,0);
            const pat=tA-tP;
            const prevPat=prev?Object.values(prev.ativos||{}).reduce((a,v)=>a+(v.valor||0),0)-Object.values(prev.passivos||{}).reduce((a,v)=>a+v,0):null;
            const diff=prevPat!==null?pat-prevPat:null;
            const pct=prevPat?(diff/Math.abs(prevPat)*100):null;
            // Build 12-month line chart data
            const patAno=patEdit?.slice(0,4)||new Date().getFullYear().toString();
            const lineData=Array.from({length:12},(_,m)=>{
              const mk=`${patAno}-${String(m+1).padStart(2,"0")}`;
              const s=patSnaps.find(x=>x.mes===mk);
              if(!s) return {mes:MESES[m].slice(0,3),val:null};
              const a=Object.values(s.ativos||{}).reduce((x,v)=>x+(v.valor||0),0);
              const p=Object.values(s.passivos||{}).reduce((x,v)=>x+v,0);
              return {mes:MESES[m].slice(0,3),val:a-p};
            });
            const hasLine=lineData.some(d=>d.val!==null);
            const maxLine=Math.max(...lineData.filter(d=>d.val!==null).map(d=>d.val),1);
            const minLine=Math.min(...lineData.filter(d=>d.val!==null).map(d=>d.val),0);
            const range=maxLine-minLine||1;
            return(<>
              {/* KPIs */}
              <div style={{marginBottom:14}}>
                <p style={{fontSize:12,color:th.textLow,marginBottom:10}}>{latest.mes} · último registo</p>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:14}}>
                  {[
                    {label:"Total Ativos",val:tA,color:"#22c55e"},
                    {label:"Total Passivos",val:tP,color:"#ef4444"},
                    {label:"Património Líquido",val:pat,color:"#a855f7"},
                    {label:"Variação mensal",val:diff,color:diff===null?null:diff>=0?"#22c55e":"#ef4444",pct,isVar:true},
                  ].map(k=>(
                    <div key={k.label} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:14,padding:"14px"}}>
                      <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{k.label}</p>
                      {k.val!==null&&k.val!==undefined
                        ?<p style={{fontSize:18,fontWeight:700,color:k.color||th.text}}>{k.isVar&&k.val>=0?"+":""}{fE(k.val)}</p>
                        :<p style={{fontSize:14,color:th.textLow}}>—</p>}
                      {k.isVar&&k.pct!==null&&k.pct!==undefined&&<p style={{fontSize:11,color:k.color,marginTop:2}}>{k.pct>=0?"+":""}{k.pct.toFixed(1)}%</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Line chart 12 meses */}
              {hasLine&&(
                <Card>
                  <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:14}}>Evolução do Património Líquido — {patAno}</p>
                  {(()=>{
                    const PL=50,PR=10,PT=20,PB=30,W2=600,H2=160;
                    const innerW=W2-PL-PR,innerH=H2-PT-PB;
                    const allVals=lineData.filter(d=>d.val!==null).map(d=>d.val);
                    const minV=allVals.length?Math.min(...allVals)*0.98:0;
                    const maxV=allVals.length?Math.max(...allVals)*1.02:1;
                    const rng=maxV-minV||1;
                    const toX2=i=>PL+(i/11)*innerW;
                    const toY2=v=>PT+innerH-((v-minV)/rng)*innerH;
                    // Y ticks
                    const yStep=(maxV-minV)/4;
                    const yTicks2=Array.from({length:5},(_,i)=>minV+yStep*i);
                    const fmtV=v=>v>=1000000?(v/1000000).toFixed(2)+"M":(v/1000).toFixed(1)+"k";
                    // Build segments
                    const pts2=lineData.map((d,i)=>({x:toX2(i),y:d.val!==null?toY2(d.val):null,val:d.val,mes:d.mes}));
                    const segs2=[];let cur2=[];
                    pts2.forEach(p=>{if(p.y!==null)cur2.push(p);else{if(cur2.length>1)segs2.push([...cur2]);cur2=[];}});
                    if(cur2.length>1)segs2.push(cur2);
                    return(
                      <div style={{marginBottom:8}}>
                        <svg viewBox={`0 0 ${W2} ${H2}`} width="100%" height={H2} style={{overflow:"visible"}}>
                          {/* Y grid + labels */}
                          {yTicks2.map((v,i)=>(
                            <g key={i}>
                              <line x1={PL} y1={toY2(v)} x2={W2-PR} y2={toY2(v)} stroke={th.border} strokeWidth="1" strokeDasharray="3,3"/>
                              <text x={PL-4} y={toY2(v)+4} textAnchor="end" fill={th.textLow} fontSize="9">{fmtV(v)}</text>
                            </g>
                          ))}
                          {/* Eixos */}
                          <line x1={PL} y1={PT} x2={PL} y2={H2-PB} stroke={th.border} strokeWidth="1"/>
                          <line x1={PL} y1={H2-PB} x2={W2-PR} y2={H2-PB} stroke={th.border} strokeWidth="1"/>
                          {/* Lines */}
                          {segs2.map((seg,si)=>(
                            <polyline key={si} points={seg.map(p=>`${p.x},${p.y}`).join(" ")}
                              fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinejoin="round"/>
                          ))}
                          {/* Dots + data labels */}
                          {pts2.map((p,i)=>{
                            if(p.y===null) return null;
                            return(
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r="5" fill="#a855f7" stroke={th.bgCard} strokeWidth="2"/>
                                <text x={p.x} y={p.y-10} textAnchor="middle" fill="#a855f7" fontSize="9" fontWeight="600">{fmtV(p.val)}</text>
                                <text x={p.x} y={H2-PB+14} textAnchor="middle" fill={th.textLow} fontSize="9">{p.mes}</text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    );
                  })()}
                </Card>
              )}

              {/* Tabela Excel com meses */}
              {patSnaps.length>1&&(
                <Card>
                  <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:14}}>Histórico</p>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:480}}>
                      <thead>
                        <tr style={{borderBottom:`1px solid ${th.border}`}}>
                          {["Mês","Ativos","Passivos","Pat. Líquido","Variação","Var %"].map(h=>(
                            <th key={h} style={{textAlign:"left",padding:"6px 8px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...patSnaps].reverse().map((s,i,arr)=>{
                          const tA=Object.values(s.ativos||{}).reduce((a,v)=>a+(v.valor||0),0);
                          const tP=Object.values(s.passivos||{}).reduce((a,v)=>a+v,0);
                          const pat=tA-tP;
                          const prevS=arr[i+1];
                          const prevPat=prevS?Object.values(prevS.ativos||{}).reduce((a,v)=>a+(v.valor||0),0)-Object.values(prevS.passivos||{}).reduce((a,v)=>a+v,0):null;
                          const diff=prevPat!==null?pat-prevPat:null;
                          const pct=prevPat?(diff/Math.abs(prevPat)*100):null;
                          return(
                            <tr key={s.mes} className="hrow" style={{borderBottom:"1px solid #0a1220"}}>
                              <td style={{padding:"9px 8px",color:"#f59e0b",fontWeight:600}}>{s.mes}</td>
                              <td style={{padding:"9px 8px",color:"#22c55e"}}>{fE(tA)}</td>
                              <td style={{padding:"9px 8px",color:"#ef4444"}}>{fE(tP)}</td>
                              <td style={{padding:"9px 8px",fontWeight:700,color:"#a855f7"}}>{fE(pat)}</td>
                              <td style={{padding:"9px 8px",color:diff===null?th.textLow:diff>=0?"#22c55e":"#ef4444"}}>{diff===null?"—":`${diff>=0?"+":""}${fE(diff)}`}</td>
                              <td style={{padding:"9px 8px",color:pct===null?th.textLow:pct>=0?"#22c55e":"#ef4444"}}>{pct===null?"—":`${pct>=0?"+":""}${pct.toFixed(1)}%`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>);
          })()}

          {/* ── SUB-TAB INVESTIMENTOS ── */}
          {patSubTab==="investimentos"&&(()=>{
            if(!patSnaps.length) return <Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:th.textLow}}>Ainda sem dados. Vai a ✏️ Registar para começar.</p></Card>;
            const latest=patSnaps[patSnaps.length-1];
            const invItems=PATRIMONIO_ATIVOS.filter(a=>a.grupo==="investimento");
            return(<>
              {/* Grid geral */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:10,marginBottom:14}}>
                {invItems.map(item=>{
                  const d=latest.ativos?.[item.id];
                  if(!d?.valor) return null;
                  // Get value from contas if available
                  // Source priority: 1) latest patSnap, 2) conta saldo, 3) v0
                  const latestPatVal=patSnaps.length>0?patSnaps[patSnaps.length-1]?.ativos?.[item.id]?.valor:null;
                  const contaMatch=item.contaId?contas.find(c=>c.id===item.contaId):null;
                  const valorReal=latestPatVal??contaMatch?.saldo??item.v0??0;
                  // Previous month from patSnaps
                  const prevPatVal=patSnaps.length>1?patSnaps[patSnaps.length-2]?.ativos?.[item.id]?.valor:null;
                  const ganhoMes=prevPatVal!=null?valorReal-prevPatVal:null;
                  const investido=d?.investido||item.v0||0;
                  const ganhoTotal=investido>0?valorReal-investido:null;
                  const pctTotal=investido>0&&ganhoTotal!=null?ganhoTotal/investido*100:null;
                  return(
                    <div key={item.id} style={{background:th.bgCard,border:`1px solid ${ganhoTotal>=0?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,borderRadius:14,padding:14,cursor:"pointer",outline:invSelected===item.id?"2px solid #a855f7":"none"}}
                      onClick={()=>setInvSelected(item.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <span style={{fontSize:20}}>{item.icon}</span>
                        <p style={{fontSize:12,fontWeight:600,color:th.text}}>{item.label}</p>
                      </div>
                      <p style={{fontSize:20,fontWeight:700,color:th.text,marginBottom:4}}>{fE(valorReal)}</p>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                        {d.investido&&<span style={{fontSize:10,color:th.textLow}}>invest. {fE(d.investido)}</span>}
                        {ganhoTotal!==null&&<span style={{fontSize:11,fontWeight:600,color:ganhoTotal>=0?"#22c55e":"#ef4444"}}>{ganhoTotal>=0?"↑":"↓"}{fE(Math.abs(ganhoTotal))}{pctTotal!==null?` (${pctTotal>=0?"+":""}${pctTotal.toFixed(1)}%)`:""}</span>}
                      </div>
                      {ganhoMes!==null&&<p style={{fontSize:11,marginTop:4,color:ganhoMes>=0?"#22c55e":"#ef4444"}}>Mês: {ganhoMes>=0?"+":""}{fE(ganhoMes)}</p>}
                    </div>
                  );
                }).filter(Boolean)}
              </div>

              {/* Gráfico helper — reutilizável para individual e agregado */}
              {(()=>{
                const anoBase=new Date().getFullYear();
                const mesBase=new Date().getMonth(); // 0-indexed
                const projYears=40;
                const projMonths=projYears*12;
                const r5=5/100/12,r8=8/100/12,r10=10/100/12;

                // Calcular projecção com data labels de valor
                const buildProj=(startVal,monthly,rate)=>{
                  const pts=[];let c=startVal;
                  for(let i=0;i<=projMonths;i+=12){
                    pts.push({yr:i/12,anoReal:anoBase+i/12,val:Math.round(c)});
                    for(let m=0;m<12;m++)c=c*(1+rate)+monthly;
                  }
                  return pts;
                };

                const fmtV=v=>v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"k":v.toFixed(0)+"€";

                // ── Componente InvChart com tooltip + painel lateral interactivo ──
                const InvChart=({label,icon,startVal,monthly,realHistory,color,chartId})=>{
                  const [selYr,setSelYr]=useState(10);
                  const [tooltip,setTooltip]=useState(null); // {x,y,val,label,yr}
                  const p5=buildProj(startVal,monthly,r5);
                  const p8=buildProj(startVal,monthly,r8);
                  const p10=buildProj(startVal,monthly,r10);
                  const allVals=[...p10.map(p=>p.val),...(realHistory||[]).map(d=>d.val),startVal];
                  const maxV=Math.max(...allVals,1);
                  const IPL=52,IPR=12,IPT=20,IPB=24,IW=600,IH=170;
                  const innerIW=IW-IPL-IPR,innerIH=IH-IPT-IPB;
                  const toIX=(yr)=>IPL+(yr/projYears)*innerIW;
                  const toIY=v=>IPT+innerIH-((v/maxV)*innerIH);
                  const xTicks=[0,5,10,15,20,25,30,35,40];
                  const selVals={
                    v5:p5.find(p=>p.yr===selYr)?.val??0,
                    v8:p8.find(p=>p.yr===selYr)?.val??0,
                    v10:p10.find(p=>p.yr===selYr)?.val??0,
                  };
                  const lines=[
                    {pts:p5,color:th.textMid,label:"5%"},
                    {pts:p8,color:"#06b6d4",label:"8%"},
                    {pts:p10,color:"#f59e0b",label:"10%"},
                  ];
                  return(
                    <div>
                      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                        {/* SVG chart */}
                        <div style={{flex:1,minWidth:0,position:"relative"}}>
                          <svg viewBox={`0 0 ${IW} ${IH}`} width="100%" height={IH} style={{overflow:"visible",cursor:"crosshair"}}
                            onMouseLeave={()=>setTooltip(null)}>
                            {/* Y grid */}
                            {[0,0.25,0.5,0.75,1].map((p,i)=>{
                              const v=maxV*p;
                              return(<g key={i}>
                                <line x1={IPL} y1={toIY(v)} x2={IW-IPR} y2={toIY(v)} stroke={th.border} strokeWidth="1" strokeDasharray="3,3"/>
                                <text x={IPL-4} y={toIY(v)+4} textAnchor="end" fill={th.textLow} fontSize="9">{fmtV(v)}</text>
                              </g>);
                            })}
                            {/* Eixos */}
                            <line x1={IPL} y1={IPT} x2={IPL} y2={IH-IPB} stroke={th.border} strokeWidth="1"/>
                            <line x1={IPL} y1={IH-IPB} x2={IW-IPR} y2={IH-IPB} stroke={th.border} strokeWidth="1"/>
                            {/* X ticks — clicáveis para actualizar painel */}
                            {xTicks.map(yr=>{
                              const x=toIX(yr);
                              const isSel=selYr===yr;
                              return(<g key={yr} style={{cursor:"pointer"}} onClick={()=>setSelYr(yr)}>
                                <line x1={x} y1={IPT} x2={x} y2={IH-IPB}
                                  stroke={isSel?"#3b82f6":th.border} strokeWidth={isSel?2:1}
                                  strokeDasharray={isSel?"none":"2,4"} opacity={isSel?1:0.4}/>
                                <rect x={x-14} y={IH-IPB+2} width={28} height={16} rx={4}
                                  fill={isSel?"#3b82f6":"transparent"} opacity={0.15}/>
                                <text x={x} y={IH-IPB+13} textAnchor="middle"
                                  fill={isSel?"#3b82f6":th.textLow} fontSize="9" fontWeight={isSel?"700":"400"}>{yr}a</text>
                              </g>);
                            })}
                            {/* Linha vertical do ano seleccionado */}
                            <line x1={toIX(selYr)} y1={IPT} x2={toIX(selYr)} y2={IH-IPB}
                              stroke="#3b82f6" strokeWidth="1.5" opacity="0.4"/>
                            {/* Proj lines com pontos hover */}
                            {lines.map(({pts,color:lc,label:ll},li)=>(
                              <g key={li}>
                                <polyline
                                  points={pts.map(p=>`${toIX(p.yr)},${toIY(p.val)}`).join(" ")}
                                  fill="none" stroke={lc} strokeWidth={li===1?2:1.5} strokeDasharray="5,3" opacity="0.85"/>
                                {/* Pontos hover em cada ano */}
                                {pts.filter(p=>p.yr>0).map((p,pi)=>(
                                  <circle key={pi} cx={toIX(p.yr)} cy={toIY(p.val)} r="5"
                                    fill="transparent" stroke="transparent"
                                    onMouseEnter={e=>setTooltip({x:toIX(p.yr),y:toIY(p.val),val:p.val,lc,ll,yr:p.yr})}
                                    style={{cursor:"pointer"}}/>
                                ))}
                                {/* Ponto destacado no ano seleccionado */}
                                {(()=>{const sp=pts.find(p=>p.yr===selYr);if(!sp)return null;return(
                                  <circle cx={toIX(sp.yr)} cy={toIY(sp.val)} r="4" fill={lc} stroke={th.bgCard} strokeWidth="1.5" opacity="0.9"/>
                                );})()}
                              </g>
                            ))}
                            {/* Real history line */}
                            {realHistory&&realHistory.length>0&&(()=>{
                              const toYrFrac=mes=>{const d=new Date(mes+"-01");return(d.getFullYear()-anoBase)*12+(d.getMonth()-mesBase);};
                              const allPts=[{x:toIX(0),y:toIY(startVal),val:startVal,yr:0}];
                              realHistory.forEach(d=>{
                                const yr=Math.max(0,toYrFrac(d.mes)/12);
                                if(yr<=projYears) allPts.push({x:toIX(yr),y:toIY(d.val),val:d.val,yr,mes:d.mes});
                              });
                              return(<>
                                <polyline points={allPts.map(p=>`${p.x},${p.y}`).join(" ")}
                                  fill="none" stroke={color} strokeWidth="2.5"/>
                                {allPts.map((p,i)=>(
                                  <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} stroke={th.bgCard} strokeWidth="1.5"
                                    onMouseEnter={()=>setTooltip({x:p.x,y:p.y,val:p.val,lc:color,ll:"Real",yr:p.yr})}
                                    style={{cursor:"pointer"}}/>
                                ))}
                              </>);
                            })()}
                            {/* Tooltip */}
                            {tooltip&&(()=>{
                              const TW=80,TH=26;
                              const tx=Math.min(tooltip.x+8,IW-IPR-TW);
                              const ty=Math.max(tooltip.y-TH-6,IPT);
                              return(<g>
                                <rect x={tx} y={ty} width={TW} height={TH} rx={5}
                                  fill={th.bgCard} stroke={tooltip.lc} strokeWidth="1.5" opacity="0.97"/>
                                <text x={tx+TW/2} y={ty+10} textAnchor="middle" fill={tooltip.lc} fontSize="8" fontWeight="700">{tooltip.ll} · {tooltip.yr}a</text>
                                <text x={tx+TW/2} y={ty+21} textAnchor="middle" fill={th.text} fontSize="10" fontWeight="700">{fmtV(tooltip.val)}</text>
                              </g>);
                            })()}
                          </svg>
                        </div>
                        {/* Painel lateral — valores no ano seleccionado */}
                        <div style={{width:110,flexShrink:0,background:th.bgAlt,borderRadius:10,padding:"10px 12px",border:`1px solid ${th.border}`}}>
                          <p style={{fontSize:10,fontWeight:700,color:"#3b82f6",marginBottom:8,textAlign:"center"}}>📍 {selYr} anos</p>
                          {[{v:selVals.v5,c:th.textMid,l:"5%"},{v:selVals.v8,c:"#06b6d4",l:"8%"},{v:selVals.v10,c:"#f59e0b",l:"10%"}].map(({v,c,l})=>(
                            <div key={l} style={{marginBottom:6,padding:"4px 6px",borderRadius:6,background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}}>
                              <p style={{fontSize:9,color:th.textLow,marginBottom:1}}>{l}</p>
                              <p style={{fontSize:13,fontWeight:700,color:c}}>{fmtV(v)}</p>
                            </div>
                          ))}
                          <p style={{fontSize:8,color:th.textLow,marginTop:6,textAlign:"center"}}>clica no eixo X para mudar</p>
                        </div>
                      </div>
                      {/* Legenda */}
                      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:6}}>
                        {[{color,label:"Real"},{color:th.textMid,label:"5%",dash:true},{color:"#06b6d4",label:"8%",dash:true},{color:"#f59e0b",label:"10%",dash:true}].map(l=>(
                          <div key={l.label} style={{display:"flex",alignItems:"center",gap:4}}>
                            <div style={{width:16,height:2,background:l.color,borderRadius:1,borderTop:l.dash?`2px dashed ${l.color}`:"none"}}/>
                            <span style={{fontSize:10,color:th.textLow}}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                };

                // ── Gráfico individual ──
                const item=invItems.find(a=>a.id===invSelected)||invItems[0];
                const individualChart=item?(()=>{
                  const realHistory=patSnaps.map(s=>{
                    const v=s.ativos?.[item.id]?.valor;
                    return{mes:s.mes,val:v||null};
                  }).filter(d=>d.val!==null);
                  const startVal=realHistory.length?realHistory[realHistory.length-1].val:0;
                  const monthly=invMensais[item.id]||0;
                  return(
                    <Card>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
                        <p style={{fontSize:13,fontWeight:600,color:th.text}}>{item.icon} {item.label} — Projecção</p>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,background:`rgba(${th.bg==="#f0ece4"?"0,0,0":"255,255,255"},0.04)`,borderRadius:8,padding:"4px 10px",border:`1px solid ${th.border}`}}>
                            <span style={{fontSize:10,color:th.textLow}}>Reforço/mês:</span>
                            <input type="number" value={invMensais[item.id]||0} min={0} step={5}
                              onChange={e=>setInvMensais(prev=>({...prev,[item.id]:parseFloat(e.target.value)||0}))}
                              style={{width:60,fontSize:12,fontWeight:600,color:"#22c55e",background:"none",border:"none",padding:"0",textAlign:"right"}}/>
                            <span style={{fontSize:10,color:th.textLow}}>€</span>
                          </div>
                          <select value={invSelected} onChange={e=>setInvSelected(e.target.value)} style={{fontSize:11,padding:"4px 8px"}}>
                            {invItems.map(a=>(
                              <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p style={{fontSize:10,color:th.textLow,marginBottom:10}}>
                        Ponto de partida: <span style={{fontWeight:600,color:item.color||"#a855f7"}}>{fmtV(startVal)}</span>
                        {(invMensais[item.id]||0)>0&&<span style={{color:"#22c55e"}}> · +{fmtV(invMensais[item.id])}/mês</span>}
                        <span style={{color:th.textLow2}}> · clica nos pontos para tooltip · clica no eixo X para ver valores</span>
                      </p>
                      <InvChart label={item.label} icon={item.icon} startVal={startVal} monthly={monthly}
                        realHistory={realHistory} color={item.color||"#a855f7"} chartId={item.id}/>
                    </Card>
                  );
                })():null;

                // ── Gráfico agregado (excluindo PPR Lexie) ──
                const agregItems=invItems.filter(a=>a.id!=="ppr_lex");
                const agregStart=agregItems.reduce((sum,it)=>{
                  const history=patSnaps.map(s=>s.ativos?.[it.id]?.valor).filter(Boolean);
                  return sum+(history.length?history[history.length-1]:0);
                },0);
                const agregMonthly=agregItems.reduce((sum,it)=>sum+(it.id==="xtb"?100:0),0);
                const agregHistory=patSnaps.map(s=>{
                  const v=agregItems.reduce((a,it)=>a+(s.ativos?.[it.id]?.valor||0),0);
                  return{mes:s.mes,val:v>0?v:null};
                }).filter(d=>d.val!==null);

                const agregChart=agregStart>0?(
                  <Card>
                    <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:4}}>📊 Total Investimentos — Projecção Agregada</p>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:10}}>
                      Todos os investimentos excl. PPR Lexie · Ponto de partida: <span style={{fontWeight:600,color:"#22c55e"}}>{fmtV(agregStart)}</span>
                    </p>
                    <InvChart label="Agregado" icon="📊" startVal={agregStart} monthly={agregMonthly}
                      realHistory={agregHistory} color="#22c55e" chartId="agregado"/>
                  </Card>
                ):null;

                // ── Simulador FIRE híbrido ──────────────────────────────
                const FireSim=(()=>{
                  const fireItems=PATRIMONIO_ATIVOS.filter(a=>a.grupo==="investimento"&&a.id!=="ppr_lex");
                  // Capital inicial = soma dos últimos valores registados
                  const autoCapital=fireItems.reduce((sum,it)=>{
                    const vals=patSnaps.map(s=>s.ativos?.[it.id]?.valor).filter(Boolean);
                    return sum+(vals.length?vals[vals.length-1]:it.v0||0);
                  },0);
                  const autoMensal=fireItems.reduce((sum,it)=>sum+(it.mensal||0),0); // 155€/mês
                  return <FireSimCard autoCapital={autoCapital} autoMensal={autoMensal} th={th} darkMode={darkMode} fE={fE} fmtV={v=>v>=1000000?(v/1000000).toFixed(2)+"M":v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(0)+"€"}/>;
                })();

                return(<>{individualChart}{agregChart}{FireSim}</>);
              })()}
            </>);
          })()}

          {/* ── SUB-TAB REGISTAR ── */}
          {patSubTab==="registar"&&<div>

          {/* Register month form — Excel style */}
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
              <p style={{fontSize:14,fontWeight:600,color:th.text}}>Registar mês</p>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="month" value={patEdit||new Date().toISOString().slice(0,7)}
                  onChange={e=>{
                    setPatEdit(e.target.value);
                    const existing=patSnaps.find(s=>s.mes===e.target.value);
                    if(existing) setPatDraft({ativos:{...existing.ativos},passivos:{...existing.passivos}});
                    else setPatDraft({ativos:{},passivos:{}});
                  }}
                  style={{fontSize:12,padding:"6px 10px",width:"auto"}}/>
                {(()=>{
                  const prevMes=patSnaps[patSnaps.length-1];
                  return prevMes&&prevMes.mes!==(patEdit||new Date().toISOString().slice(0,7))?(
                    <button onClick={()=>{
                      setPatDraft({ativos:{...prevMes.ativos},passivos:{...prevMes.passivos}});
                    }} style={{background:"rgba(168,85,247,0.15)",color:"#a855f7",border:"1px solid rgba(168,85,247,0.3)",borderRadius:8,padding:"6px 12px",fontSize:11,cursor:"pointer"}}>
                      📋 Copiar {prevMes.mes}
                    </button>
                  ):null;
                })()}
              </div>
            </div>

            {/* Excel-style table */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}}>
                    <th style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,borderBottom:`1px solid ${th.border}`,width:"45%"}}>Rubrica</th>
                    <th style={{textAlign:"right",padding:"8px 12px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,borderBottom:`1px solid ${th.border}`,width:"25%"}}>Valor atual (€)</th>
                    <th style={{textAlign:"right",padding:"8px 12px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,borderBottom:`1px solid ${th.border}`,width:"20%"}}>Investido (€)</th>
                    <th style={{textAlign:"right",padding:"8px 12px",fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,borderBottom:`1px solid ${th.border}`,width:"10%"}}>+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ATIVOS */}
                  {GRUPOS_ATIVOS.map(grupo=>(
                    <>
                      <tr key={"h_"+grupo.id}>
                        <td colSpan={4} style={{padding:"10px 12px 4px",fontSize:11,fontWeight:700,color:grupo.color,textTransform:"uppercase",letterSpacing:1,background:darkMode?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)",borderTop:`1px solid ${th.border}`}}>
                          {grupo.icon} {grupo.label}
                        </td>
                      </tr>
                      {PATRIMONIO_ATIVOS.filter(a=>a.grupo===grupo.id).map(item=>{
                        const d=patDraft.ativos?.[item.id]||{valor:"",investido:""};
                        const ganho=d.valor&&d.investido?(d.valor-d.investido):null;
                        const pct=ganho!==null&&d.investido?ganho/d.investido*100:null;
                        return(
                          <tr key={item.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}} className="hrow">
                            <td style={{padding:"6px 12px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontSize:14}}>{item.icon}</span>
                                <span style={{color:th.text}}>{item.label}</span>
                              </div>
                            </td>
                            <td style={{padding:"4px 8px",textAlign:"right"}}>
                              <input type="number" value={d.valor} placeholder="—"
                                onChange={e=>setPatDraft(p=>({...p,ativos:{...p.ativos,[item.id]:{...d,valor:parseFloat(e.target.value)||""}}}))}
                                style={{textAlign:"right",fontSize:13,padding:"4px 8px",background:darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",border:`1px solid ${th.border}`,borderRadius:6,width:"100%",color:th.text}}/>
                            </td>
                            <td style={{padding:"4px 8px",textAlign:"right"}}>
                              {!item.fixo?(()=>{
                                // Try to find matching account for auto-fill
                                const contaAuto=contas.find(c=>item.contaId&&c.id===item.contaId);
                                return(
                                  <div style={{position:"relative"}}>
                                    <input type="number" value={d.investido} placeholder="—"
                                      onChange={e=>setPatDraft(p=>({...p,ativos:{...p.ativos,[item.id]:{...d,investido:parseFloat(e.target.value)||""}}}))}
                                      style={{textAlign:"right",fontSize:13,padding:"4px 8px",background:darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",border:`1px solid ${th.border}`,borderRadius:6,width:"100%",color:th.text}}/>
                                    {contaAuto&&<button onClick={()=>setPatDraft(p=>({...p,ativos:{...p.ativos,[item.id]:{...d,investido:contaAuto.saldo}}}))}
                                      style={{position:"absolute",right:-28,top:2,background:"rgba(34,197,94,0.15)",color:"#22c55e",border:"none",borderRadius:4,padding:"2px 5px",fontSize:9,cursor:"pointer"}} title={`Preencher Investido: ${contaAuto.nome} (${contaAuto.saldo.toFixed(2)}€)`}>↑</button>}
                                  </div>
                                );
                              })():<span style={{color:th.textLow,fontSize:12}}>—</span>}
                            </td>
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              {ganho!==null?(
                                <span style={{fontSize:11,fontWeight:600,color:ganho>=0?"#22c55e":"#ef4444",whiteSpace:"nowrap"}}>
                                  {ganho>=0?"↑":"↓"}{pct!==null?`${Math.abs(pct).toFixed(1)}%`:""}
                                </span>
                              ):<span style={{color:th.textLow}}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      <tr key={"t_"+grupo.id} style={{background:"rgba(34,197,94,0.04)"}}>
                        <td style={{padding:"6px 12px",fontSize:12,color:th.textLow,fontStyle:"italic"}}>Total {grupo.label}</td>
                        <td style={{padding:"6px 12px",textAlign:"right",fontSize:13,fontWeight:700,color:"#22c55e"}}>
                          {fE(PATRIMONIO_ATIVOS.filter(a=>a.grupo===grupo.id).reduce((s,item)=>{
                            const v=patDraft.ativos?.[item.id]?.valor||0;
                            return s+(typeof v==="number"?v:parseFloat(v)||0);
                          },0))}
                        </td>
                        <td colSpan={2}/>
                      </tr>
                    </>
                  ))}
                  {/* PASSIVOS */}
                  <tr>
                    <td colSpan={4} style={{padding:"10px 12px 4px",fontSize:11,fontWeight:700,color:"#ef4444",textTransform:"uppercase",letterSpacing:1,background:"rgba(239,68,68,0.04)",borderTop:`2px solid ${th.border}`}}>
                      🔴 Passivos
                    </td>
                  </tr>
                  {PATRIMONIO_PASSIVOS.map(item=>{
                    const val=patDraft.passivos?.[item.id]||"";
                    return(
                      <tr key={item.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}} className="hrow">
                        <td style={{padding:"6px 12px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:14}}>{item.icon}</span>
                            <span style={{color:th.text}}>{item.label}</span>
                          </div>
                        </td>
                        <td style={{padding:"4px 8px",textAlign:"right"}}>
                          <input type="number" value={val} placeholder="—"
                            onChange={e=>setPatDraft(p=>({...p,passivos:{...p.passivos,[item.id]:parseFloat(e.target.value)||""}}))}
                            style={{textAlign:"right",fontSize:13,padding:"4px 8px",background:darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",border:`1px solid ${th.border}`,borderRadius:6,width:"100%",color:"#ef4444"}}/>
                        </td>
                        <td colSpan={2}/>
                      </tr>
                    );
                  })}
                  <tr style={{background:"rgba(239,68,68,0.04)"}}>
                    <td style={{padding:"6px 12px",fontSize:12,color:th.textLow,fontStyle:"italic"}}>Total Passivos</td>
                    <td style={{padding:"6px 12px",textAlign:"right",fontSize:13,fontWeight:700,color:"#ef4444"}}>
                      {fE(PATRIMONIO_PASSIVOS.reduce((s,item)=>{const v=patDraft.passivos?.[item.id]||0;return s+(typeof v==="number"?v:parseFloat(v)||0);},0))}
                    </td>
                    <td colSpan={2}/>
                  </tr>
                  {/* TOTAL */}
                  <tr style={{background:"rgba(168,85,247,0.08)",borderTop:"2px solid #a855f7"}}>
                    <td style={{padding:"10px 12px",fontSize:13,fontWeight:700,color:"#a855f7"}}>✦ Património Líquido</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontSize:16,fontWeight:800,color:"#a855f7"}}>
                      {fE((()=>{
                        const tA=PATRIMONIO_ATIVOS.reduce((s,item)=>{const v=patDraft.ativos?.[item.id]?.valor||0;return s+(typeof v==="number"?v:parseFloat(v)||0);},0);
                        const tP=PATRIMONIO_PASSIVOS.reduce((s,item)=>{const v=patDraft.passivos?.[item.id]||0;return s+(typeof v==="number"?v:parseFloat(v)||0);},0);
                        return tA-tP;
                      })())}
                    </td>
                    <td colSpan={2}/>
                  </tr>
                </tbody>
              </table>
            </div>

            <button onClick={()=>{
              const mes=patEdit||new Date().toISOString().slice(0,7);
              const snap={mes,ativos:patDraft.ativos,passivos:patDraft.passivos};
              setPatSnaps(prev=>{const filtered=prev.filter(s=>s.mes!==mes);return[...filtered,snap].sort((a,b)=>a.mes.localeCompare(b.mes));});
              setPatDraft({ativos:{},passivos:{}});
            }} style={{width:"100%",background:"#a855f7",color:th.text,border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,marginTop:16,cursor:"pointer"}}>
              ✓ Guardar {patEdit||new Date().toISOString().slice(0,7)}
            </button>
          </Card>

          </div>}

          </div>{/* maxWidth wrapper */}

        </div>
        </div>

        {isMobile&&<div className="tabbar">
          <button onClick={()=>setScreen("landing")}><span style={{fontSize:18}}>🏠</span>Hub</button>
          <button onClick={()=>{setScreen("gestao");setTab("dashboard");}}><span style={{fontSize:18}}>💳</span>Gestão</button>
        </div>}
    </>
    </ThemeCtx.Provider>
  );

  // ── GESTÃO MENSAL ─────────────────────────────────────────
  return (
    <ThemeCtx.Provider value={th}>
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",minHeight:"100vh",background:th.bg,color:th.text}}>

        {/* Desktop sidebar */}
        {!isMobile&&(
          <div style={{width:210,background:th.bgAlt,borderRight:`1px solid ${th.border}`,display:"flex",flexDirection:"column",padding:"16px 0",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}>
            <div style={{padding:"0 16px 14px",borderBottom:`1px solid ${th.border}`,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <button onClick={()=>setScreen("landing")} style={{background:"none",color:th.textLow,padding:"3px 0",border:"none",fontSize:11,cursor:"pointer"}}>← Hub</button>
                <ThemeToggle/>
              </div>
              <p style={{fontSize:15,fontWeight:600,color:th.text,letterSpacing:-0.5,marginBottom:8}}>finança<span style={{color:"#3b82f6"}}>.</span></p>
              <div style={{position:"relative"}}>
                <input placeholder="🔍 Pesquisa global..." value={globalSearch}
                  onChange={e=>{setGlobalSearch(e.target.value);setShowGlobalSearch(true);}}
                  onFocus={()=>setShowGlobalSearch(true)}
                  style={{fontSize:11,padding:"6px 10px",width:"100%"}}/>
                {showGlobalSearch&&globalSearch.length>=2&&(
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:10,zIndex:100,maxHeight:300,overflowY:"auto",marginTop:4}}>
                    {globalResults.length===0?<p style={{padding:"10px 12px",fontSize:12,color:th.textLow}}>Sem resultados</p>:
                    globalResults.map(t=>(
                      <div key={t.id} style={{padding:"8px 12px",borderBottom:"1px solid #0a1220",cursor:"pointer"}} className="hrow"
                        onClick={()=>{
                          const[y,m]=t.data.split("-");
                          setFAno(parseInt(y));setFMes(parseInt(m)-1);
                          setTab("transacoes");setContaFiltro("all");
                          setGlobalSearch("");setShowGlobalSearch(false);
                        }}>
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <p style={{fontSize:12,fontWeight:500,color:th.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"65%"}}>{t.ent||t.desc}</p>
                          <p style={{fontSize:12,fontWeight:600,color:t.tipo==="c"?"#22c55e":th.text}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</p>
                        </div>
                        <p style={{fontSize:10,color:th.textLow}}>{t.data} · {t.cat}{t.sub?` · ${t.sub}`:""}</p>
                      </div>
                    ))}
                    <button onClick={()=>{setGlobalSearch("");setShowGlobalSearch(false);}} style={{width:"100%",padding:"6px",background:"none",border:"none",color:th.textLow,fontSize:11,cursor:"pointer"}}>Fechar</button>
                  </div>
                )}
              </div>
            </div>
            <div style={{display:"flex",gap:4,padding:"6px 10px 10px",borderBottom:`1px solid ${th.border}`,marginBottom:6}}>
              <select value={fMes} onChange={e=>setFMes(parseInt(e.target.value))} style={{flex:1,fontSize:12,padding:"5px 6px"}}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
              <select value={fAno} onChange={e=>setFAno(parseInt(e.target.value))} style={{width:62,fontSize:12,padding:"5px 6px"}}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
            </div>
            {navItems.map(n=>(
              <div key={n.id}>
                <button onClick={()=>setTab(n.id==="config"?"categorizar":n.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",fontSize:13,fontWeight:(tab===n.id||( n.id==="config"&&configSubTabs.some(s=>s.id===tab)))?600:400,color:(tab===n.id||(n.id==="config"&&configSubTabs.some(s=>s.id===tab)))?th.text:th.textLow,background:(tab===n.id||(n.id==="config"&&configSubTabs.some(s=>s.id===tab)))?"rgba(59,130,246,0.12)":"transparent",borderLeft:(tab===n.id||(n.id==="config"&&configSubTabs.some(s=>s.id===tab)))?"3px solid #3b82f6":"3px solid transparent",border:"none",width:"100%",textAlign:"left",cursor:"pointer"}}>
                  <span style={{fontFamily:"monospace",fontSize:12}}>{n.icon}</span><span>{n.label}</span>
                  {n.id==="config"&&pend.length>0&&<span style={{marginLeft:"auto",fontSize:10,background:"rgba(239,68,68,0.2)",color:"#ef4444",borderRadius:10,padding:"1px 6px"}}>{pend.length}</span>}
                </button>
                {/* Config sub-items */}
                {n.id==="config"&&configSubTabs.some(s=>s.id===tab)&&configSubTabs.map(s=>(
                  <button key={s.id} onClick={()=>setTab(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 16px 7px 32px",fontSize:12,fontWeight:tab===s.id?600:400,color:tab===s.id?"#3b82f6":th.textLow,background:tab===s.id?"rgba(59,130,246,0.08)":"transparent",borderLeft:"none",border:"none",width:"100%",textAlign:"left",cursor:"pointer"}}>
                    <span style={{fontFamily:"monospace",fontSize:11}}>{s.icon}</span><span>{s.label}</span>
                  </button>
                ))}
              </div>
            ))}
            <div style={{marginTop:"auto",padding:"12px 16px",borderTop:`1px solid ${th.border}`}}>
              {(()=>{const cfg={idle:{dot:"⚪",label:"A ligar...",color:th.textLow},loading:{dot:"🟡",label:"A carregar...",color:"#f59e0b"},saving:{dot:"🟡",label:"A guardar...",color:"#f59e0b"},synced:{dot:"🟢",label:"Sincronizado",color:"#22c55e"},error:{dot:"🔴",label:"Erro de ligação",color:"#ef4444"}}[driveStatus]||{dot:"⚪",label:"",color:th.textLow};return<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10}}>{cfg.dot}</span><span style={{fontSize:10,color:cfg.color}}>{cfg.label}</span></div>;})()}
              <p style={{fontSize:11,color:th.textLow}}>Património</p>
              <p style={{fontSize:14,fontWeight:600,color:"#22c55e"}}>{fE(patrimonioTotal)}</p>
            </div>
          </div>
        )}

        {/* Main */}
        <div style={{flex:1,padding:mainPad,overflowY:"auto",minWidth:0}} className="fade">


          {isMobile&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <p style={{fontSize:17,fontWeight:600,color:th.text}}>{navItems.find(n=>n.id===tab)?.label||tab}</p>
                <p style={{fontSize:11,color:th.textLow}}>{MESES[fMes]} {fAno}</p>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <select value={fMes} onChange={e=>setFMes(parseInt(e.target.value))} style={{fontSize:12,padding:"6px 8px",width:"auto"}}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
                <select value={fAno} onChange={e=>setFAno(parseInt(e.target.value))} style={{fontSize:12,padding:"6px 6px",width:"auto"}}>{[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
                <ThemeToggle/>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {tab==="dashboard"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Dashboard</p><p style={{fontSize:12,color:th.textLow,marginBottom:14}}>{MESES[fMes]} {fAno}</p></>}
              {alerts.filter(a=>!dismissedAlerts.has(a.cat)).length>0&&(
                <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
                  <p style={{fontSize:12,fontWeight:600,color:"#ef4444",marginBottom:6}}>⚠️ Alertas de orçamento</p>
                  {alerts.filter(a=>!dismissedAlerts.has(a.cat)).map(a=>(
                    <div key={a.cat} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                      <input type="checkbox" onChange={()=>dismissAlert(a.cat)}
                        style={{width:14,height:14,cursor:"pointer",accentColor:"#3b82f6",flexShrink:0}}/>
                      <div style={{flex:1,display:"flex",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setCatModal(a.cat)}>
                        <span style={{fontSize:12,color:th.textMid}}>{cats[a.cat]?.icon} {a.cat}</span>
                        <span style={{fontSize:12,color:a.pct>=100?"#ef4444":"#f59e0b",fontWeight:600}}>{a.pct.toFixed(0)}% · {fE(a.net)}/{fE(a.orc)}</span>
                      </div>
                    </div>
                  ))}
                  <p style={{fontSize:10,color:th.textLow,marginTop:6}}>✓ marca para ignorar este mês</p>
                </div>
              )}
              {(()=>{
                const saldo=totR-totD;
                // Taxa de poupança = movimentos Poupança+Investimento / receitas
                const poupancaInvest=transMesTodos.filter(t=>t.tipo==="d"&&(t.cat==="Poupança"||t.cat==="Investimento"||(t.cat==="Transferência Interna"&&t.sub==="Poupança"))).reduce((a,t)=>a+t.val,0);
                const taxaPoupanca=totR>0?(poupancaInvest/totR*100):0;
                const totalOrc=totalOrçamentado; // usar mesmo cálculo do tab Orçamento
                const pctOrc=totalOrc>0?(totD/totalOrc*100):0;
                const saldoPct=totR>0?(saldo/totR*100):0;
                const kpis=[
                  {label:"Receitas",sub:"entradas do mês",val:fE(totR),color:"#22c55e"},
                  {label:"Despesas",sub:"saídas do mês",val:fE(totD),color:"#ef4444"},
                  {label:"Saldo",sub:`${saldoPct.toFixed(1)}% das receitas`,val:fE(saldo),color:saldo>=0?"#22c55e":"#ef4444"},
                  {label:"Taxa de Poupança",sub:`${fE(poupancaInvest)} poupado/investido`,val:`${taxaPoupanca.toFixed(1)}%`,color:taxaPoupanca>=20?"#22c55e":taxaPoupanca>=10?"#f59e0b":"#ef4444"},
                  {label:"Vs Orçamento",sub:totalOrc>0?`${fE(totD)} de ${fE(totalOrc)}`:"sem orçamento definido",val:totalOrc>0?`${pctOrc.toFixed(0)}%`:"—",color:pctOrc>100?"#ef4444":pctOrc>80?"#f59e0b":"#22c55e"},
                ];
                return(
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:8,marginBottom:12}}>
                    {kpis.map(k=>(
                      <div key={k.label} style={{background:th.bgCard,border:`1px solid ${k.color}33`,borderRadius:12,padding:"12px 14px"}}>
                        <p style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p>
                        <p style={{fontSize:18,fontWeight:600,color:k.color}}>{k.val}</p>
                        <p style={{fontSize:10,color:th.textLow,marginTop:3}}>{k.sub}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Contas */}
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><p style={{fontSize:14,fontWeight:600,color:th.text}}>Contas</p><button onClick={()=>setTab("contas")} style={{background:"none",border:"none",color:"#3b82f6",fontSize:12,cursor:"pointer"}}>Gerir →</button></div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {CONTA_SECOES.map(sec=>{
                    const secContas=contas.filter(c=>c.secao===sec.id);
                    if(!secContas.length) return null;
                    const secTotal=secContas.reduce((a,c)=>a+(contaSaldos[c.id]||0),0);
                    return(
                      <div key={sec.id}>
                        {/* Section label */}
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                          <span style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1}}>{sec.icon} {sec.label}</span>
                        </div>
                        {/* Total card FIRST, then accounts */}
                        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
                          <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:10,padding:"8px 12px",flexShrink:0,minWidth:95,display:"flex",flexDirection:"column",justifyContent:"center"}}>
                            <span style={{fontSize:10,color:"#22c55e",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Total</span>
                            <p style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>{fE(secTotal)}</p>
                          </div>
                          {[...secContas].sort((a,b)=>a.nome.localeCompare(b.nome,"pt")).map(c=>(
                            <div key={c.id} style={{background:th.bg,border:`1px solid ${c.cor}33`,borderRadius:10,padding:"8px 12px",flexShrink:0,minWidth:95}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                                <span style={{fontSize:13}}>{c.icon}</span>
                                <span style={{fontSize:10,color:th.textLow,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:72}}>{c.nome}</span>
                              </div>
                              <p style={{fontSize:13,fontWeight:600,color:th.text}}>{fE(contaSaldos[c.id]??0)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Grand total */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:10,marginTop:4}}>
                    <span style={{fontSize:12,color:th.textLow}}>✦ Total de contas</span>
                    <span style={{fontSize:16,fontWeight:700,color:th.text}}>{fE(patrimonioTotal)}</span>
                  </div>
                </div>
              </Card>

              {/* Pie chart + legend */}
              {pieData.length>0&&(
                <Card>
                  <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:14}}>Distribuição de despesas</p>
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
                            <span style={{fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:th.text}}>{cats[d.cat]?.icon} {d.cat}</span>
                            <span style={{fontSize:11,color:th.textLow,flexShrink:0,width:32,textAlign:"right"}}>{pct}%</span>
                            <span style={{fontSize:12,fontWeight:600,color:th.text,flexShrink:0,width:52,textAlign:"right"}}>{fE(d.val)}</span>
                          </div>
                        );
                      });})()}
                    </div>
                  </div>
                </Card>
              )}

              {/* Evolução últimos 6 meses */}
              {(()=>{
                const meses=[];
                for(let i=5;i>=0;i--){
                  let m=fMes-i; let y=fAno;
                  if(m<0){m+=12;y--;}
                  const mk=`${y}-${String(m+1).padStart(2,"0")}`;
                  const tM=trans.filter(t=>{const[ty,tm]=t.data.split("-");return parseInt(tm)-1===m&&parseInt(ty)===y;});
                  const r=tM.filter(t=>t.tipo==="c"&&!isInt(t)).reduce((a,t)=>a+t.val,0);
                  const d=tM.filter(t=>t.tipo==="d"&&!isInt(t)).reduce((a,t)=>a+t.val,0);
                  meses.push({label:MESES[m],rec:r,desp:d,atual:m===fMes&&y===fAno});
                }
                const maxVal=Math.max(...meses.map(m=>Math.max(m.rec,m.desp)),1);
                if(meses.every(m=>m.rec===0&&m.desp===0)) return null;
                return(
                  <Card>
                    <p style={{fontSize:14,fontWeight:600,color:th.text,marginBottom:14}}>Evolução — últimos 6 meses</p>
                    <div style={{display:"flex",gap:8,alignItems:"flex-end",height:120}}>
                      {meses.map((m,i)=>(
                        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                          <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:90}}>
                            <div style={{flex:1,background:"rgba(34,197,94,0.6)",borderRadius:"3px 3px 0 0",height:`${maxVal>0?(m.rec/maxVal)*90:0}px`,minHeight:m.rec>0?2:0,transition:"height 0.5s"}}/>
                            <div style={{flex:1,background:"rgba(239,68,68,0.6)",borderRadius:"3px 3px 0 0",height:`${maxVal>0?(m.desp/maxVal)*90:0}px`,minHeight:m.desp>0?2:0,transition:"height 0.5s"}}/>
                          </div>
                          <p style={{fontSize:9,color:m.atual?"#f59e0b":th.textLow,fontWeight:m.atual?700:400}}>{m.label}</p>
                          {m.atual&&<div style={{width:4,height:4,borderRadius:"50%",background:"#f59e0b"}}/>}
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:16,marginTop:8,justifyContent:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"rgba(34,197,94,0.6)"}}/><span style={{fontSize:10,color:th.textLow}}>Receitas</span></div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"rgba(239,68,68,0.6)"}}/><span style={{fontSize:10,color:th.textLow}}>Despesas</span></div>
                    </div>
                  </Card>
                );
              })()}

              {/* Monthly bar */}
              {transMes.length===0&&<Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:th.textLow,fontSize:14}}>Sem dados. Importa o extrato.</p></Card>}
            </div>
          )}

          {/* ORÇAMENTO */}
          {tab==="orcamento"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Orçamento</p><p style={{fontSize:12,color:th.textLow,marginBottom:10}}>{MESES[fMes]} {fAno}</p></>}

              {/* Controls: copy from previous month + edit */}
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <Btn variant={orcEdit?"primary":"ghost"} onClick={()=>setOrcEdit(!orcEdit)} style={{fontSize:12,padding:"7px 14px"}}>{orcEdit?"Fechar edição":"Editar orçamento"}</Btn>
                {orcEdit&&(()=>{
                  const prevMes=fMes===0?11:fMes-1;
                  const prevAno=fMes===0?fAno-1:fAno;
                  const prevKey=`${prevAno}-${String(prevMes+1).padStart(2,"0")}`;
                  const prevOrc=orcs[prevKey];
                  return prevOrc&&Object.keys(prevOrc).length>0?(<>
                    <Btn variant="ghost" style={{fontSize:12,padding:"7px 14px"}} onClick={()=>{
                      if(confirm(`Copiar orçamento de ${MESES[prevMes]} ${prevAno} para este mês?`))
                        setOrcs(prev=>({...prev,[mesKey]:{...prevOrc}}));
                    }}>📋 Copiar de {MESES[prevMes]}</Btn>
                    <Btn variant="ghost" style={{fontSize:12,padding:"7px 14px"}} onClick={()=>{
                      if(!confirm(`Copiar orçamento de ${MESES[prevMes]} ${prevAno} para TODOS os meses seguintes até Dez ${fAno}?`)) return;
                      const updates={};
                      for(let m=fMes;m<12;m++){
                        const mk=`${fAno}-${String(m+1).padStart(2,"0")}`;
                        updates[mk]={...prevOrc};
                      }
                      setOrcs(prev=>({...prev,...updates}));
                    }}>📋📋 Copiar para todos os meses</Btn>
                  </>):null;
                })()}
              </div>

              {/* KPIs — 5 cards */}
              {(()=>{
                const saldoPrevisto=totR-totalOrçamentado;
                const saldoReal=totR-totD;
                const pctOrcUsado=totalOrçamentado>0?(totD/totalOrçamentado*100):0;
                const poupMes=transMesTodos.filter(t=>t.tipo==="d"&&(t.cat==="Poupança"||t.cat==="Investimento"||(t.cat==="Transferência Interna"&&t.sub==="Poupança"))).reduce((a,t)=>a+t.val,0);
                const orcKpis=[
                  {label:"Receitas",sub:"entradas do mês",val:fE(totR),color:"#22c55e"},
                  {label:"Despesas reais",sub:"gastos até agora",val:fE(totD),color:"#ef4444"},
                  {label:"Saldo previsto",sub:"receitas − orçamento",val:fE(saldoPrevisto),color:saldoPrevisto>=0?"#22c55e":"#ef4444",sub2:saldoPrevisto>=0?"✓ dentro do plano":"⚠ acima do plano"},
                  {label:"Saldo real",sub:"receitas − gastos reais",val:fE(saldoReal),color:saldoReal>=0?"#22c55e":"#ef4444"},
                  {label:"Poupança + Invest.",sub:"transferido este mês",val:fE(poupMes),color:"#10b981"},
                  {label:"Orçamento usado",sub:totalOrçamentado>0?`${fE(totD)} de ${fE(totalOrçamentado)}`:"sem orçamento",val:totalOrçamentado>0?`${pctOrcUsado.toFixed(0)}%`:"—",color:pctOrcUsado>100?"#ef4444":pctOrcUsado>80?"#f59e0b":"#22c55e"},
                ];
                return(
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(6,1fr)",gap:8,marginBottom:14}}>
                    {orcKpis.map(k=>(
                      <div key={k.label} style={{background:th.bgCard,border:`1px solid ${k.color}33`,borderRadius:12,padding:"10px 12px"}}>
                        <p style={{fontSize:9,color:th.textLow,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k.label}</p>
                        <p style={{fontSize:15,fontWeight:700,color:k.color}}>{k.val}</p>
                        <p style={{fontSize:9,color:th.textLow,marginTop:3}}>{k.sub}</p>
                        {k.sub2&&<p style={{fontSize:9,color:k.color,marginTop:1}}>{k.sub2}</p>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Receitas detail */}
              {rec.length>0&&(
                <Card style={{marginBottom:12,background:"rgba(34,197,94,0.04)",border:"1px solid rgba(34,197,94,0.2)",cursor:"pointer"}} onClick={()=>setCatModal("Receita")}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <p style={{fontSize:13,fontWeight:600,color:"#22c55e"}}>💵 Receitas <span style={{fontSize:10,color:th.textLow,fontWeight:400}}>— clica para ver movimentos</span></p>
                    <span style={{fontSize:13,fontWeight:700,color:"#22c55e"}}>{fE(totR)}</span>
                  </div>
                  {Object.entries(catData["Receita"]?.subs||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([sub,val])=>(
                    <div key={sub} style={{display:"flex",justifyContent:"space-between",padding:"3px 0 3px 8px",borderTop:"1px solid rgba(34,197,94,0.1)"}}>
                      <span style={{fontSize:12,color:th.textLow}}>{sub||"Outros"}</span>
                      <span style={{fontSize:12,color:"#22c55e",fontWeight:500}}>{fE(val)}</span>
                    </div>
                  ))}
                </Card>
              )}

              {/* Despesas por categoria */}
              <Card>
                {Object.keys(cats).filter(c=>!["Transferência Interna","Receita","Poupança"].includes(c)).sort((a,b)=>a.localeCompare(b,"pt")).map(cat=>{
                  const cfg=cats[cat],d=catData[cat]||{out:0,in:0,subs:{}};
                  const net=NET_CATS.has(cat)?d.out-d.in:d.out;
                  // Orçamento da categoria = soma das subcategorias definidas em cats (não só as com gastos)
                  const subOrcTotal=(cats[cat]?.subs||[]).reduce((a,sub)=>{
                    const key=`${cat}::${sub}`;
                    return a+(orcMes[key]||0);
                  },0);
                  // Se não há sub-orçamentos, usar orçamento manual da categoria como fallback
                  const orc=subOrcTotal>0?subOrcTotal:(orcMes[cat]||0);
                  const over=net>orc&&orc>0;
                  return(
                    <div key={cat} style={{marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${th.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:4}} onClick={()=>setCatModal(cat)}>
                        <span style={{fontSize:16,width:22,flexShrink:0}}>{cfg.icon}</span>
                        <span style={{fontSize:13,fontWeight:600,flex:1}}>{cat}</span>
                        <span style={{fontSize:13,fontWeight:600,color:over?"#ef4444":orc===0?th.textLow:th.text}}>{fE(net)}</span>
                        {NET_CATS.has(cat)&&d.in>0&&<span style={{fontSize:10,color:"#22c55e"}}>-{fE(d.in)}</span>}
                        {orcEdit?(
                          // Em modo edição: mostrar total calculado (read-only) se há sub-orçamentos, senão campo manual
                          subOrcTotal>0
                            ? <span style={{fontSize:10,color:"#06b6d4",whiteSpace:"nowrap",padding:"4px 8px",background:"rgba(6,182,212,0.08)",borderRadius:6}}>Σ {fE(subOrcTotal)}</span>
                            : <input type="number" defaultValue={orcMes[cat]||""} placeholder="0" onClick={e=>e.stopPropagation()}
                                style={{width:70,textAlign:"right",padding:"4px 8px",fontSize:12}}
                                onBlur={e=>{const v=parseFloat(e.target.value)||0;setOrcs(prev=>({...prev,[mesKey]:{...(prev[mesKey]||{}),[cat]:v}}));}}/>
                        ):<span style={{fontSize:10,color:th.textLow,whiteSpace:"nowrap"}}>/{fE(orc)}</span>}
                      </div>
                      {orc>0&&(()=>{const pct=orc>0?net/orc*100:0;const barColor=pct>=100?"#ef4444":pct>=75?"#f59e0b":"#22c55e";return<><PBar val={net} max={orc} color={barColor}/><div style={{display:"flex",justifyContent:"space-between",marginTop:2}}><span style={{fontSize:9,color:th.textLow}}>{pct.toFixed(0)}%</span><span style={{fontSize:9,color:over?"#ef4444":th.textLow}}>{over?`+${fE(net-orc)} acima`:`${fE(orc-net)} livre`}</span></div></>})()}
                      {/* Subcategories with orçamento detail */}
                      {(()=>{
                        // Mostrar: subs com gastos OU subs com orçamento definido
                        const subsComGastos=Object.entries(d.subs||{}).filter(([,v])=>v>0).map(([s])=>s);
                        const subsComOrc=(cats[cat]?.subs||[]).filter(sub=>(orcMes[`${cat}::${sub}`]||0)>0);
                        const todasSubs=[...new Set([...subsComGastos,...subsComOrc])].sort((a,b)=>a.localeCompare(b,"pt"));
                        if(!todasSubs.length&&!orcEdit) return null;
                        return(
                        <div style={{marginTop:4}}>
                          {/* Sub spending with bars + click */}
                          {todasSubs.map(sub=>{
                            const subOut=d.subs?.[sub]||0;
                            const subIn=d.subsIn?.[sub]||0;
                            // Para NET_CATS mostrar saldo líquido (entradas - saídas), senão só saídas
                            const val=NET_CATS.has(cat)?subOut-subIn:subOut;
                            const displayVal=NET_CATS.has(cat)?subOut-subIn:subOut;
                            const subOrcKey=`${cat}::${sub}`;
                            const subOrc=orcMes[subOrcKey]||0;
                            const absVal=Math.abs(val);
                            const subPct=subOrc>0?absVal/subOrc*100:0;
                            const subOver=subOrc>0&&absVal>subOrc;
                            const subColor=subOver?"#ef4444":subPct>=75?"#f59e0b":"#22c55e";
                            const barMax = subOrc>0 ? subOrc : Math.abs(net)||1;
                            const barColor = subOrc>0 ? subColor : "#22c55e";
                            const isNetSub=NET_CATS.has(cat);
                            return(
                              <div key={sub} style={{padding:"4px 0 4px 30px",cursor:"pointer"}}
                                onClick={e=>{e.stopPropagation();setCatModal(cat+"::"+sub);}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                                  <span style={{fontSize:11,color:th.textMid}}>{sub||"Sem subcategoria"}</span>
                                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                                    {isNetSub&&subIn>0&&<span style={{fontSize:10,color:"#22c55e"}}>+{fE(subIn)}</span>}
                                    <span style={{fontSize:11,fontWeight:500,color:subOver?"#ef4444":val<0?"#22c55e":th.text}}>
                                      {isNetSub?fE(displayVal):fE(subOut)}
                                    </span>
                                    {orcEdit?(
                                      <input type="number" defaultValue={subOrc||""} placeholder="0"
                                        onClick={e=>e.stopPropagation()}
                                        style={{width:65,textAlign:"right",padding:"2px 6px",fontSize:11}}
                                        onBlur={e=>{const v=parseFloat(e.target.value)||0;setOrcs(prev=>({...prev,[mesKey]:{...(prev[mesKey]||{}),[subOrcKey]:v}}));}}/>
                                    ):(subOrc>0&&<span style={{fontSize:10,color:th.textLow}}>/{fE(subOrc)}</span>)}
                                  </div>
                                </div>
                                <PBar val={absVal} max={barMax} color={barColor} h={3}/>
                              </div>
                            );
                          })}
                          {orcEdit&&[...(cats[cat]?.subs||[])].sort((a,b)=>a.localeCompare(b,"pt")).filter(sub=>!(d.subs?.[sub]>0)&&!((orcMes[`${cat}::${sub}`]||0)>0)).map(sub=>{
                            const subOrcKey=`${cat}::${sub}`;
                            const subOrc=orcMes[subOrcKey]||0;
                            return(
                              <div key={sub} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0 3px 30px"}}>
                                <span style={{fontSize:11,color:th.textLow2}}>{sub} <span style={{fontSize:9}}>(0€)</span></span>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:10,color:th.textLow}}>orç.</span>
                                  <input type="number" defaultValue={subOrc||""} placeholder="0"
                                    style={{width:65,textAlign:"right",padding:"2px 6px",fontSize:11}}
                                    onBlur={e=>{const v=parseFloat(e.target.value)||0;setOrcs(prev=>({...prev,[mesKey]:{...(prev[mesKey]||{}),[subOrcKey]:v}}));}}/>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );})()}
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {/* TRANSAÇÕES */}
          {tab==="transacoes"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Transações</p></>}

              {/* Account selector — dropdown grouped by section */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <span style={{fontSize:12,color:th.textLow,flexShrink:0}}>Conta:</span>
                <select value={contaFiltro} onChange={e=>setContaFiltro(e.target.value)}
                  style={{fontSize:13,padding:"7px 12px",flex:1,maxWidth:280}}>
                  <option value="all">— Todas as contas —</option>
                  {CONTA_SECOES.map(sec=>{
                    const secContas=contas.filter(c=>c.secao===sec.id);
                    if(!secContas.length) return null;
                    return(
                      <optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>
                        {secContas.map(c=>(
                          <option key={c.id} value={c.id}>{c.icon} {c.nome}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>

              </div>
              <p style={{fontSize:12,color:th.textLow,marginBottom:10}}>{transMes.length} movimentos · {MESES[fMes]} {fAno}</p>

              {/* Card: movimentos sem categoria ou subcategoria */}
              {(()=>{
                const semCat=trans.filter(t=>!t.cat||(!t.sub&&cats[t.cat]?.subs?.length>0&&t.cat!=="Transferência Interna"&&t.cat!=="Receita"));
                if(!semCat.length) return null;
                return(
                  <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:12,padding:"10px 14px",marginBottom:12,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                    onClick={()=>setCatModal("__SEM_CATEGORIA__")}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>⚠️</span>
                      <div>
                        <p style={{fontSize:13,fontWeight:600,color:"#ef4444"}}>{semCat.length} movimento{semCat.length!==1?"s":""} sem categoria ou subcategoria</p>
                        <p style={{fontSize:10,color:th.textLow}}>Clica para ver e navegar para cada um</p>
                      </div>
                    </div>
                    <span style={{fontSize:12,color:"#ef4444"}}>›</span>
                  </div>
                );
              })()}

              {/* Add manual transaction */}
              <div style={{marginBottom:12}}>
                <button onClick={()=>setAddManual(!addManual)} style={{background:addManual?"rgba(59,130,246,0.2)":"rgba(59,130,246,0.08)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.3)",borderRadius:10,padding:"9px 16px",fontSize:13,width:"100%",marginBottom:addManual?10:0}}>
                  {addManual?"✕ Fechar":"＋ Adicionar movimento manual"}
                </button>
                {addManual&&(
                  <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:14,padding:16}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                      <div><Lbl>Data</Lbl><input type="date" value={manualT.data} onChange={e=>setManualT(t=>({...t,data:e.target.value}))}/></div>
                      <div><Lbl>Tipo</Lbl>
                        <select value={manualT.tipo} onChange={e=>setManualT(t=>({...t,tipo:e.target.value}))}>
                          <option value="d">💸 Débito / Saída</option>
                          <option value="c">💰 Crédito / Entrada</option>
                        </select>
                      </div>
                      <div><Lbl>Descrição</Lbl><input type="text" value={manualT.desc} placeholder="Ex: Supermercado" onChange={e=>setManualT(t=>({...t,desc:e.target.value}))}/></div>
                      <div><Lbl>Entidade</Lbl><input type="text" value={manualT.ent} placeholder="Ex: Continente" onChange={e=>setManualT(t=>({...t,ent:e.target.value}))}/></div>
                      <div><Lbl>Valor (€)</Lbl><input type="number" value={manualT.val} placeholder="0.00" step="0.01" onChange={e=>setManualT(t=>({...t,val:e.target.value}))}/></div>
                      <div><Lbl>Categoria</Lbl>
                        <select value={manualT.cat} onChange={e=>setManualT(t=>({...t,cat:e.target.value,sub:""}))}>
                          <option value="">Selecionar...</option>
                          {Object.keys(cats).sort((a,b)=>a.localeCompare(b,"pt")).map(c=><option key={c} value={c}>{cats[c].icon} {c}</option>)}
                        </select>
                      </div>
                      <div><Lbl>Subcategoria</Lbl>
                        <select value={manualT.sub} onChange={e=>setManualT(t=>({...t,sub:e.target.value}))}>
                          <option value="">—</option>
                          {(cats[manualT.cat]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div><Lbl>Conta {manualT.tipo==="d"?"(débito de)":"(crédito em)"}</Lbl>
                        <select value={manualT.contaOrigem||contaFiltro} onChange={e=>setManualT(t=>({...t,contaOrigem:e.target.value}))}>
                          <option value="">— sem conta —</option>
                          {CONTA_SECOES.map(sec=>{const secC=contas.filter(c=>c.secao===sec.id);if(!secC.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{secC.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                        </select>
                      </div>
                      {(manualT.cat==="Transferência Interna"||manualT.cat==="Poupança")&&(
                        <div><Lbl>Conta destino</Lbl>
                          <select value={manualT.contaDestino} onChange={e=>setManualT(t=>({...t,contaDestino:e.target.value}))}>
                            <option value="">— sem conta —</option>
                            {CONTA_SECOES.map(sec=>{const secC=contas.filter(c=>c.secao===sec.id);if(!secC.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{secC.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                          </select>
                        </div>
                      )}
                      <div style={{gridColumn:"1/-1"}}><Lbl>Nota</Lbl><input type="text" value={manualT.nota} placeholder="Opcional..." onChange={e=>setManualT(t=>({...t,nota:e.target.value}))}/></div>
                    </div>
                    <button onClick={()=>{
                      const val=parseFloat(manualT.val);
                      if(!val||!manualT.desc){alert("Preenche pelo menos a descrição e o valor.");return;}
                      const t={id:crypto.randomUUID(),data:manualT.data,dataOrig:manualT.data,desc:manualT.desc,val:Math.abs(val),tipo:manualT.tipo,cat:manualT.cat,sub:manualT.sub,ent:manualT.ent||manualT.desc,nota:manualT.nota,ok:true,contaOrigem:manualT.contaOrigem,contaDestino:manualT.contaDestino,contaId:manualT.contaOrigem||(contaFiltro!=="all"?contaFiltro:"mill")};
                      setTrans(prev=>[...prev,t]);
                      applyBalance(manualT.cat,Math.abs(val),manualT.tipo,manualT.contaOrigem,manualT.contaDestino);
                      setManualT({data:new Date().toISOString().slice(0,10),desc:"",val:"",tipo:"d",cat:"",sub:"",ent:"",nota:"",contaOrigem:"mill",contaDestino:""});
                      setAddManual(false);
                    }} style={{background:"#3b82f6",color:th.text,border:"none",borderRadius:10,padding:"11px",fontSize:14,width:"100%",fontWeight:600}}>
                      ＋ Adicionar movimento
                    </button>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                <input placeholder="🔍 Pesquisar por descrição, entidade, categoria..." value={search} onChange={e=>setSearch(e.target.value)} style={{fontSize:13}}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <div><Lbl>De</Lbl><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
                  <div><Lbl>Até</Lbl><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
                  <div><Lbl>Valor (€)</Lbl><input type="number" value={searchVal} placeholder="ex: 23.50" step="0.01" onChange={e=>setSearchVal(e.target.value)} style={{fontSize:13}}/></div>
                </div>
                {(search||dateFrom||dateTo||searchVal)&&<button onClick={()=>{setSearch("");setDateFrom("");setDateTo("");setSearchVal("");}} style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"none",padding:"6px",fontSize:12,borderRadius:8}}>✕ Limpar filtros</button>}
              </div>
              {!filteredTrans.length&&<Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:th.textLow,fontSize:14}}>Sem transações.</p></Card>}
              {(()=>{
                // Group by day — style Boonzi
                const byDay = [];
                let currentDay = null;
                filteredTrans.forEach(t=>{
                  const day = t.data;
                  if(day !== currentDay){
                    currentDay = day;
                    byDay.push({day, trans:[]});
                  }
                  byDay[byDay.length-1].trans.push(t);
                });
                return byDay.map(({day, trans:dayTrans})=>{
                  // Saldo do fim do dia = saldoExtrato do movimento com seqInDay===0 (primeiro no ficheiro banco = mais recente = saldo após todos os movimentos do dia)
                  // Fallback: primeiro movimento do array que tenha saldoExtrato definido
                  const anchorTrans = dayTrans.find(t=>t.seqInDay===0&&t.saldoExtrato!=null)
                    ?? dayTrans.find(t=>t.saldoExtrato!=null);
                  const saldoDia = anchorTrans?.saldoApos ?? null;
                  const [ano,mes,dia] = day.split("-");
                  const label = `${dia} ${MESES[parseInt(mes)-1]} ${ano}`;
                  // Total entradas e saídas do dia
                  const entDia = dayTrans.filter(t=>t.tipo==="c"&&!isInt(t)).reduce((a,t)=>a+t.val,0);
                  const saiDia = dayTrans.filter(t=>t.tipo==="d"&&!isInt(t)).reduce((a,t)=>a+t.val,0);
                  return(
                    <div key={day} style={{marginBottom:4}}>
                      {/* Day header */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:th.bgAlt,borderRadius:10,marginBottom:2,position:"sticky",top:0,zIndex:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:13,fontWeight:700,color:"#f59e0b"}}>{label}</span>
                          <div style={{display:"flex",gap:6}}>
                            {entDia>0&&<span style={{fontSize:10,color:"#22c55e"}}>+{fE(entDia)}</span>}
                            {saiDia>0&&<span style={{fontSize:10,color:"#ef4444"}}>-{fE(saiDia)}</span>}
                          </div>
                        </div>
                        <span style={{fontSize:12,fontWeight:600,color:th.textMid}}>{saldoDia!=null?fE(saldoDia):"—"}</span>
                      </div>
                      {/* Day transactions */}
                      <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:10,overflow:"hidden"}}>
                        {dayTrans.map((t,i)=>(
                          <div key={t.id} ref={highlightTransId===t.id?el=>{if(el){el.scrollIntoView({behavior:"smooth",block:"center"});}}:null}
                            style={{borderBottom:i<dayTrans.length-1?"1px solid #0a1220":"none",transition:"background 0.5s",background:highlightTransId===t.id?"rgba(59,130,246,0.18)":"transparent"}}>
                            {editId===t.id?(
                              <div style={{padding:14}}>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                                  <div><Lbl>Data</Lbl><input type="date" value={editD.data} onChange={e=>setEditD(d=>({...d,data:e.target.value}))}/></div>
                                  <div><Lbl>Entidade</Lbl><input type="text" value={editD.ent} onChange={e=>setEditD(d=>({...d,ent:e.target.value}))}/></div>
                                  <div><Lbl>Valor (€)</Lbl><input type="number" value={editD.val||""} step="0.01" placeholder="0.00" onChange={e=>setEditD(d=>({...d,val:parseFloat(e.target.value)||d.val}))}/></div>
                                  <div><Lbl>Tipo</Lbl><select value={editD.tipo||"d"} onChange={e=>setEditD(d=>({...d,tipo:e.target.value}))}><option value="d">💸 Débito / Saída</option><option value="c">💰 Crédito / Entrada</option></select></div>
                                  <div><Lbl>Categoria</Lbl><select value={editD.cat} onChange={e=>setEditD(d=>({...d,cat:e.target.value,sub:""}))}>
                                    {Object.keys(cats).sort((a,b)=>a.localeCompare(b,"pt")).map(c=><option key={c} value={c}>{cats[c].icon} {c}</option>)}
                                  </select></div>
                                  <div><Lbl>Subcategoria</Lbl><select value={editD.sub} onChange={e=>setEditD(d=>({...d,sub:e.target.value}))}>
                                    <option value="">—</option>{(cats[editD.cat]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                                  </select></div>
                                  {(editD.cat==="Transferência Interna"||editD.cat==="Poupança")?(<>
                                    <div><Lbl>Conta origem</Lbl><select value={editD.contaOrigem||""} onChange={e=>setEditD(d=>({...d,contaOrigem:e.target.value}))}>
                                      <option value="">— selecionar —</option>
                                      {CONTA_SECOES.map(sec=>{const sc=contas.filter(c=>c.secao===sec.id);if(!sc.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{sc.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                                    </select></div>
                                    <div><Lbl>Conta destino</Lbl><select value={editD.contaDestino||""} onChange={e=>setEditD(d=>({...d,contaDestino:e.target.value}))}>
                                      <option value="">— selecionar —</option>
                                      {CONTA_SECOES.map(sec=>{const sc=contas.filter(c=>c.secao===sec.id);if(!sc.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{sc.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                                    </select></div>
                                  </>):(<div style={{gridColumn:"1/-1"}}><Lbl>Conta</Lbl>
                                    <select value={editD.contaOrigem||""} onChange={e=>setEditD(d=>({...d,contaOrigem:e.target.value}))}>
                                      <option value="">— não alterar —</option>
                                      {CONTA_SECOES.map(sec=>{const sc=contas.filter(c=>c.secao===sec.id);if(!sc.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{sc.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                                    </select></div>)}
                                </div>
                                <div style={{marginBottom:8}}><Lbl>Nota</Lbl><input type="text" value={editD.nota||""} placeholder="Nota opcional..." onChange={e=>setEditD(d=>({...d,nota:e.target.value}))}/></div>
                                <div style={{display:"flex",gap:8}}>
                                  <Btn variant="primary" onClick={()=>saveEdit(t.id)} full>Guardar</Btn>
                                  <Btn onClick={()=>setEditId(null)}>Cancelar</Btn>
                                  <Btn variant="danger" onClick={()=>delT(t.id)}>×</Btn>
                                </div>
                              </div>
                            ):(
                              <div className="trans-row" style={{padding:"7px 12px",cursor:"pointer"}} onClick={()=>{setEditId(t.id);setEditD({cat:t.cat,sub:t.sub,ent:t.ent,data:t.data,nota:t.nota||"",val:t.val,tipo:t.tipo,contaOrigem:t.contaOrigem||t.contaId||"",contaDestino:t.contaDestino||""});}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <div style={{flex:1,minWidth:0,marginRight:8}}>
                                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                      <p style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:isMobile?"180px":"400px"}}>{t.ent||t.desc}</p>
                                      {t.cat&&<Chip label={`${cats[t.cat]?.icon||""} ${t.cat}`} color={cats[t.cat]?.color||th.textLow} sm/>}
                                      {t.sub&&<span style={{fontSize:10,color:th.textMid}}>· {t.sub}</span>}
                                      {t.nota&&<span style={{fontSize:10,color:"#f59e0b"}}>📝</span>}
                                      {t.splits?.length>0&&<span style={{fontSize:10,color:"#a855f7"}}>✂</span>}
                                    </div>
                                    {t.ent&&t.ent!==t.desc&&<p style={{fontSize:10,color:th.textLow2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{t.desc}</p>}
                                  </div>
                                  <div style={{textAlign:"right",flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                                    <p style={{fontSize:13,fontWeight:600,color:t.tipo==="c"?"#22c55e":isInt(t)?th.textLow:th.text,whiteSpace:"nowrap"}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</p>
                                    <button onClick={e=>{e.stopPropagation();setSplitModal(t.id);setSplitParts(t.splits||[{id:crypto.randomUUID(),val:t.val,cat:t.cat,sub:t.sub,nota:""}]);}} style={{background:"rgba(168,85,247,0.1)",color:"#a855f7",border:"none",borderRadius:6,padding:"2px 6px",fontSize:10,cursor:"pointer"}}>✂</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
              })}
            </div>
          )}

          {/* CATEGORIZAR — estilo Boonzi: lista com pré-preenchimento */}
          {tab==="categorizar"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Categorizar movimentos</p><p style={{fontSize:12,color:th.textLow,marginBottom:12}}>{pend.length} movimentos · {pend.filter(t=>t.ok).length} pré-preenchidos · {pend.filter(t=>!t.ok).length} por categorizar</p></>}
              {!pend.length&&<Card style={{textAlign:"center",padding:"2rem"}}><p style={{color:th.textLow,fontSize:14}}>Tudo categorizado ✓</p></Card>}
              {pend.length>0&&(
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  <Btn variant="success" style={{fontSize:12,padding:"8px 16px"}} onClick={()=>{
                    // Aplicar edições de pEd + marcar ok se tem cat
                    const pendComEd=pend.map(t=>{
                      const ed=pEd[t.id]||{};
                      const cat=ed.cat!==undefined?ed.cat:t.cat;
                      const sub=ed.sub!==undefined?ed.sub:t.sub;
                      const ent=ed.ent!==undefined?ed.ent:t.ent;
                      const nota=ed.nota!==undefined?ed.nota:t.nota;
                      const data=ed.data||t.data;
                      const ok=!!cat;
                      return{...t,cat,sub,ent,nota,data,ok,contaId:t.contaId||ed.contaOrigem||"mill"};
                    });
                    const preench=pendComEd.filter(t=>t.ok);
                    setTrans(prev=>{const ids=new Set(prev.map(t=>t.desc+t.data+t.val));return[...prev,...preench.filter(t=>!ids.has(t.desc+t.data+t.val))];});
                    const remaining=pendComEd.filter(t=>!t.ok);
                    setPend(remaining);
                    if(!remaining.length)setTab("transacoes");
                  }}>✓ Confirmar {pend.filter(t=>t.ok||(pEd[t.id]?.cat)).length} categorizados</Btn>
                  <Btn variant="primary" style={{fontSize:12,padding:"8px 16px"}} onClick={()=>{
                    // Aplicar edições de pEd a todos antes de confirmar
                    const pendComEd=pend.map(t=>{
                      const ed=pEd[t.id]||{};
                      const cat=ed.cat!==undefined?ed.cat:t.cat;
                      const sub=ed.sub!==undefined?ed.sub:t.sub;
                      const ent=ed.ent!==undefined?ed.ent:t.ent;
                      const nota=ed.nota!==undefined?ed.nota:t.nota;
                      const data=ed.data||t.data;
                      return{...t,cat,sub,ent,nota,data,ok:!!cat,contaId:t.contaId||ed.contaOrigem||"mill"};
                    });
                    const validacao = validarSaldoAposImport(pendComEd, trans);
                    setTrans(prev=>{const ids=new Set(prev.map(t=>t.desc+t.data+t.val));return[...prev,...pendComEd.filter(t=>!ids.has(t.desc+t.data+t.val))];});
                    setPend([]);
                    setTab("transacoes");
                    if(validacao){
                      const {saldoBanco, saldoCalculado, dataRef} = validacao;
                      if(saldoCalculado!==null){
                        const desvio = saldoCalculado - saldoBanco;
                        if(Math.abs(desvio)>0.02){
                          setImportMsg(`⚠️ Desvio de saldo detectado em ${dataRef}: banco=${fE(saldoBanco)} · calculado=${fE(saldoCalculado)} · desvio=${desvio>0?"+":""}${fE(desvio)}. Verifica se falta algum movimento.`);
                        } else {
                          setImportMsg(`✓ Saldo validado: ${fE(saldoBanco)} em ${dataRef} · tudo bate certo.`);
                        }
                      } else {
                        setImportMsg(`ℹ️ Saldo do banco: ${fE(saldoBanco)} em ${dataRef}. Define um saldo de referência em Configurações para validação automática.`);
                      }
                    }
                  }}>✓✓ Confirmar todos ({pend.length})</Btn>
                </div>
              )}
              {/* Lista compacta — novo layout centrado */}
              <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:16,overflow:"hidden"}}>
                {/* Header */}
                <div style={{display:"grid",gridTemplateColumns:"90px 1fr 200px 170px 90px 32px",gap:8,padding:"10px 16px",borderBottom:`1px solid ${th.border}`,background:th.bgAlt}}>
                  {["Data","Descrição","Categoria","Subcategoria","Valor",""].map((h,i)=>(
                    <span key={i} style={{fontSize:10,color:th.textLow,textTransform:"uppercase",letterSpacing:1,fontWeight:600}}>{h}</span>
                  ))}
                </div>
                {pend.map(t=>{
                  const ed=pEd[t.id]||{};
                  const catA=ed.cat!==undefined?ed.cat:t.cat;
                  const subA=ed.sub!==undefined?ed.sub:t.sub;
                  const entA=ed.ent!==undefined?ed.ent:t.ent;
                  const isExpanded=ed.expanded;
                  const isPrefilled=t.ok&&!isExpanded;
                  const bgRow = !t.ok?"rgba(239,68,68,0.06)":isPrefilled?"transparent":"rgba(59,130,246,0.04)";
                  return(
                    <div key={t.id} style={{borderBottom:"1px solid #0a1220"}}>
                      {/* Compact row */}
                      <div className="catrow" style={{display:"grid",gridTemplateColumns:"90px 1fr 200px 170px 90px 32px",gap:8,padding:"10px 16px",alignItems:"center",background:bgRow,cursor:"pointer"}}
                        onClick={()=>setPEd(p=>({...p,[t.id]:{...p[t.id],expanded:!isExpanded}}))}>
                        <span style={{fontSize:12,color:th.textLow,fontFamily:"monospace"}}>{t.data.slice(5).split("-").reverse().join("/")}</span>
                        <div style={{minWidth:0}}>
                          <p style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ok?th.text:th.textMid}}>{entA||t.desc}</p>
                          <p style={{fontSize:11,color:th.textLow,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</p>
                          {!t.ok&&<input type="text" defaultValue={entA} placeholder="Entidade..." onClick={e=>e.stopPropagation()}
                            onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],ent:e.target.value}}))}
                            style={{fontSize:11,padding:"2px 6px",marginTop:3,width:"100%",background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:6,color:th.textMid}}/>}
                        </div>
                        <div onClick={e=>e.stopPropagation()}>
                          <select value={catA} onChange={e=>{
                            const newCat=e.target.value;
                            setPEd(p=>({...p,[t.id]:{...p[t.id],cat:newCat,sub:""}}));
                          }}
                            style={{fontSize:12,padding:"5px 8px",width:"100%",background:!catA?"rgba(239,68,68,0.1)":th.bgInput,borderColor:!catA?"rgba(239,68,68,0.4)":th.border}}>
                            <option value="">-- categorizar --</option>
                            {Object.keys(cats).sort((a,b)=>a.localeCompare(b,"pt")).map(c=><option key={c} value={c}>{cats[c].icon} {c}</option>)}
                          </select>
                        </div>
                        <div onClick={e=>e.stopPropagation()}>
                          <select value={subA} onChange={e=>{
                            const newSub=e.target.value;
                            setPEd(p=>({...p,[t.id]:{...p[t.id],sub:newSub}}));
                            // Auto-sugestão: se há outros pendentes com descrição semelhante sem categoria
                            if(catA&&newSub){
                              const descWords=t.desc.toUpperCase().split(/\s+/).slice(0,3).join(" ");
                              const similares=pend.filter(o=>
                                o.id!==t.id&&!o.ok&&
                                o.desc.toUpperCase().includes(descWords)
                              );
                              if(similares.length>0&&confirm(`Encontrei ${similares.length} movimento(s) semelhante(s) a "${t.ent||t.desc}". Aplicar "${catA} / ${newSub}" a todos?`)){
                                setPEd(p=>{
                                  const next={...p};
                                  similares.forEach(o=>{next[o.id]={...p[o.id],cat:catA,sub:newSub};});
                                  return next;
                                });
                                setPend(prev=>prev.map(o=>
                                  similares.some(s=>s.id===o.id) ? {...o,cat:catA,sub:newSub,ok:true} : o
                                ));
                              }
                            }
                          }}
                            style={{fontSize:12,padding:"5px 8px",width:"100%"}}>
                            <option value="">—</option>
                            {(cats[catA]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:t.tipo==="c"?"#22c55e":th.text,whiteSpace:"nowrap",textAlign:"right"}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</span>
                        <span style={{fontSize:12,color:th.textLow,textAlign:"center"}}>{isExpanded?"▲":"▼"}</span>
                      </div>
                      {/* Expanded detail */}
                      {isExpanded&&(
                        <div style={{padding:"12px 14px",background:th.bg,borderTop:`1px solid ${th.border}`}}>
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
                            {/* Conta fields — always show */}
                          {(catA==="Transferência Interna"||catA==="Poupança")?(
                            <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                              <div><Lbl>Conta origem (débito)</Lbl>
                                <select value={ed.contaOrigem||""} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],contaOrigem:e.target.value}}))}>
                                  <option value="">— selecionar —</option>
                                  {CONTA_SECOES.map(sec=>{const secC=contas.filter(c=>c.secao===sec.id);if(!secC.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{secC.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                                </select>
                              </div>
                              <div><Lbl>Conta destino (crédito)</Lbl>
                                <select value={ed.contaDestino||""} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],contaDestino:e.target.value}}))}>
                                  <option value="">— selecionar —</option>
                                  {CONTA_SECOES.map(sec=>{const secC=contas.filter(c=>c.secao===sec.id);if(!secC.length)return null;return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{secC.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);})}
                                </select>
                              </div>
                            </div>
                          ):(
                            <div style={{gridColumn:"1/-1"}}><Lbl>{t.tipo==="d"?"Conta (débito de)":"Conta (crédito em)"}</Lbl>
                              <select value={ed.contaOrigem||""} onChange={e=>setPEd(p=>({...p,[t.id]:{...p[t.id],contaOrigem:e.target.value}}))}>
                                <option value="">— não actualizar saldo —</option>
                                {contas.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome} ({fE(contaSaldos[c.id]??0)})</option>)}
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
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Contas</p><p style={{fontSize:12,color:th.textLow,marginBottom:12}}>Gere saldos e contas</p></>}
              <button onClick={()=>{setTab("transacoes");setAddManual(true);}} style={{width:"100%",background:"rgba(59,130,246,0.08)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.25)",borderRadius:10,padding:"10px",fontSize:13,marginBottom:12}}>
                ＋ Adicionar movimento manual
              </button>

              {/* Saldo por data — single card */}
              <Card style={{marginBottom:14}}>
                <p style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:12}}>📍 Registar saldo</p>
                <p style={{fontSize:11,color:th.textLow,marginBottom:12}}>Define o saldo de uma conta numa data específica. Os movimentos após essa data actualizam o saldo automaticamente.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
                  <div>
                    <Lbl>Conta</Lbl>
                    <select value={snapConta} onChange={e=>setSnapConta(e.target.value)}>
                      {CONTA_SECOES.map(sec=>{
                        const sc=contas.filter(c=>c.secao===sec.id);
                        if(!sc.length) return null;
                        return(<optgroup key={sec.id} label={`${sec.icon} ${sec.label}`}>{sc.map(c=><option key={c.id} value={c.id}>{c.icon} {c.nome}</option>)}</optgroup>);
                      })}
                    </select>
                  </div>
                  <div>
                    <Lbl>Data</Lbl>
                    <input type="date" value={snapData} onChange={e=>setSnapData(e.target.value)}/>
                  </div>
                  <div>
                    <Lbl>Saldo (€)</Lbl>
                    <input type="number" step="0.01" placeholder="Ex: 163.64" value={snapVal} onChange={e=>setSnapVal(e.target.value)}/>
                  </div>
                  <Btn variant="primary" style={{padding:"10px 16px",whiteSpace:"nowrap"}} onClick={()=>{
                    const v=parseFloat(snapVal);
                    if(isNaN(v)||!snapConta||!snapData) return;
                    setContas(prev=>prev.map(c=>c.id===snapConta?{...c,saldoRef:v,saldoRefData:snapData}:c));
                    setSnapVal("");
                  }}>Guardar</Btn>
                </div>
                {/* Show current snapshots */}
                {contas.filter(c=>c.saldoRef!=null).length>0&&(
                  <div style={{marginTop:12,borderTop:`1px solid ${th.border}`,paddingTop:10}}>
                    <p style={{fontSize:10,color:th.textLow,marginBottom:6}}>SALDOS DE REFERÊNCIA</p>
                    {contas.filter(c=>c.saldoRef!=null).map(c=>(
                      <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
                        <span style={{fontSize:12,color:th.text}}>{c.icon} {c.nome}</span>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:11,color:th.textLow}}>{c.saldoRefData}</span>
                          <span style={{fontSize:12,fontWeight:600,color:"#22c55e"}}>{fE(c.saldoRef)}</span>
                          <span style={{fontSize:12,fontWeight:700,color:"#3b82f6"}}>→ {fE(contaSaldos[c.id]??0)}</span>
                          <button onClick={()=>setContas(prev=>prev.map(x=>x.id===c.id?{...x,saldoRef:null,saldoRefData:null}:x))} style={{background:"none",border:"none",color:th.textLow,fontSize:12,cursor:"pointer"}}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card><div style={{display:"flex",justifyContent:"space-between"}}><div><p style={{fontSize:11,color:th.textLow,marginBottom:3}}>Património total</p><p style={{fontSize:24,fontWeight:700,color:"#22c55e"}}>{fE(patrimonioTotal)}</p></div></div></Card>
            </div>
          )}

          {/* CATEGORIAS */}
          {tab==="categorias"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Categorias</p><p style={{fontSize:12,color:th.textLow,marginBottom:14}}>Gere as tuas categorias e subcategorias</p></>}
              <Btn variant="primary" full onClick={()=>setNewCatModal(true)} style={{marginBottom:12,fontSize:13}}>+ Nova categoria</Btn>
              {Object.entries(cats).map(([cat,cfg])=>{
                  const emEdicao=catEditando===cat;
                  return(
                  <Card key={cat} style={{marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:20}}>{cfg.icon}</span>
                      {emEdicao?(
                        <input value={catNomeEdit} onChange={e=>setCatNomeEdit(e.target.value)}
                          style={{fontSize:14,fontWeight:600,color:cfg.color,flex:1,borderBottom:`2px solid ${cfg.color}`,background:"none",border:"none",borderBottom:`2px solid ${cfg.color}`,padding:"2px 4px",outline:"none"}}
                          autoFocus/>
                      ):(
                        <span style={{fontSize:14,fontWeight:600,color:cfg.color,flex:1}}>{cat}</span>
                      )}
                      {emEdicao?(
                        <>
                          <input type="color" value={cfg.color}
                            onChange={e=>setCats(prev=>({...prev,[cat]:{...prev[cat],color:e.target.value}}))}
                            style={{width:28,height:28,border:"none",borderRadius:6,cursor:"pointer",padding:2}}/>
                          <button onClick={()=>{
                            const newName=catNomeEdit.trim();
                            if(newName&&newName!==cat){
                              const c={...cats};c[newName]={...c[cat]};delete c[cat];setCats(c);
                              setTrans(prev=>prev.map(t=>t.cat===cat?{...t,cat:newName}:t));
                              setOrcs(prev=>{const n={};Object.entries(prev).forEach(([mk,mo])=>{n[mk]={};Object.entries(mo).forEach(([k,v])=>{n[mk][k.startsWith(cat+"::")?newName+"::"+k.slice(cat.length+2):k===cat?newName:k]=v;});});return n;});
                            }
                            setCatEditando(null);
                          }} style={{background:"rgba(34,197,94,0.15)",color:"#22c55e",border:"none",borderRadius:8,padding:"4px 10px",fontSize:12,cursor:"pointer",fontWeight:600}}>✓</button>
                        </>
                      ):(
                        <button onClick={()=>{setCatEditando(cat);setCatNomeEdit(cat);}}
                          style={{background:"none",border:"none",color:th.textLow,fontSize:14,cursor:"pointer",padding:"0 4px"}} title="Editar">✏️</button>
                      )}
                      <button onClick={()=>{if(confirm(`Apagar categoria "${cat}"?`)){const c={...cats};delete c[cat];setCats(c);}}} style={{background:"none",border:"none",color:th.textLow,fontSize:16,cursor:"pointer",padding:"0 4px"}}>×</button>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {(cfg.subs||[]).map(s=>(
                        <div key={s} style={{display:"flex",alignItems:"center",gap:4,background:`rgba(${th.bg==="#f0ece4"?"0,0,0":"255,255,255"},0.05)`,borderRadius:20,padding:"3px 10px"}}>
                          {emEdicao?(
                            <input defaultValue={s} onBlur={e=>{
                              const newSub=e.target.value.trim();
                              if(newSub&&newSub!==s){
                                setCats(prev=>({...prev,[cat]:{...prev[cat],subs:prev[cat].subs.map(x=>x===s?newSub:x)}}));
                                setTrans(prev=>prev.map(t=>t.cat===cat&&t.sub===s?{...t,sub:newSub}:t));
                              }
                            }} style={{fontSize:11,color:th.textMid,background:"none",border:"none",borderBottom:`1px dashed ${th.border}`,width:`${Math.max(s.length,4)+1}ch`,outline:"none"}}/>
                          ):(
                            <span style={{fontSize:11,color:th.textMid}}>{s}</span>
                          )}
                          <button onClick={()=>setCats(prev=>({...prev,[cat]:{...prev[cat],subs:prev[cat].subs.filter(x=>x!==s)}}))} style={{background:"none",border:"none",color:th.textLow,fontSize:12,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
                        </div>
                      ))}
                      {emEdicao&&<button onClick={()=>{const s=prompt("Nova subcategoria:");if(s)setCats(prev=>({...prev,[cat]:{...prev[cat],subs:[...(prev[cat].subs||[]),s]}}));}} style={{background:"rgba(59,130,246,0.1)",border:"none",color:"#3b82f6",borderRadius:20,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>+ subcategoria</button>}
                    </div>
                  </Card>
                  );
              })}
            </div>
          )}

          {/* IMPORTAR */}
          {tab==="importar"&&(
            <div>
              {!isMobile&&<><p style={{fontSize:20,fontWeight:600,color:th.text,marginBottom:2}}>Importar</p><p style={{fontSize:12,color:th.textLow,marginBottom:14}}>Millennium BCP → Movimentos → Exportar</p></>}
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
                <p style={{fontSize:12,color:th.textLow,marginBottom:6}}>Base de dados · {trans.length} transações · {pend.length} por categorizar</p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <Btn onClick={exportJSON} style={{fontSize:12}}>↓ Exportar backup JSON</Btn>
                  <Btn onClick={exportExcel} style={{fontSize:12,background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>↓ Exportar Excel/CSV</Btn>
                  <label style={{background:`rgba(${th.bg==="#f0ece4"?"0,0,0":"255,255,255"},0.05)`,color:th.textMid,border:`1px solid ${th.border}`,borderRadius:10,padding:"8px 14px",fontSize:12,cursor:"pointer"}}>↑ Importar backup<input type="file" accept=".json" style={{display:"none"}} onChange={e=>importJSON(e.target.files[0])}/></label>
                  <Btn variant="danger" style={{fontSize:12}} onClick={()=>{if(confirm("Apagar todas as transações?")){setTrans([]);setPend([]);}}}>Apagar</Btn>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Mobile tab bar */}
        {isMobile&&(
          <div className="tabbar">
            <button onClick={()=>setScreen("landing")} style={{fontSize:10,color:th.textLow,flexDirection:"column",display:"flex",alignItems:"center",gap:2,padding:"10px 2px",background:"none",border:"none"}}><span style={{fontSize:18}}>🏠</span>Hub</button>
            {navItems.filter(n=>n.id!=="config").map(n=><button key={n.id} className={tab===n.id?"act":""} onClick={()=>setTab(n.id)}><span style={{fontSize:18}}>{n.icon}</span>{n.label}</button>)}
            <button className={configSubTabs.some(s=>s.id===tab)?"act":""} onClick={()=>setTab("contas")}><span style={{fontSize:18}}>⚙</span>Config</button>
          </div>
        )}
      </div>

      {/* MODAL: transações de uma categoria */}
      {catModal&&(
        <Modal onClose={()=>setCatModal(null)}>
          <p style={{fontSize:16,fontWeight:600,color:th.text,marginBottom:4}}>{cats[catModalCat]?.icon||"⚠️"} {catModalLabel}</p>
          {catModal?.includes("::")&&<p style={{fontSize:11,color:th.textLow,marginBottom:4}}>{cats[catModalCat]?.icon} {catModalCat}</p>}
          <p style={{fontSize:12,color:th.textLow,marginBottom:14}}>{catTransactions.length} movimentos{catModal!=="__SEM_CATEGORIA__"?` · ${MESES[fMes]} ${fAno}`:""}</p>
          {catTransactions.length===0&&<p style={{color:th.textLow,fontSize:13}}>Sem movimentos nesta categoria.</p>}
          {catTransactions.map(t=>(
            <div key={t.id} className="hrow" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:`1px solid ${th.border}`,cursor:"pointer"}} title="Clica para ver no tab Transações"
              onClick={()=>{
                const[y,m]=t.data.split("-");
                setFAno(parseInt(y));setFMes(parseInt(m)-1);
                setContaFiltro("all");
                setTab("transacoes");
                setHighlightTransId(t.id);
                setCatModal(null);
              }}>
              <div style={{flex:1,minWidth:0,marginRight:8}}>
                <p style={{fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:th.text}}>{t.ent||t.desc}</p>
                <p style={{fontSize:10,color:th.textLow}}>{t.data.slice(5).split("-").reverse().join("/")} {t.sub&&`· ${t.sub}`}{!t.cat&&<span style={{color:"#ef4444"}}> · sem categoria</span>}{t.cat&&!t.sub&&<span style={{color:"#f59e0b"}}> · sem subcategoria</span>} <span style={{color:"#3b82f6",fontSize:9}}>→ ver</span></p>
                {t.nota&&<p style={{fontSize:10,color:"#f59e0b"}}>📝 {t.nota}</p>}
              </div>
              <span style={{fontSize:13,fontWeight:600,color:t.tipo==="c"?"#22c55e":th.text,flexShrink:0}}>{t.tipo==="c"?"+":"-"}{fE(t.val)}</span>
            </div>
          ))}
          {(()=>{
            const totalOut=catTransactions.filter(t=>t.tipo==="d").reduce((a,t)=>a+t.val,0);
            const totalIn=catTransactions.filter(t=>t.tipo==="c").reduce((a,t)=>a+t.val,0);
            const saldo=totalIn-totalOut;
            const isNet=NET_CATS.has(catModalCat)||catModal==="__SEM_CATEGORIA__";
            const isCOModal=catModal?.includes("::")&&catModal.split("::")[1]==="Compras Outros"||catModalCat==="Vários / Extras";
            const showNet=isNet||isCOModal||totalIn>0;
            return(<>
              {showNet?(
                <div style={{marginTop:14,padding:"10px",background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:saldo!==0&&totalIn>0?6:0}}>
                    <span style={{fontSize:13,color:th.textLow}}>Total saídas</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#ef4444"}}>{fE(totalOut)}</span>
                  </div>
                  {totalIn>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:13,color:th.textLow}}>Entradas / reembolsos</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#22c55e"}}>+{fE(totalIn)}</span>
                  </div>}
                  <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${th.border}`,paddingTop:6,marginTop:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:th.text}}>Saldo líquido</span>
                    <span style={{fontSize:14,fontWeight:700,color:saldo<=0?"#ef4444":"#22c55e"}}>{fE(saldo)}</span>
                  </div>
                </div>
              ):(
                <div style={{marginTop:14,padding:"10px",background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:th.textLow}}>Total saídas</span>
                  <span style={{fontSize:14,fontWeight:600,color:"#ef4444"}}>{fE(totalOut)}</span>
                </div>
              )}
            </>);
          })()}
        </Modal>
      )}

      {/* MODAL: nova categoria */}
      {/* SPLIT MODAL */}
      {splitModal&&(()=>{
        const t=trans.find(x=>x.id===splitModal);
        if(!t) return null;
        const total=splitParts.reduce((a,p)=>a+(parseFloat(p.val)||0),0);
        const diff=Math.abs(t.val-total);
        const ok=diff<0.01;
        return(
          <Modal onClose={()=>setSplitModal(null)}>
            <p style={{fontSize:16,fontWeight:600,color:th.text,marginBottom:4}}>✂ Dividir movimento</p>
            <p style={{fontSize:12,color:th.textLow,marginBottom:6}}>{t.ent||t.desc} · {fE(t.val)}</p>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12,padding:"6px 10px",background:ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",borderRadius:8}}>
              <span style={{fontSize:12,color:ok?"#22c55e":"#ef4444"}}>Total partes: {fE(total)}</span>
              {!ok&&<span style={{fontSize:12,color:"#ef4444"}}>Falta: {fE(t.val-total)}</span>}
              {ok&&<span style={{fontSize:12,color:"#22c55e"}}>✓ Bate certo</span>}
            </div>
            {splitParts.map((p,i)=>(
              <div key={p.id} style={{background:darkMode?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)",borderRadius:10,padding:"10px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#a855f7"}}>Parte {i+1}</span>
                  {splitParts.length>1&&<button onClick={()=>setSplitParts(prev=>prev.filter((_,j)=>j!==i))}
                    style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"none",borderRadius:6,padding:"2px 8px",fontSize:12}}>×</button>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><Lbl>Valor (€)</Lbl>
                    <input type="number" value={p.val} step="0.01"
                      onChange={e=>setSplitParts(prev=>prev.map((x,j)=>j===i?{...x,val:e.target.value}:x))}
                      style={{fontSize:13}}/>
                  </div>
                  <div><Lbl>Categoria</Lbl>
                    <select value={p.cat} onChange={e=>setSplitParts(prev=>prev.map((x,j)=>j===i?{...x,cat:e.target.value,sub:""}:x))}
                      style={{fontSize:12}}>
                      <option value="">Selecionar...</option>
                      {Object.keys(cats).sort((a,b)=>a.localeCompare(b,"pt")).map(c=><option key={c} value={c}>{cats[c].icon} {c}</option>)}
                    </select>
                  </div>
                  <div><Lbl>Subcategoria</Lbl>
                    <select value={p.sub} onChange={e=>setSplitParts(prev=>prev.map((x,j)=>j===i?{...x,sub:e.target.value}:x))}
                      style={{fontSize:12}}>
                      <option value="">—</option>
                      {(cats[p.cat]?.subs||[]).map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><Lbl>Nota</Lbl>
                    <input type="text" value={p.nota} placeholder="Opcional..."
                      onChange={e=>setSplitParts(prev=>prev.map((x,j)=>j===i?{...x,nota:e.target.value}:x))}
                      style={{fontSize:12}}/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={()=>setSplitParts(prev=>[...prev,{id:crypto.randomUUID(),val:0,cat:"",sub:"",nota:""}])}
              style={{width:"100%",background:"rgba(168,85,247,0.1)",color:"#a855f7",border:"1px dashed rgba(168,85,247,0.3)",borderRadius:8,padding:"8px",fontSize:13,marginBottom:12}}>
              + Adicionar parte
            </button>
            <div style={{display:"flex",gap:8}}>
              <Btn variant="primary" full onClick={()=>{
                if(!ok){alert("O total das partes tem de ser igual ao valor do movimento.");return;}
                setTrans(prev=>prev.map(x=>x.id===splitModal?{...x,splits:splitParts,cat:splitParts[0].cat,sub:splitParts[0].sub,nota:splitParts[0].nota}:x));
                setSplitModal(null);
              }}>✓ Guardar divisão</Btn>
              <Btn onClick={()=>setSplitModal(null)}>Cancelar</Btn>
            </div>
          </Modal>
        );
      })()}

      {newCatModal&&(
        <Modal onClose={()=>setNewCatModal(false)}>
          <p style={{fontSize:16,fontWeight:600,color:th.text,marginBottom:16}}>Nova categoria</p>
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
    </ThemeCtx.Provider>
  );
}
