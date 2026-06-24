import { useState, useMemo, useEffect } from "react";

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:   "#0B7A4F",
  primaryDk: "#085A3A",
  primaryLt: "#E6F4EE",
  accent:    "#F4A623",
  accentLt:  "#FEF8EC",
  wa:        "#25D366",
  waDk:      "#1DA851",
  bg:        "#F5F4F0",
  card:      "#FFFFFF",
  text:      "#1A1A1A",
  muted:     "#6B7280",
  border:    "#E5E3DC",
  danger:    "#EF4444",
  dangerLt:  "#FEF2F2",
};

const f = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans:  "'Inter', system-ui, -apple-system, sans-serif",
  mono:  "'SF Mono', 'Fira Code', monospace",
};

// ── Mock data ─────────────────────────────────────────────────────────────────
const VENDORS = [
  { id:"v1", name:"Mama Njeri Veggies",   loc:"Westlands",  rating:4.8, time:"30–45 min", phone:"254700000001" },
  { id:"v2", name:"Kamau Fresh Produce",  loc:"Kibera",     rating:4.6, time:"45–60 min", phone:"254700000002" },
  { id:"v3", name:"Nairobi Superstore",   loc:"CBD",        rating:4.5, time:"25–40 min", phone:"254700000003" },
  { id:"v4", name:"Eastleigh Wholesale",  loc:"Eastleigh",  rating:4.7, time:"35–50 min", phone:"254700000004" },
  { id:"v5", name:"TechHub Kenya",        loc:"Westlands",  rating:4.9, time:"60–90 min", phone:"254700000005" },
];

const LISTINGS = [
  { id:"l1",  name:"Tomatoes",       cat:"Vegetables",  vid:"v1", price:80,  unit:"kg",     emoji:"🍅" },
  { id:"l2",  name:"Tomatoes",       cat:"Vegetables",  vid:"v2", price:75,  unit:"kg",     emoji:"🍅" },
  { id:"l3",  name:"Sukuma Wiki",    cat:"Vegetables",  vid:"v1", price:30,  unit:"bunch",  emoji:"🥬" },
  { id:"l4",  name:"Onions",         cat:"Vegetables",  vid:"v1", price:60,  unit:"kg",     emoji:"🧅" },
  { id:"l5",  name:"Carrots",        cat:"Vegetables",  vid:"v2", price:70,  unit:"kg",     emoji:"🥕" },
  { id:"l6",  name:"Spinach",        cat:"Vegetables",  vid:"v2", price:25,  unit:"bunch",  emoji:"🌿" },
  { id:"l7",  name:"Unga 2kg",       cat:"Groceries",   vid:"v3", price:175, unit:"packet", emoji:"🌾" },
  { id:"l8",  name:"Unga 2kg",       cat:"Groceries",   vid:"v4", price:165, unit:"packet", emoji:"🌾" },
  { id:"l9",  name:"Sugar 1kg",      cat:"Groceries",   vid:"v3", price:130, unit:"kg",     emoji:"🍚" },
  { id:"l10", name:"Sugar 1kg",      cat:"Groceries",   vid:"v4", price:125, unit:"kg",     emoji:"🍚" },
  { id:"l11", name:"Cooking Oil 1L", cat:"Groceries",   vid:"v3", price:195, unit:"litre",  emoji:"🫙" },
  { id:"l12", name:"Rice 1kg",       cat:"Groceries",   vid:"v4", price:120, unit:"kg",     emoji:"🍚" },
  { id:"l13", name:"Eggs (tray)",    cat:"Groceries",   vid:"v3", price:480, unit:"tray",   emoji:"🥚" },
  { id:"l14", name:"Milk 500ml",     cat:"Groceries",   vid:"v4", price:60,  unit:"bottle", emoji:"🥛" },
  { id:"l15", name:"Phone Charger",  cat:"Electronics", vid:"v5", price:350, unit:"piece",  emoji:"🔌" },
  { id:"l16", name:"Earphones",      cat:"Electronics", vid:"v5", price:450, unit:"piece",  emoji:"🎧" },
  { id:"l17", name:"Phone Case",     cat:"Electronics", vid:"v5", price:200, unit:"piece",  emoji:"📱" },
  { id:"l18", name:"Bananas",        cat:"Fruits",      vid:"v1", price:40,  unit:"bunch",  emoji:"🍌" },
  { id:"l19", name:"Avocados",       cat:"Fruits",      vid:"v2", price:20,  unit:"piece",  emoji:"🥑" },
  { id:"l20", name:"Mangoes",        cat:"Fruits",      vid:"v1", price:35,  unit:"piece",  emoji:"🥭" },
];

const CATEGORIES = [
  { id:"all",         label:"All",        emoji:"🛒" },
  { id:"Vegetables",  label:"Vegetables", emoji:"🥬" },
  { id:"Fruits",      label:"Fruits",     emoji:"🍌" },
  { id:"Groceries",   label:"Groceries",  emoji:"🌾" },
  { id:"Electronics", label:"Electronics",emoji:"📱" },
];

const DELIVERY_FEE = 150;

// ── Helpers ───────────────────────────────────────────────────────────────────
const kes  = n => `KES ${Number(n).toLocaleString()}`;
const star = r => "⭐".repeat(Math.round(r)).padEnd(5,"☆");
const vmap = Object.fromEntries(VENDORS.map(v => [v.id, v]));

function groupByName(listings) {
  const g = {};
  for (const l of listings) {
    if (!g[l.name]) g[l.name] = { name: l.name, cat: l.cat, emoji: l.emoji, listings: [] };
    g[l.name].listings.push(l);
  }
  return Object.values(g).map(g => ({
    ...g,
    minPrice: Math.min(...g.listings.map(l => l.price)),
    maxPrice: Math.max(...g.listings.map(l => l.price)),
    unit:     g.listings[0].unit,
    vendors:  g.listings.length,
    savings:  Math.max(...g.listings.map(l => l.price)) - Math.min(...g.listings.map(l => l.price)),
  }));
}

