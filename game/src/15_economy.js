// Economy & jobs (spec: "economy must emerge from simulation"): delivery work
// between real dossiers, pay by distance & trade type, persistent wallet.
"use strict";
(function () {
  const G = window.G;
  const E = G.ECON = {
    money: G.store.get("money", 0),
    deliveries: G.store.get("deliveries", 0),
    offers: [], active: null, offerT: 0
  };

  const TRADES = [
    { k: "fish", label: "🐟 Fish crate run", from: ["beach", "island", "water", "locality"], pay: 1.3 },
    { k: "dabba", label: "🍱 Dabba delivery", from: ["locality", "campus", "rail"], pay: 1.0 },
    { k: "market", label: "🧺 Market produce load", from: ["market", "locality"], pay: 1.2 },
    { k: "container", label: "🚢 JNPT container papers", from: ["port", "industry"], pay: 2.0 },
    { k: "parcel", label: "📦 Station parcel", from: ["rail", "locality"], pay: 0.9 },
    { k: "pilgrim", label: "🙏 Pilgrim drop", from: ["temple", "fort"], pay: 1.1 },
    { k: "mango", label: "🥭 Alphonso season consignment", from: ["locality", "market", "nature"], pay: 1.5 }
  ];

  function mkOffer() {
    const near = G.POI.nearby(G.PL.x, G.PL.y, 3000);
    if (!near.length) return null;
    const origin = near[Math.floor(Math.random() * Math.min(4, near.length))];
    const trade = TRADES.filter(t => t.from.includes(origin.cat));
    const tr = trade.length ? trade[Math.floor(Math.random() * trade.length)]
                            : TRADES[Math.floor(Math.random() * TRADES.length)];
    // destination 1.5–18 km away
    const cands = G.POI.all.filter(p => {
      const d = G.dist(origin.x, origin.y, p.x, p.y);
      return d > 1500 && d < 18000;
    });
    if (!cands.length) return null;
    const dest = cands[Math.floor(Math.random() * cands.length)];
    const dist = G.dist(origin.x, origin.y, dest.x, dest.y);
    const pay = Math.round((60 + dist * 0.012) * tr.pay);
    return { id: Math.random().toString(36).slice(2), tr, origin, dest, dist, pay };
  }

  E.refresh = function () {
    while (E.offers.length < 3) {
      const o = mkOffer();
      if (!o) break;
      E.offers.push(o);
    }
    G.emit("econ");
  };

  E.accept = function (id) {
    const o = E.offers.find(x => x.id === id);
    if (!o || E.active) return;
    E.active = o;
    E.offers = E.offers.filter(x => x.id !== id);
    G.WAYPOINT.set(o.dest.x, o.dest.y, o.dest.name + " · " + o.tr.label);
    G.emit("toast", "📋 Job accepted: " + o.tr.label + " → " + o.dest.name + " (₹" + o.pay + ")");
    G.emit("econ");
  };

  E.decline = function (id) { E.offers = E.offers.filter(x => x.id !== id); E.refresh(); G.emit("econ"); };

  E.update = function (dt) {
    E.offerT -= dt;
    if (E.offerT <= 0) { E.offerT = 25; if (!E.active && E.offers.length < 3) E.refresh(); }
    const o = E.active;
    if (!o) return;
    const d = G.dist(G.PL.x, G.PL.y, o.dest.x, o.dest.y);
    if (d < 220) {
      E.money += o.pay;
      E.deliveries++;
      G.store.set("money", E.money);
      G.store.set("deliveries", E.deliveries);
      G.emit("toast", "✅ Delivered at " + o.dest.name + " — earned ₹" + o.pay + " (total ₹" + E.money + ")");
      E.active = null;
      G.WAYPOINT.clear();
      E.refresh();
      G.emit("econ");
    }
  };

  E.hud = function () {
    const el = document.getElementById("moneyBox");
    if (el) el.textContent = "₹" + E.money + (E.active ? " · 📋 en route" : "");
  };
})();