const ALL_GROUPS = groupByName(LISTINGS);

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant="primary", style={}, disabled=false }) {
  const base = {
    display:"inline-flex", alignItems:"center", justifyContent:"center",
    gap:8, padding:"12px 22px", borderRadius:10, border:"none",
    fontFamily:f.sans, fontSize:15, fontWeight:600, cursor: disabled ? "not-allowed" : "pointer",
    transition:"all .15s", userSelect:"none", opacity: disabled ? .5 : 1,
  };
  const variants = {
    primary:   { background: C.primary, color:"#fff" },
    accent:    { background: C.accent,  color:"#fff" },
    wa:        { background: C.wa,      color:"#fff" },
    outline:   { background:"transparent", color: C.primary, border:`1.5px solid ${C.primary}` },
    ghost:     { background:"transparent", color: C.muted,   border:`1px solid ${C.border}` },
    danger:    { background: C.danger,  color:"#fff" },
  };
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{ ...base, ...variants[variant], ...(hovered && !disabled ? { filter:"brightness(1.08)", transform:"translateY(-1px)" } : {}), ...style }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >{children}</button>
  );
}

function Badge({ children, color="primary" }) {
  const colors = {
    primary: { bg: C.primaryLt, text: C.primary },
    accent:  { bg: C.accentLt,  text: "#b57d0f" },
    green:   { bg: "#dcfce7",   text: "#166534" },
    muted:   { bg: "#f3f4f6",   text: C.muted },
  };
  const { bg, text } = colors[color] || colors.primary;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px",
      borderRadius:999, background:bg, color:text, fontSize:12, fontWeight:600, fontFamily:f.sans }}>
      {children}
    </span>
  );
}

function Stars({ rating }) {
  return (
    <span style={{ fontSize:13, color: C.accent }}>
      {"★".repeat(Math.floor(rating))}{"☆".repeat(5 - Math.floor(rating))}
      <span style={{ color: C.muted, fontFamily:f.sans, marginLeft:4 }}>{rating}</span>
    </span>
  );
}

function Input({ label, value, onChange, placeholder, type="text", prefix }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontFamily:f.sans, fontSize:14, fontWeight:500, color:C.text }}>{label}</label>}
      <div style={{ position:"relative" }}>
        {prefix && <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)",
          color:C.muted, fontFamily:f.sans, fontSize:15 }}>{prefix}</span>}
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width:"100%", padding: prefix ? "13px 14px 13px 40px" : "13px 14px",
            borderRadius:10, border:`1.5px solid ${C.border}`, fontFamily:f.sans, fontSize:15,
            color:C.text, background:C.card, outline:"none", boxSizing:"border-box",
            transition:"border .15s" }}
          onFocus={e => e.target.style.borderColor = C.primary}
          onBlur={e => e.target.style.borderColor = C.border}
        />
      </div>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ page, setPage, cartCount, query, setQuery, onSearch }) {
  const [localQ, setLocalQ] = useState(query);
  const submit = (e) => { e.preventDefault(); onSearch(localQ); };

  return (
    <nav style={{ position:"sticky", top:0, zIndex:100, background:C.card,
      borderBottom:`1px solid ${C.border}`, padding:"0 24px" }}>
      <div style={{ maxWidth:1100, margin:"0 auto", height:64,
        display:"flex", alignItems:"center", gap:16 }}>

        {/* Logo */}
        <button onClick={() => setPage("home")} style={{ background:"none", border:"none",
          cursor:"pointer", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div style={{ width:34, height:34, borderRadius:8, background: C.primary,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🛒</div>
          <span style={{ fontFamily:f.sans, fontWeight:700, fontSize:18,
            color: C.primary, letterSpacing:"-0.3px" }}>WeBizzle!</span>
        </button>

        {/* Search bar */}
        <form onSubmit={submit} style={{ flex:1, display:"flex", gap:8, maxWidth:540 }}>
          <div style={{ flex:1, position:"relative" }}>
            <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)",
              fontSize:16, pointerEvents:"none" }}>🔍</span>
            <input
              value={localQ} onChange={e => setLocalQ(e.target.value)}
              placeholder="Search tomatoes, unga, charger…"
              style={{ width:"100%", padding:"10px 14px 10px 40px", borderRadius:10,
                border:`1.5px solid ${C.border}`, fontFamily:f.sans, fontSize:14,
                color:C.text, background:C.bg, outline:"none", boxSizing:"border-box" }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>
          <Btn onClick={submit} style={{ padding:"10px 18px", fontSize:14 }}>Search</Btn>
        </form>

        <div style={{ flex:1 }} />

        {/* Cart */}
        <button onClick={() => setPage("cart")} style={{ position:"relative", background:"none",
          border:"none", cursor:"pointer", padding:8, borderRadius:10,
          display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:22 }}>🛒</span>
          {cartCount > 0 && (
            <span style={{ position:"absolute", top:2, right:2, minWidth:18, height:18,
              borderRadius:999, background:C.accent, color:"#fff",
              fontSize:11, fontWeight:700, fontFamily:f.sans,
              display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" }}>
              {cartCount}
            </span>
          )}
          <span style={{ fontFamily:f.sans, fontSize:14, fontWeight:500,
            color:C.text, display:"none" }}>Cart</span>
        </button>

        {/* WhatsApp */}
        <Btn variant="wa" onClick={() => window.open("https://wa.me/254700000000?text=Hi", "_blank")}
          style={{ padding:"10px 16px", fontSize:13, flexShrink:0 }}>
          📱 Chat
        </Btn>
      </div>
    </nav>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ group, onSelect }) {
  const sorted = [...group.listings].sort((a, b) => a.price - b.price);
  const best = sorted[0];
  const maxP = sorted[sorted.length - 1]?.price || best.price;

  return (
    <div onClick={() => onSelect(group)}
      style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`,
        overflow:"hidden", cursor:"pointer", transition:"box-shadow .15s, transform .15s" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      {/* Emoji banner */}
      <div style={{ height:100, background:`linear-gradient(135deg, ${C.primaryLt}, ${C.accentLt})`,
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:52, position:"relative" }}>
        {group.emoji}
        {group.savings > 0 && (
          <div style={{ position:"absolute", top:10, right:10 }}>
            <Badge color="accent">Save up to {kes(group.savings)}</Badge>
          </div>
        )}
      </div>

      <div style={{ padding:"14px 16px 16px" }}>
        <div style={{ fontFamily:f.sans, fontWeight:600, fontSize:15, color:C.text, marginBottom:2 }}>
          {group.name}
        </div>
        <div style={{ fontFamily:f.sans, fontSize:13, color:C.muted, marginBottom:12 }}>
          per {group.unit} · {group.vendors} vendor{group.vendors > 1 ? "s" : ""}
        </div>

        {/* Price comparison bars — the signature element */}
        <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:12 }}>
          {sorted.map((l, i) => {
            const v = vmap[l.vid];
            const pct = maxP > best.price ? ((l.price - best.price) / (maxP - best.price)) * 100 : 0;
            const isBest = i === 0;
            return (
              <div key={l.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:90, fontFamily:f.sans, fontSize:11, color: isBest ? C.primary : C.muted,
                  fontWeight: isBest ? 600 : 400, whiteSpace:"nowrap", overflow:"hidden",
                  textOverflow:"ellipsis" }}>
                  {v?.name.split(" ")[0]}
                </div>
                <div style={{ flex:1, height:6, borderRadius:999, background:"#F0EDE8", overflow:"hidden" }}>
                  <div style={{ height:"100%", width: isBest ? "20%" : `${20 + pct * 0.8}%`,
                    borderRadius:999, background: isBest ? C.primary : "#D0C9BE",
                    transition:"width .5s" }} />
                </div>
                <div style={{ fontFamily:f.mono, fontSize:13, fontWeight: isBest ? 700 : 400,
                  color: isBest ? C.primary : C.muted, whiteSpace:"nowrap" }}>
                  {kes(l.price)}
                </div>
                {isBest && <Badge color="green">Best</Badge>}
              </div>
            );
          })}
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <span style={{ fontFamily:f.sans, fontSize:12, color:C.muted }}>from </span>
            <span style={{ fontFamily:f.mono, fontSize:20, fontWeight:700, color:C.primary }}>
              {kes(best.price)}
            </span>
            <span style={{ fontFamily:f.sans, fontSize:12, color:C.muted }}>/{best.unit}</span>
          </div>
          <div style={{ fontFamily:f.sans, fontSize:12, color:C.muted, background:C.bg,
            padding:"4px 10px", borderRadius:999 }}>Compare →</div>
        </div>
      </div>
    </div>
  );
}

// ── Home Page ─────────────────────────────────────────────────────────────────
function HomePage({ onSearch, setPage }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const featured = useMemo(() => ALL_GROUPS.slice(0, 8), []);

  const submit = () => { if (q.trim()) onSearch(q); };

  return (
    <div>
      {/* Hero */}
      <div style={{ background:`linear-gradient(160deg, ${C.primary} 0%, #0d5c3a 100%)`,
        padding:"60px 24px 70px", textAlign:"center" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.15)",
            padding:"6px 16px", borderRadius:999, marginBottom:20 }}>
            <span style={{ fontSize:14 }}>🇰🇪</span>
            <span style={{ fontFamily:f.sans, fontSize:13, color:"rgba(255,255,255,.9)", fontWeight:500 }}>
              Serving Nairobi · Free delivery on orders over KES 1,000
            </span>
          </div>
          <h1 style={{ fontFamily:f.serif, fontSize:"clamp(32px,5vw,52px)", color:"#fff",
            fontWeight:700, lineHeight:1.15, margin:"0 0 12px", letterSpacing:"-0.5px" }}>
            Nunua kwa Bei Bora
          </h1>
          <p style={{ fontFamily:f.sans, fontSize:17, color:"rgba(255,255,255,.8)",
            margin:"0 0 32px", lineHeight:1.6 }}>
            Compare prices from local vendors. Pay via M-Pesa.<br/>
            Get boda boda delivery in under 60 minutes.
          </p>

          {/* Big search */}
          <div style={{ display:"flex", gap:8, background:"#fff", borderRadius:14,
            padding:6, boxShadow:"0 8px 40px rgba(0,0,0,.2)" }}>
            <span style={{ padding:"0 12px", display:"flex", alignItems:"center",
              fontSize:20, flexShrink:0 }}>🔍</span>
            <input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Try: tomatoes, unga, charger, sugar…"
              style={{ flex:1, border:"none", outline:"none", fontFamily:f.sans,
                fontSize:16, color:C.text, background:"transparent", padding:"10px 0" }} />
            <Btn onClick={submit} style={{ padding:"12px 28px", fontSize:15, flexShrink:0 }}>
              Search
            </Btn>
          </div>

          {/* Quick searches */}
          <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
            {["Tomatoes","Unga 2kg","Sugar","Eggs"].map(s => (
              <button key={s} onClick={() => onSearch(s)}
                style={{ background:"rgba(255,255,255,.2)", border:"1px solid rgba(255,255,255,.3)",
                  borderRadius:999, padding:"5px 14px", fontFamily:f.sans, fontSize:13,
                  color:"#fff", cursor:"pointer" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ background:C.card, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px 24px",
          display:"flex", gap:32, justifyContent:"center", flexWrap:"wrap" }}>
          {[["🔍","Search & Compare","See prices from all local vendors"],
            ["💳","Pay via M-Pesa","Secure STK push to your phone"],
            ["🛵","Boda Delivery","Your order arrives in under an hour"]].map(([e, t, s]) => (
            <div key={t} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:24 }}>{e}</span>
              <div>
                <div style={{ fontFamily:f.sans, fontWeight:600, fontSize:14, color:C.text }}>{t}</div>
                <div style={{ fontFamily:f.sans, fontSize:12, color:C.muted }}>{s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 24px" }}>

        {/* Categories */}
        <div style={{ display:"flex", gap:10, marginBottom:32, overflowX:"auto", paddingBottom:4 }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => { setCat(c.id); if (c.id !== "all") onSearch(c.id); }}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 20px",
                borderRadius:10, border:`1.5px solid ${cat === c.id ? C.primary : C.border}`,
                background: cat === c.id ? C.primaryLt : C.card,
                color: cat === c.id ? C.primary : C.muted,
                fontFamily:f.sans, fontSize:14, fontWeight: cat === c.id ? 600 : 400,
                cursor:"pointer", whiteSpace:"nowrap", flexShrink:0, transition:"all .15s" }}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>

        {/* Featured products */}
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between",
          marginBottom:20 }}>
          <h2 style={{ fontFamily:f.sans, fontSize:20, fontWeight:700, color:C.text }}>
            Featured Products
          </h2>
          <button onClick={() => onSearch("")} style={{ fontFamily:f.sans, fontSize:14,
            color:C.primary, background:"none", border:"none", cursor:"pointer" }}>
            View all →
          </button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px,1fr))", gap:16 }}>
          {featured.map(g => (
            <ProductCard key={g.name} group={g}
              onSelect={g => onSearch(g.name)} />
          ))}
        </div>

        {/* WhatsApp banner */}
        <div style={{ marginTop:48, borderRadius:16, background:`linear-gradient(135deg, #128C7E, ${C.wa})`,
          padding:"32px 40px", display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:20 }}>
          <div>
            <div style={{ fontFamily:f.sans, fontWeight:700, fontSize:20, color:"#fff", marginBottom:6 }}>
              📱 Prefer WhatsApp?
            </div>
            <div style={{ fontFamily:f.sans, fontSize:15, color:"rgba(255,255,255,.85)" }}>
              Shop the same products, compare prices, and get boda delivery — all inside WhatsApp.
            </div>
          </div>
          <Btn variant="ghost" style={{ background:"rgba(255,255,255,.2)", color:"#fff",
            border:"1.5px solid rgba(255,255,255,.4)", flexShrink:0 }}
            onClick={() => window.open("https://wa.me/254700000000?text=Hi", "_blank")}>
            Open in WhatsApp →
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Search Results ─────────────────────────────────────────────────────────────
function ResultsPage({ query, onSelect, onSearch }) {
  const results = useMemo(() => {
    if (!query) return ALL_GROUPS;
    const q = query.toLowerCase();
    return ALL_GROUPS.filter(g =>
      g.name.toLowerCase().includes(q) || g.cat.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:f.sans, fontSize:22, fontWeight:700, color:C.text, margin:0 }}>
          {query ? `Results for "${query}"` : "All Products"}
        </h1>
        <p style={{ fontFamily:f.sans, fontSize:14, color:C.muted, margin:"4px 0 0" }}>
          {results.length} product{results.length !== 1 ? "s" : ""} found
          {results.length > 0 ? " — showing cheapest price first" : ""}
        </p>
      </div>

      {results.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 0" }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🤷</div>
          <div style={{ fontFamily:f.sans, fontSize:18, fontWeight:600, color:C.text, marginBottom:8 }}>
            Nothing found for "{query}"
          </div>
          <p style={{ fontFamily:f.sans, color:C.muted, marginBottom:24 }}>
            Try a different word, or browse categories below.
          </p>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            {["Tomatoes","Sugar","Unga","Eggs"].map(s => (
              <Btn key={s} variant="outline" onClick={() => onSearch(s)} style={{ fontSize:13 }}>{s}</Btn>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px,1fr))", gap:16 }}>
          {results.map(g => <ProductCard key={g.name} group={g} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

// ── Product Detail ────────────────────────────────────────────────────────────
function ProductPage({ group, onAddToCart, onBack }) {
  const sorted = [...group.listings].sort((a, b) => a.price - b.price);
  const [chosen, setChosen] = useState(sorted[0]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const vendor = vmap[chosen.vid];

  const handleAdd = () => {
    onAddToCart({ ...chosen, quantity: qty, vendorName: vendor.name });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const savings = chosen.price < sorted[sorted.length - 1]?.price
    ? 0
    : sorted[sorted.length - 1]?.price - chosen.price;

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"32px 24px" }}>
      <button onClick={onBack} style={{ fontFamily:f.sans, fontSize:14, color:C.muted,
        background:"none", border:"none", cursor:"pointer", marginBottom:24, display:"flex",
        alignItems:"center", gap:6 }}>
        ← Back to results
      </button>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:32 }}>

        {/* Left — product visual */}
        <div>
          <div style={{ borderRadius:16, background:`linear-gradient(135deg, ${C.primaryLt}, ${C.accentLt})`,
            height:260, display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:100, marginBottom:20 }}>
            {group.emoji}
          </div>

          <h1 style={{ fontFamily:f.sans, fontSize:26, fontWeight:700, color:C.text, margin:"0 0 6px" }}>
            {group.name}
          </h1>
          <div style={{ fontFamily:f.sans, fontSize:15, color:C.muted, marginBottom:20 }}>
            {group.cat} · per {group.unit}
          </div>

          {group.vendors > 1 && (
            <div style={{ background:C.accentLt, borderRadius:10, padding:"12px 16px",
              border:`1px solid ${C.accent}33` }}>
              <div style={{ fontFamily:f.sans, fontSize:13, fontWeight:600, color:"#8a6000", marginBottom:4 }}>
                💡 Price tip
              </div>
              <div style={{ fontFamily:f.sans, fontSize:13, color:"#8a6000" }}>
                Choose {sorted[0] && vmap[sorted[0].vid]?.name} to save{" "}
                <strong>{kes(group.maxPrice - group.minPrice)}</strong> per {group.unit}.
              </div>
            </div>
          )}
        </div>

        {/* Right — vendor comparison + add to cart */}
        <div>
          <div style={{ fontFamily:f.sans, fontSize:15, fontWeight:600, color:C.text, marginBottom:12 }}>
            Choose a vendor ({group.vendors})
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
            {sorted.map((l, i) => {
              const v = vmap[l.vid];
              const isBest = i === 0;
              const isChosen = chosen.id === l.id;
              return (
                <div key={l.id} onClick={() => setChosen(l)}
                  style={{ borderRadius:12, border:`2px solid ${isChosen ? C.primary : C.border}`,
                    padding:"14px 16px", cursor:"pointer", transition:"all .15s",
                    background: isChosen ? C.primaryLt : C.card }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ fontFamily:f.sans, fontSize:14, fontWeight:600, color:C.text }}>
                          {v?.name}
                        </span>
                        {isBest && <Badge color="green">Best price</Badge>}
                      </div>
                      <div style={{ fontFamily:f.sans, fontSize:12, color:C.muted }}>
                        📍 {v?.loc} · ⭐ {v?.rating} · 🛵 {v?.time}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:f.mono, fontSize:20, fontWeight:700,
                        color: isBest ? C.primary : C.text }}>
                        {kes(l.price)}
                      </div>
                      <div style={{ fontFamily:f.sans, fontSize:11, color:C.muted }}>per {l.unit}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quantity + Add to cart */}
          <div style={{ background:C.bg, borderRadius:12, padding:20 }}>
            <div style={{ fontFamily:f.sans, fontSize:14, fontWeight:600, color:C.text, marginBottom:12 }}>
              Order details
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <span style={{ fontFamily:f.sans, fontSize:14, color:C.muted }}>Quantity:</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))}
                  style={{ width:32, height:32, borderRadius:8, border:`1px solid ${C.border}`,
                    background:C.card, fontFamily:f.sans, fontSize:18, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                <span style={{ fontFamily:f.mono, fontSize:16, fontWeight:600,
                  minWidth:28, textAlign:"center" }}>{qty}</span>
                <button onClick={() => setQty(q => q + 1)}
                  style={{ width:32, height:32, borderRadius:8, border:`1px solid ${C.border}`,
                    background:C.card, fontFamily:f.sans, fontSize:18, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                <span style={{ fontFamily:f.sans, fontSize:13, color:C.muted }}>{group.unit}</span>
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"space-between",
              fontFamily:f.sans, fontSize:14, marginBottom:4 }}>
              <span style={{ color:C.muted }}>Subtotal</span>
              <span style={{ fontFamily:f.mono, fontWeight:600 }}>{kes(chosen.price * qty)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between",
              fontFamily:f.sans, fontSize:14, marginBottom:16 }}>
              <span style={{ color:C.muted }}>Delivery fee</span>
              <span style={{ fontFamily:f.mono, fontWeight:600 }}>{kes(DELIVERY_FEE)}</span>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginBottom:16,
              display:"flex", justifyContent:"space-between", fontFamily:f.sans }}>
              <span style={{ fontWeight:600 }}>Total</span>
              <span style={{ fontFamily:f.mono, fontWeight:700, fontSize:18, color:C.primary }}>
                {kes(chosen.price * qty + DELIVERY_FEE)}
              </span>
            </div>

            <Btn onClick={handleAdd} style={{ width:"100%", justifyContent:"center" }}>
              {added ? "✅ Added to cart!" : "🛒 Add to Cart"}
            </Btn>

            <div style={{ margin:"10px 0", textAlign:"center",
              fontFamily:f.sans, fontSize:12, color:C.muted }}>or</div>

            <Btn variant="wa"
              onClick={() => window.open(`https://wa.me/254700000000?text=Hi, I want to order ${qty} ${group.unit} of ${group.name} from ${vendor?.name}`, "_blank")}
              style={{ width:"100%", justifyContent:"center" }}>
              📱 Order via WhatsApp
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cart ──────────────────────────────────────────────────────────────────────
function CartPage({ cart, onUpdateQty, onRemove, onCheckout, onContinue }) {
  if (cart.length === 0) {
    return (
      <div style={{ maxWidth:600, margin:"80px auto", textAlign:"center", padding:"0 24px" }}>
        <div style={{ fontSize:80, marginBottom:16 }}>🛒</div>
        <h2 style={{ fontFamily:f.sans, fontSize:22, fontWeight:700, color:C.text, margin:"0 0 8px" }}>
          Your cart is empty
        </h2>
        <p style={{ fontFamily:f.sans, color:C.muted, marginBottom:28 }}>
          Search for products to start shopping.
        </p>
        <Btn onClick={onContinue}>Browse products</Btn>
      </div>
    );
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = subtotal + DELIVERY_FEE;

  return (
    <div style={{ maxWidth:800, margin:"0 auto", padding:"32px 24px" }}>
      <h1 style={{ fontFamily:f.sans, fontSize:22, fontWeight:700, color:C.text, marginBottom:24 }}>
        🛒 Your Cart ({cart.length} item{cart.length !== 1 ? "s" : ""})
      </h1>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:24, alignItems:"start" }}>
        {/* Items */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {cart.map(item => (
            <div key={item.id + item.vid} style={{ background:C.card, borderRadius:12,
              border:`1px solid ${C.border}`, padding:"16px 20px",
              display:"flex", alignItems:"center", gap:16 }}>
              <div style={{ fontSize:36, width:56, height:56, borderRadius:10,
                background:C.bg, display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0 }}>{item.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:f.sans, fontWeight:600, fontSize:15, color:C.text }}>
                  {item.name}
                </div>
                <div style={{ fontFamily:f.sans, fontSize:13, color:C.muted }}>
                  From {item.vendorName} · {kes(item.price)}/{item.unit}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={() => onUpdateQty(item, item.quantity - 1)}
                  style={{ width:28, height:28, borderRadius:6, border:`1px solid ${C.border}`,
                    background:C.bg, cursor:"pointer", fontSize:16,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                <span style={{ fontFamily:f.mono, fontWeight:600, minWidth:24, textAlign:"center" }}>
                  {item.quantity}
                </span>
                <button onClick={() => onUpdateQty(item, item.quantity + 1)}
                  style={{ width:28, height:28, borderRadius:6, border:`1px solid ${C.border}`,
                    background:C.bg, cursor:"pointer", fontSize:16,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
              </div>
              <div style={{ fontFamily:f.mono, fontWeight:700, fontSize:15, color:C.text,
                minWidth:70, textAlign:"right" }}>
                {kes(item.price * item.quantity)}
              </div>
              <button onClick={() => onRemove(item)} style={{ background:"none", border:"none",
                cursor:"pointer", color:C.muted, fontSize:18, padding:4 }}>✕</button>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:20 }}>
          <div style={{ fontFamily:f.sans, fontWeight:700, fontSize:16, color:C.text, marginBottom:16 }}>
            Order Summary
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
            {[["Subtotal", kes(subtotal)], ["Delivery fee", kes(DELIVERY_FEE)]].map(([l, v]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between",
                fontFamily:f.sans, fontSize:14, color:C.muted }}>
                <span>{l}</span><span style={{ fontFamily:f.mono, color:C.text }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginBottom:20,
            display:"flex", justifyContent:"space-between", fontFamily:f.sans }}>
            <span style={{ fontWeight:700, fontSize:15 }}>Total</span>
            <span style={{ fontFamily:f.mono, fontWeight:700, fontSize:20, color:C.primary }}>
              {kes(total)}
            </span>
          </div>
          <Btn onClick={onCheckout} style={{ width:"100%", justifyContent:"center", fontSize:15 }}>
            Proceed to Checkout →
          </Btn>
          <div style={{ marginTop:12, fontFamily:f.sans, fontSize:12, color:C.muted, textAlign:"center" }}>
            💳 Pay via M-Pesa · 🛵 Boda delivery
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Checkout ──────────────────────────────────────────────────────────────────
function CheckoutPage({ cart, onPlaceOrder, onBack }) {
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState({});

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total    = subtotal + DELIVERY_FEE;

  const validate = () => {
    const e = {};
    if (!name.trim())    e.name    = "Please enter your name";
    if (!address.trim()) e.address = "Please enter your delivery address";
    if (!/^(07|01|254)\d{7,9}$/.test(phone.replace(/\s/g,"")))
      e.phone = "Enter a valid M-Pesa number (e.g. 0712345678)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => { if (validate()) onPlaceOrder({ name, address, phone, total }); };

  return (
    <div style={{ maxWidth:820, margin:"0 auto", padding:"32px 24px" }}>
      <button onClick={onBack} style={{ fontFamily:f.sans, fontSize:14, color:C.muted,
        background:"none", border:"none", cursor:"pointer", marginBottom:24,
        display:"flex", alignItems:"center", gap:6 }}>← Back to cart</button>

      <h1 style={{ fontFamily:f.sans, fontSize:22, fontWeight:700, color:C.text, marginBottom:28 }}>
        Checkout
      </h1>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:28, alignItems:"start" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {/* Personal details */}
          <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24 }}>
            <div style={{ fontFamily:f.sans, fontWeight:700, fontSize:15, color:C.text, marginBottom:18 }}>
              📋 Your Details
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <Input label="Full name" value={name} onChange={setName} placeholder="e.g. James Mwangi" />
                {errors.name && <div style={{ fontFamily:f.sans, fontSize:12, color:C.danger, marginTop:4 }}>{errors.name}</div>}
              </div>
              <div>
                <Input label="M-Pesa phone number" value={phone} onChange={setPhone}
                  placeholder="0712 345 678" prefix="📱" />
                <div style={{ fontFamily:f.sans, fontSize:12, color:C.muted, marginTop:4 }}>
                  Payment prompt will be sent to this number
                </div>
                {errors.phone && <div style={{ fontFamily:f.sans, fontSize:12, color:C.danger, marginTop:4 }}>{errors.phone}</div>}
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24 }}>
            <div style={{ fontFamily:f.sans, fontWeight:700, fontSize:15, color:C.text, marginBottom:18 }}>
              📍 Delivery Address
            </div>
            <div>
              <Input label="Full address" value={address} onChange={setAddress}
                placeholder="e.g. Westlands, near Chandarana, Gate 4" />
              {errors.address && <div style={{ fontFamily:f.sans, fontSize:12, color:C.danger, marginTop:4 }}>{errors.address}</div>}
            </div>
            <div style={{ marginTop:14, background:C.bg, borderRadius:10, padding:"12px 14px",
              fontFamily:f.sans, fontSize:13, color:C.muted }}>
              🛵 Estimated delivery: <strong style={{ color:C.text }}>30–60 minutes</strong> after payment
            </div>
          </div>
        </div>

        {/* Summary */}
        <div>
          <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:20,
            position:"sticky", top:80 }}>
            <div style={{ fontFamily:f.sans, fontWeight:700, fontSize:15, color:C.text, marginBottom:16 }}>
              Your Order
            </div>
            {cart.map(i => (
              <div key={i.id + i.vid} style={{ display:"flex", justifyContent:"space-between",
                fontFamily:f.sans, fontSize:13, marginBottom:8, gap:8 }}>
                <span style={{ color:C.muted }}>
                  {i.emoji} {i.name} ×{i.quantity}
                </span>
                <span style={{ fontFamily:f.mono, fontWeight:500 }}>{kes(i.price * i.quantity)}</span>
              </div>
            ))}
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginTop:12 }}>
              {[["Subtotal", kes(subtotal)], ["Delivery", kes(DELIVERY_FEE)]].map(([l, v]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between",
                  fontFamily:f.sans, fontSize:13, color:C.muted, marginBottom:8 }}>
                  <span>{l}</span><span style={{ fontFamily:f.mono }}>{v}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:f.sans,
                fontWeight:700, fontSize:16, marginTop:8, paddingTop:8,
                borderTop:`1px solid ${C.border}` }}>
                <span>Total</span>
                <span style={{ fontFamily:f.mono, color:C.primary }}>{kes(total)}</span>
              </div>
            </div>
            <Btn onClick={submit} style={{ width:"100%", justifyContent:"center", marginTop:18, fontSize:15 }}>
              💳 Pay {kes(total)} via M-Pesa
            </Btn>
            <div style={{ fontFamily:f.sans, fontSize:11, color:C.muted, textAlign:"center", marginTop:10 }}>
              Secure payment via Safaricom M-Pesa
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── M-Pesa Screen ─────────────────────────────────────────────────────────────
function MpesaPage({ orderDetails, onConfirmed }) {
  const [step, setStep] = useState(0);
  // 0 = sending prompt, 1 = awaiting PIN, 2 = confirming, 3 = success

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1800);
    const t2 = setTimeout(() => setStep(2), 5000);
    const t3 = setTimeout(() => { setStep(3); setTimeout(onConfirmed, 2500); }, 7000);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  const steps = [
    { label:"Sending STK push to " + orderDetails.phone, icon:"📡" },
    { label:"Check your phone and enter M-Pesa PIN…", icon:"📱" },
    { label:"Confirming payment…", icon:"🔄" },
    { label:"Payment confirmed! Receipt: QKE7A2X4", icon:"✅" },
  ];

  return (
    <div style={{ maxWidth:480, margin:"60px auto", padding:"0 24px", textAlign:"center" }}>
      <div style={{ background:C.card, borderRadius:20, border:`1px solid ${C.border}`,
        padding:"48px 32px", boxShadow:"0 8px 40px rgba(0,0,0,.08)" }}>

        {/* Safaricom-style STK prompt */}
        <div style={{ width:80, height:80, borderRadius:20, background: step === 3 ? "#dcfce7" : C.primaryLt,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:40, margin:"0 auto 24px", transition:"background .4s" }}>
          {steps[step]?.icon}
        </div>

        <h2 style={{ fontFamily:f.sans, fontSize:20, fontWeight:700, color:C.text, margin:"0 0 8px" }}>
          {step < 3 ? "M-Pesa Payment" : "Payment Confirmed!"}
        </h2>
        <div style={{ fontFamily:f.mono, fontSize:28, fontWeight:700, color:C.primary, margin:"8px 0 20px" }}>
          {kes(orderDetails.total)}
        </div>

        {/* Step indicator */}
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28, textAlign:"left" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
              opacity: i > step ? 0.3 : 1, transition:"opacity .3s" }}>
              <div style={{ width:24, height:24, borderRadius:999, flexShrink:0,
                background: i < step ? C.primary : i === step ? C.accent : C.border,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:11, color:"#fff", fontWeight:700, transition:"background .3s" }}>
                {i < step ? "✓" : i + 1}
              </div>
              <span style={{ fontFamily:f.sans, fontSize:14,
                color: i === step ? C.text : C.muted,
                fontWeight: i === step ? 600 : 400 }}>
                {s.label}
              </span>
              {i === step && i < 3 && (
                <span style={{ marginLeft:"auto", width:16, height:16, borderRadius:999,
                  border:`2px solid ${C.accent}`, borderTopColor:"transparent",
                  animation:"spin 1s linear infinite", flexShrink:0 }} />
              )}
            </div>
          ))}
        </div>

        {step < 3 ? (
          <div style={{ fontFamily:f.sans, fontSize:13, color:C.muted }}>
            Do not close this screen. Your payment is being processed.
          </div>
        ) : (
          <div style={{ fontFamily:f.sans, fontSize:14, color:"#166534",
            background:"#dcfce7", borderRadius:10, padding:"12px 16px" }}>
            ✅ <strong>KES {orderDetails.total.toLocaleString()}</strong> paid successfully.
            Rider is being assigned…
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
    </div>
  );
}

// ── Confirmation ──────────────────────────────────────────────────────────────
function ConfirmationPage({ orderDetails, cart, onHome }) {
  const orderId = "WBZ" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const rider   = VENDORS[4]; // TechHub stands in as rider info
  const riderInfo = { name:"John Kamau", bike:"KMCA 001K", phone:"254700000010" };

  return (
    <div style={{ maxWidth:580, margin:"40px auto", padding:"0 24px", textAlign:"center" }}>
      <div style={{ fontSize:72, marginBottom:16 }}>🎉</div>
      <h1 style={{ fontFamily:f.sans, fontSize:26, fontWeight:700, color:C.text, margin:"0 0 8px" }}>
        Order Confirmed!
      </h1>
      <p style={{ fontFamily:f.sans, color:C.muted, marginBottom:32 }}>
        Your boda rider is on the way. Track updates on WhatsApp.
      </p>

      {/* Receipt card */}
      <div style={{ background:C.card, borderRadius:16, border:`1px solid ${C.border}`,
        padding:28, textAlign:"left", marginBottom:20 }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:20, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
          <div>
            <div style={{ fontFamily:f.sans, fontSize:12, color:C.muted, marginBottom:2 }}>Order ID</div>
            <div style={{ fontFamily:f.mono, fontWeight:700, fontSize:18, color:C.primary }}>{orderId}</div>
          </div>
          <Badge color="green">Paid ✓</Badge>
        </div>

        <div style={{ fontFamily:f.sans, fontSize:14, fontWeight:600, color:C.text, marginBottom:10 }}>
          Items ordered
        </div>
        {cart.map(i => (
          <div key={i.id} style={{ display:"flex", justifyContent:"space-between",
            fontFamily:f.sans, fontSize:14, marginBottom:8, color:C.muted }}>
            <span>{i.emoji} {i.name} ×{i.quantity}</span>
            <span style={{ fontFamily:f.mono, color:C.text }}>{kes(i.price * i.quantity)}</span>
          </div>
        ))}
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginTop:8,
          display:"flex", justifyContent:"space-between", fontFamily:f.sans }}>
          <span style={{ fontWeight:700 }}>Total paid</span>
          <span style={{ fontFamily:f.mono, fontWeight:700, color:C.primary }}>
            {kes(orderDetails.total)}
          </span>
        </div>

        <div style={{ marginTop:20, paddingTop:20, borderTop:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:f.sans, fontSize:14, fontWeight:600, color:C.text, marginBottom:10 }}>
            🛵 Your Rider
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:999, background:C.primaryLt,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>🧑</div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:f.sans, fontWeight:600, fontSize:15 }}>{riderInfo.name}</div>
              <div style={{ fontFamily:f.sans, fontSize:13, color:C.muted }}>
                🛵 {riderInfo.bike} · ⭐ 4.9 · 47 deliveries
              </div>
            </div>
            <a href={`tel:+${riderInfo.phone}`} style={{ textDecoration:"none" }}>
              <Btn variant="outline" style={{ padding:"8px 14px", fontSize:13 }}>📞 Call</Btn>
            </a>
          </div>
          <div style={{ marginTop:12, background:"#f0fdf4", borderRadius:10, padding:"10px 14px",
            fontFamily:f.sans, fontSize:13, color:"#166534" }}>
            🛵 Rider picking up from vendor. Delivering to: <strong>{orderDetails.address}</strong>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <Btn variant="wa" style={{ justifyContent:"center" }}
          onClick={() => window.open(`https://wa.me/${riderInfo.phone}?text=Hi John, I have order ${orderId}, please confirm you are on the way.`, "_blank")}>
          📱 Track order on WhatsApp
        </Btn>
        <Btn variant="ghost" onClick={onHome} style={{ justifyContent:"center" }}>
          🛒 Shop again
        </Btn>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function WeBizzleApp() {
  const [page,         setPage]        = useState("home");
  const [query,        setQuery]        = useState("");
  const [selectedGroup, setGroup]       = useState(null);
  const [cart,         setCart]         = useState([]);
  const [orderDetails, setOrderDetails] = useState(null);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleSearch = (q) => {
    setQuery(q);
    setPage("results");
  };

  const handleSelectGroup = (group) => {
    setGroup(group);
    setPage("product");
  };

  const handleAddToCart = (listing) => {
    setCart(prev => {
      const key = listing.id + listing.vid;
      const exists = prev.find(i => i.id + i.vid === key);
      if (exists) {
        return prev.map(i => i.id + i.vid === key
          ? { ...i, quantity: i.quantity + listing.quantity }
          : i);
      }
      return [...prev, { ...listing }];
    });
  };

  const handleUpdateQty = (item, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.id + i.vid !== item.id + item.vid));
    } else {
      setCart(prev => prev.map(i => i.id + i.vid === item.id + item.vid ? { ...i, quantity: qty } : i));
    }
  };

  const handleRemove = (item) => {
    setCart(prev => prev.filter(i => i.id + i.vid !== item.id + item.vid));
  };

  const handlePlaceOrder = (details) => {
    setOrderDetails(details);
    setPage("mpesa");
  };

  const handlePaymentConfirmed = () => {
    setPage("confirmation");
  };

  const handleHome = () => {
    setCart([]);
    setOrderDetails(null);
    setPage("home");
  };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:f.sans }}>
      {/* Navbar shown on all pages except payment screens */}
      {!["mpesa","confirmation"].includes(page) && (
        <Navbar
          page={page} setPage={setPage} cartCount={cartCount}
          query={query} setQuery={setQuery} onSearch={handleSearch}
        />
      )}

      {page === "home" && (
        <HomePage onSearch={handleSearch} setPage={setPage} />
      )}

      {page === "results" && (
        <ResultsPage query={query} onSelect={handleSelectGroup} onSearch={handleSearch} />
      )}

      {page === "product" && selectedGroup && (
        <ProductPage
          group={selectedGroup}
          onAddToCart={handleAddToCart}
          onBack={() => setPage("results")}
        />
      )}

      {page === "cart" && (
        <CartPage
          cart={cart}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          onCheckout={() => setPage("checkout")}
          onContinue={() => setPage("home")}
        />
      )}

      {page === "checkout" && (
        <CheckoutPage
          cart={cart}
          onPlaceOrder={handlePlaceOrder}
          onBack={() => setPage("cart")}
        />
      )}

      {page === "mpesa" && orderDetails && (
        <MpesaPage orderDetails={orderDetails} onConfirmed={handlePaymentConfirmed} />
      )}

      {page === "confirmation" && orderDetails && (
        <ConfirmationPage orderDetails={orderDetails} cart={cart} onHome={handleHome} />
      )}

      {/* Footer */}
      {!["mpesa","confirmation","checkout"].includes(page) && (
        <footer style={{ borderTop:`1px solid ${C.border}`, background:C.card,
          padding:"28px 24px", marginTop:60 }}>
          <div style={{ maxWidth:1100, margin:"0 auto", display:"flex",
            justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>🛒</span>
              <span style={{ fontFamily:f.sans, fontWeight:700, color:C.primary }}>WeBizzle!</span>
              <span style={{ fontFamily:f.sans, fontSize:13, color:C.muted }}>
                · Nairobi's price comparison marketplace
              </span>
            </div>
            <div style={{ display:"flex", gap:20 }}>
              {["Vendors","Riders","Support"].map(l => (
                <a key={l} href="#" style={{ fontFamily:f.sans, fontSize:13,
                  color:C.muted, textDecoration:"none" }}>{l}</a>
              ))}
            </div>
            <div style={{ fontFamily:f.sans, fontSize:12, color:C.muted }}>
              Pay via 💳 M-Pesa · Delivered by 🛵 Boda
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
