/**
 * AuraFocus v2 - Pixel Companion Ecology (4 mascots x 6 stages),
 * 16 Themed Pixel Collectibles, and Retro Thermal Receipt Generator (Text, Markdown, PNG Canvas).
 */

const MASCOT_NAMES = { fire: '篝火', cat: '猫猫', coffee: '咖啡', sprout: '树苗' };

const THEME_MILESTONES = {
  atomic: { minutes: 120, label: '经典透明紫' },
  famicom: { minutes: 300, label: '复古掌机红' }
};

function _svg16(body, size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;
}

// 4 Pixel Companions x 6 Expressive Stages (idle, start, flow, complete, nudge, break)
const MascotStages = {
  fire: {
    idle: _svg16(`
      <rect x="2" y="13" width="12" height="2" fill="#78350f"/>
      <rect x="4" y="12" width="8" height="1" fill="#92400e"/>
      <rect x="6" y="4" width="4" height="2" fill="#ef4444"/>
      <rect x="5" y="6" width="6" height="2" fill="#ef4444"/>
      <rect x="4" y="8" width="8" height="3" fill="#f97316"/>
      <rect x="3" y="10" width="10" height="2" fill="#f97316"/>
      <rect x="7" y="7" width="2" height="2" fill="#fde047"/>
      <rect x="6" y="9" width="4" height="2" fill="#fde047"/>
      <rect x="7" y="10" width="2" height="1" fill="#ffffff"/>
    `),
    start: _svg16(`
      <rect x="2" y="13" width="12" height="2" fill="#78350f"/>
      <rect x="4" y="12" width="8" height="1" fill="#92400e"/>
      <rect x="7" y="3" width="1" height="1" fill="#fde047"/>
      <rect x="9" y="5" width="1" height="1" fill="#f97316"/>
      <rect x="6" y="7" width="4" height="2" fill="#ef4444"/>
      <rect x="5" y="9" width="6" height="3" fill="#f97316"/>
      <rect x="7" y="9" width="2" height="2" fill="#fde047"/>
    `),
    flow: _svg16(`
      <rect x="2" y="13" width="12" height="2" fill="#78350f"/>
      <rect x="3" y="12" width="10" height="1" fill="#92400e"/>
      <rect x="7" y="1" width="2" height="2" fill="#ef4444"/>
      <rect x="5" y="3" width="6" height="2" fill="#ef4444"/>
      <rect x="4" y="5" width="8" height="3" fill="#f97316"/>
      <rect x="3" y="8" width="10" height="4" fill="#f97316"/>
      <rect x="6" y="5" width="4" height="3" fill="#fde047"/>
      <rect x="5" y="8" width="6" height="3" fill="#fde047"/>
      <rect x="7" y="8" width="2" height="3" fill="#ffffff"/>
      <rect x="2" y="4" width="1" height="1" fill="#fde047"/>
      <rect x="13" y="3" width="1" height="1" fill="#fde047"/>
    `),
    complete: _svg16(`
      <rect x="2" y="13" width="12" height="2" fill="#78350f"/>
      <rect x="3" y="12" width="10" height="1" fill="#92400e"/>
      <rect x="7" y="1" width="2" height="2" fill="#fde047"/>
      <rect x="2" y="2" width="2" height="1" fill="#fde047"/>
      <rect x="12" y="2" width="2" height="1" fill="#fde047"/>
      <rect x="5" y="3" width="6" height="3" fill="#ef4444"/>
      <rect x="4" y="6" width="8" height="6" fill="#f97316"/>
      <rect x="6" y="6" width="4" height="5" fill="#fde047"/>
      <rect x="7" y="8" width="2" height="3" fill="#ffffff"/>
    `),
    nudge: _svg16(`
      <rect x="2" y="13" width="12" height="2" fill="#78350f"/>
      <rect x="4" y="12" width="8" height="1" fill="#92400e"/>
      <rect x="5" y="4" width="6" height="3" fill="#ef4444"/>
      <rect x="4" y="7" width="8" height="5" fill="#f97316"/>
      <rect x="5" y="8" width="2" height="2" fill="#ffffff"/>
      <rect x="9" y="8" width="2" height="2" fill="#ffffff"/>
      <rect x="6" y="8" width="1" height="2" fill="#0f172a"/>
      <rect x="10" y="8" width="1" height="2" fill="#0f172a"/>
      <rect x="12" y="2" width="2" height="3" fill="#ef4444"/>
      <rect x="12" y="6" width="2" height="1" fill="#ef4444"/>
    `),
    break: _svg16(`
      <rect x="2" y="13" width="12" height="2" fill="#78350f"/>
      <rect x="4" y="11" width="8" height="2" fill="#c2410c"/>
      <rect x="5" y="10" width="6" height="2" fill="#f97316"/>
      <rect x="7" y="11" width="2" height="1" fill="#fde047"/>
      <rect x="7" y="6" width="1" height="2" fill="#94a3b8"/>
      <rect x="8" y="4" width="1" height="2" fill="#cbd5e1"/>
      <rect x="6" y="7" width="1" height="1" fill="#94a3b8"/>
    `)
  },
  cat: {
    idle: _svg16(`
      <rect x="3" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="11" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="4" y="3" width="1" height="1" fill="#fbcfe8"/>
      <rect x="11" y="3" width="1" height="1" fill="#fbcfe8"/>
      <rect x="4" y="4" width="8" height="1" fill="#f59e0b"/>
      <rect x="3" y="5" width="10" height="6" fill="#f59e0b"/>
      <rect x="5" y="7" width="2" height="2" fill="#0f172a"/>
      <rect x="9" y="7" width="2" height="2" fill="#0f172a"/>
      <rect x="7" y="9" width="2" height="1" fill="#ec4899"/>
      <rect x="1" y="8" width="2" height="1" fill="#cbd5e1"/>
      <rect x="13" y="8" width="2" height="1" fill="#cbd5e1"/>
      <rect x="4" y="11" width="8" height="3" fill="#d97706"/>
      <rect x="5" y="14" width="2" height="1" fill="#fef3c7"/>
      <rect x="9" y="14" width="2" height="1" fill="#fef3c7"/>
    `),
    start: _svg16(`
      <rect x="3" y="1" width="2" height="4" fill="#f59e0b"/>
      <rect x="11" y="1" width="2" height="4" fill="#f59e0b"/>
      <rect x="4" y="2" width="1" height="2" fill="#fbcfe8"/>
      <rect x="11" y="2" width="1" height="2" fill="#fbcfe8"/>
      <rect x="3" y="5" width="10" height="6" fill="#f59e0b"/>
      <rect x="5" y="6" width="2" height="2" fill="#0f172a"/>
      <rect x="9" y="6" width="2" height="2" fill="#0f172a"/>
      <rect x="5" y="6" width="1" height="1" fill="#ffffff"/>
      <rect x="9" y="6" width="1" height="1" fill="#ffffff"/>
      <rect x="7" y="9" width="2" height="1" fill="#ec4899"/>
      <rect x="4" y="11" width="8" height="3" fill="#d97706"/>
      <rect x="5" y="14" width="2" height="1" fill="#fef3c7"/>
      <rect x="9" y="14" width="2" height="1" fill="#fef3c7"/>
    `),
    flow: _svg16(`
      <rect x="3" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="11" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="3" y="5" width="10" height="6" fill="#f59e0b"/>
      <rect x="4" y="6" width="3" height="3" fill="#334155"/>
      <rect x="9" y="6" width="3" height="3" fill="#334155"/>
      <rect x="7" y="7" width="2" height="1" fill="#334155"/>
      <rect x="5" y="7" width="1" height="1" fill="#93c5fd"/>
      <rect x="10" y="7" width="1" height="1" fill="#93c5fd"/>
      <rect x="7" y="9" width="2" height="1" fill="#ec4899"/>
      <rect x="3" y="11" width="10" height="3" fill="#d97706"/>
      <rect x="4" y="13" width="8" height="2" fill="#e2e8f0"/>
      <rect x="7" y="13" width="2" height="2" fill="#94a3b8"/>
    `),
    complete: _svg16(`
      <rect x="3" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="11" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="3" y="5" width="10" height="6" fill="#f59e0b"/>
      <rect x="5" y="7" width="2" height="1" fill="#0f172a"/>
      <rect x="9" y="7" width="2" height="1" fill="#0f172a"/>
      <rect x="4" y="8" width="1" height="1" fill="#fb7185"/>
      <rect x="11" y="8" width="1" height="1" fill="#fb7185"/>
      <rect x="7" y="9" width="2" height="1" fill="#ec4899"/>
      <rect x="2" y="10" width="2" height="2" fill="#fef3c7"/>
      <rect x="12" y="10" width="2" height="2" fill="#fef3c7"/>
      <rect x="4" y="11" width="8" height="4" fill="#d97706"/>
      <rect x="7" y="1" width="2" height="2" fill="#fde047"/>
    `),
    nudge: _svg16(`
      <rect x="3" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="11" y="2" width="2" height="3" fill="#f59e0b"/>
      <rect x="3" y="5" width="10" height="6" fill="#f59e0b"/>
      <rect x="4" y="6" width="3" height="2" fill="#ffffff"/>
      <rect x="9" y="6" width="3" height="2" fill="#ffffff"/>
      <rect x="6" y="7" width="1" height="1" fill="#0f172a"/>
      <rect x="11" y="7" width="1" height="1" fill="#0f172a"/>
      <rect x="7" y="9" width="2" height="1" fill="#0f172a"/>
      <rect x="4" y="11" width="8" height="3" fill="#d97706"/>
      <rect x="13" y="1" width="2" height="3" fill="#ef4444"/>
      <rect x="13" y="5" width="2" height="1" fill="#ef4444"/>
    `),
    break: _svg16(`
      <rect x="11" y="2" width="3" height="1" fill="#94a3b8"/>
      <rect x="12" y="3" width="1" height="1" fill="#94a3b8"/>
      <rect x="11" y="4" width="3" height="1" fill="#94a3b8"/>
      <rect x="3" y="6" width="2" height="2" fill="#f59e0b"/>
      <rect x="9" y="6" width="2" height="2" fill="#f59e0b"/>
      <rect x="2" y="8" width="11" height="6" fill="#f59e0b"/>
      <rect x="4" y="10" width="2" height="1" fill="#0f172a"/>
      <rect x="8" y="10" width="2" height="1" fill="#0f172a"/>
      <rect x="6" y="11" width="2" height="1" fill="#ec4899"/>
      <rect x="11" y="12" width="3" height="2" fill="#d97706"/>
    `)
  },
  coffee: {
    idle: _svg16(`
      <rect x="5" y="1" width="1" height="2" fill="#94a3b8"/>
      <rect x="6" y="2" width="1" height="2" fill="#cbd5e1"/>
      <rect x="9" y="1" width="1" height="2" fill="#94a3b8"/>
      <rect x="10" y="2" width="1" height="2" fill="#cbd5e1"/>
      <rect x="3" y="5" width="8" height="8" fill="#3b82f6"/>
      <rect x="4" y="6" width="6" height="6" fill="#1e293b"/>
      <rect x="4" y="7" width="6" height="2" fill="#78350f"/>
      <rect x="11" y="7" width="2" height="1" fill="#3b82f6"/>
      <rect x="12" y="8" width="1" height="2" fill="#3b82f6"/>
      <rect x="11" y="10" width="2" height="1" fill="#3b82f6"/>
      <rect x="2" y="13" width="10" height="1" fill="#64748b"/>
    `),
    start: _svg16(`
      <rect x="6" y="1" width="2" height="5" fill="#92400e"/>
      <rect x="3" y="6" width="8" height="7" fill="#3b82f6"/>
      <rect x="4" y="7" width="6" height="5" fill="#1e293b"/>
      <rect x="4" y="10" width="6" height="2" fill="#78350f"/>
      <rect x="11" y="8" width="2" height="3" fill="#3b82f6"/>
      <rect x="2" y="13" width="10" height="1" fill="#64748b"/>
    `),
    flow: _svg16(`
      <rect x="5" y="1" width="1" height="3" fill="#e2e8f0"/>
      <rect x="7" y="1" width="1" height="4" fill="#cbd5e1"/>
      <rect x="9" y="1" width="1" height="3" fill="#e2e8f0"/>
      <rect x="3" y="5" width="8" height="8" fill="#2563eb"/>
      <rect x="4" y="6" width="6" height="6" fill="#78350f"/>
      <rect x="4" y="6" width="6" height="2" fill="#d97706"/>
      <rect x="11" y="7" width="2" height="1" fill="#2563eb"/>
      <rect x="12" y="8" width="1" height="2" fill="#2563eb"/>
      <rect x="11" y="10" width="2" height="1" fill="#2563eb"/>
      <rect x="2" y="13" width="10" height="1" fill="#64748b"/>
    `),
    complete: _svg16(`
      <rect x="2" y="2" width="1" height="1" fill="#fde047"/>
      <rect x="12" y="2" width="1" height="1" fill="#fde047"/>
      <rect x="3" y="5" width="8" height="8" fill="#2563eb"/>
      <rect x="4" y="6" width="6" height="6" fill="#fef3c7"/>
      <rect x="5" y="8" width="1" height="1" fill="#ef4444"/>
      <rect x="8" y="8" width="1" height="1" fill="#ef4444"/>
      <rect x="6" y="9" width="2" height="1" fill="#ef4444"/>
      <rect x="11" y="7" width="2" height="1" fill="#2563eb"/>
      <rect x="12" y="8" width="1" height="2" fill="#2563eb"/>
      <rect x="11" y="10" width="2" height="1" fill="#2563eb"/>
      <rect x="2" y="13" width="10" height="1" fill="#64748b"/>
    `),
    nudge: _svg16(`
      <rect x="12" y="1" width="2" height="3" fill="#ef4444"/>
      <rect x="12" y="5" width="2" height="1" fill="#ef4444"/>
      <rect x="3" y="6" width="8" height="7" fill="#3b82f6"/>
      <rect x="5" y="8" width="1" height="2" fill="#ffffff"/>
      <rect x="8" y="8" width="1" height="2" fill="#ffffff"/>
      <rect x="5" y="9" width="1" height="1" fill="#0f172a"/>
      <rect x="8" y="9" width="1" height="1" fill="#0f172a"/>
      <rect x="11" y="8" width="2" height="3" fill="#3b82f6"/>
      <rect x="2" y="13" width="10" height="1" fill="#64748b"/>
    `),
    break: _svg16(`
      <rect x="6" y="2" width="1" height="2" fill="#cbd5e1"/>
      <rect x="3" y="6" width="8" height="7" fill="#60a5fa"/>
      <rect x="4" y="7" width="6" height="5" fill="#1e293b"/>
      <rect x="4" y="10" width="6" height="2" fill="#92400e"/>
      <rect x="11" y="8" width="2" height="3" fill="#60a5fa"/>
      <rect x="2" y="13" width="10" height="1" fill="#64748b"/>
    `)
  },
  sprout: {
    idle: _svg16(`
      <rect x="4" y="4" width="2" height="2" fill="#22c55e"/>
      <rect x="5" y="3" width="2" height="2" fill="#4ade80"/>
      <rect x="9" y="3" width="3" height="2" fill="#22c55e"/>
      <rect x="10" y="4" width="2" height="2" fill="#4ade80"/>
      <rect x="7" y="5" width="2" height="5" fill="#16a34a"/>
      <rect x="4" y="10" width="8" height="1" fill="#ea580c"/>
      <rect x="5" y="11" width="6" height="3" fill="#c2410c"/>
      <rect x="6" y="14" width="4" height="1" fill="#9a3412"/>
      <rect x="6" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="9" y="12" width="1" height="1" fill="#0f172a"/>
    `),
    start: _svg16(`
      <rect x="6" y="7" width="4" height="2" fill="#4ade80"/>
      <rect x="7" y="8" width="2" height="2" fill="#16a34a"/>
      <rect x="4" y="10" width="8" height="1" fill="#ea580c"/>
      <rect x="5" y="11" width="6" height="3" fill="#c2410c"/>
      <rect x="6" y="14" width="4" height="1" fill="#9a3412"/>
      <rect x="6" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="9" y="12" width="1" height="1" fill="#0f172a"/>
    `),
    flow: _svg16(`
      <rect x="3" y="3" width="3" height="2" fill="#22c55e"/>
      <rect x="10" y="3" width="3" height="2" fill="#22c55e"/>
      <rect x="5" y="2" width="6" height="2" fill="#4ade80"/>
      <rect x="4" y="6" width="3" height="2" fill="#16a34a"/>
      <rect x="9" y="6" width="3" height="2" fill="#16a34a"/>
      <rect x="7" y="4" width="2" height="6" fill="#15803d"/>
      <rect x="4" y="10" width="8" height="1" fill="#ea580c"/>
      <rect x="5" y="11" width="6" height="3" fill="#c2410c"/>
      <rect x="6" y="14" width="4" height="1" fill="#9a3412"/>
      <rect x="6" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="9" y="12" width="1" height="1" fill="#0f172a"/>
    `),
    complete: _svg16(`
      <rect x="6" y="1" width="4" height="4" fill="#f472b6"/>
      <rect x="7" y="2" width="2" height="2" fill="#fde047"/>
      <rect x="4" y="5" width="3" height="2" fill="#4ade80"/>
      <rect x="9" y="5" width="3" height="2" fill="#4ade80"/>
      <rect x="7" y="5" width="2" height="5" fill="#16a34a"/>
      <rect x="4" y="10" width="8" height="1" fill="#ea580c"/>
      <rect x="5" y="11" width="6" height="3" fill="#c2410c"/>
      <rect x="6" y="14" width="4" height="1" fill="#9a3412"/>
      <rect x="6" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="9" y="12" width="1" height="1" fill="#0f172a"/>
    `),
    nudge: _svg16(`
      <rect x="12" y="1" width="2" height="3" fill="#ef4444"/>
      <rect x="12" y="5" width="2" height="1" fill="#ef4444"/>
      <rect x="4" y="4" width="3" height="2" fill="#22c55e"/>
      <rect x="9" y="4" width="3" height="2" fill="#22c55e"/>
      <rect x="7" y="5" width="2" height="5" fill="#16a34a"/>
      <rect x="4" y="10" width="8" height="1" fill="#ea580c"/>
      <rect x="5" y="11" width="6" height="3" fill="#c2410c"/>
      <rect x="6" y="14" width="4" height="1" fill="#9a3412"/>
      <rect x="5" y="12" width="2" height="1" fill="#ffffff"/>
      <rect x="9" y="12" width="2" height="1" fill="#ffffff"/>
      <rect x="6" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="10" y="12" width="1" height="1" fill="#0f172a"/>
    `),
    break: _svg16(`
      <rect x="4" y="5" width="3" height="2" fill="#4ade80"/>
      <rect x="9" y="4" width="3" height="2" fill="#22c55e"/>
      <rect x="7" y="6" width="2" height="4" fill="#16a34a"/>
      <rect x="4" y="10" width="8" height="1" fill="#ea580c"/>
      <rect x="5" y="11" width="6" height="3" fill="#c2410c"/>
      <rect x="6" y="14" width="4" height="1" fill="#9a3412"/>
      <rect x="6" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="9" y="12" width="1" height="1" fill="#0f172a"/>
      <rect x="7" y="13" width="2" height="1" fill="#7c2d12"/>
    `)
  }
};

// Backward-compatible map
const PixelMascots = {
  fire: MascotStages.fire.idle,
  cat: MascotStages.cat.idle,
  coffee: MascotStages.coffee.idle,
  sprout: MascotStages.sprout.idle
};

function getMascotSvg(mascotKey, stage = 'idle') {
  const family = MascotStages[mascotKey] || MascotStages.fire;
  return family[stage] || family.idle;
}

// ================= 16 THEMED PIXEL COLLECTIBLES =================
const COLLECTIBLE_CATALOG = {
  fire: [
    { key: 'fire_star', name: '营地星火', svg: _svg16('<rect x="7" y="2" width="2" height="12" fill="#fde047"/><rect x="2" y="7" width="12" height="2" fill="#fde047"/><rect x="5" y="5" width="6" height="6" fill="#f97316"/><rect x="7" y="7" width="2" height="2" fill="#ffffff"/>', 26) },
    { key: 'fire_pine', name: '琥珀松果', svg: _svg16('<rect x="6" y="3" width="4" height="2" fill="#92400e"/><rect x="5" y="5" width="6" height="4" fill="#b45309"/><rect x="6" y="9" width="4" height="3" fill="#78350f"/><rect x="7" y="6" width="2" height="2" fill="#fde047"/>', 26) },
    { key: 'fire_mallow', name: '烤棉花糖', svg: _svg16('<rect x="2" y="12" width="10" height="1" fill="#78350f"/><rect x="6" y="5" width="6" height="6" fill="#fef3c7"/><rect x="6" y="5" width="6" height="2" fill="#f59e0b"/><rect x="11" y="4" width="2" height="2" fill="#fde047"/>', 26) },
    { key: 'fire_lantern', name: '暖光营灯', svg: _svg16('<rect x="6" y="2" width="4" height="1" fill="#475569"/><rect x="5" y="3" width="6" height="2" fill="#334155"/><rect x="5" y="5" width="6" height="7" fill="#fde047"/><rect x="7" y="7" width="2" height="3" fill="#f97316"/><rect x="4" y="12" width="8" height="2" fill="#334155"/>', 26) }
  ],
  cat: [
    { key: 'cat_fish', name: '脆皮鱼干', svg: _svg16('<rect x="2" y="6" width="3" height="4" fill="#60a5fa"/><rect x="5" y="5" width="7" height="6" fill="#3b82f6"/><rect x="12" y="6" width="2" height="4" fill="#2563eb"/><rect x="10" y="7" width="1" height="1" fill="#ffffff"/>', 26) },
    { key: 'cat_yarn', name: '彩虹毛线', svg: _svg16('<rect x="4" y="4" width="8" height="8" fill="#ec4899"/><rect x="5" y="5" width="6" height="2" fill="#f472b6"/><rect x="6" y="9" width="5" height="2" fill="#be185d"/><rect x="11" y="11" width="3" height="2" fill="#ec4899"/>', 26) },
    { key: 'cat_bell', name: '小金铃铛', svg: _svg16('<rect x="6" y="3" width="4" height="1" fill="#d97706"/><rect x="4" y="4" width="8" height="7" fill="#facc15"/><rect x="5" y="8" width="6" height="1" fill="#b45309"/><rect x="7" y="9" width="2" height="2" fill="#92400e"/>', 26) },
    { key: 'cat_book', name: '猫爪书签', svg: _svg16('<rect x="4" y="2" width="8" height="12" fill="#f59e0b"/><rect x="5" y="3" width="6" height="10" fill="#fef3c7"/><rect x="6" y="6" width="4" height="3" fill="#f472b6"/><rect x="7" y="10" width="2" height="2" fill="#d97706"/>', 26) }
  ],
  coffee: [
    { key: 'coffee_bean', name: '手选风味豆', svg: _svg16('<rect x="5" y="3" width="6" height="10" fill="#78350f"/><rect x="4" y="5" width="8" height="6" fill="#92400e"/><rect x="7" y="4" width="2" height="8" fill="#451a03"/>', 26) },
    { key: 'coffee_drip', name: '手冲滤杯', svg: _svg16('<rect x="3" y="3" width="10" height="2" fill="#e2e8f0"/><rect x="4" y="5" width="8" height="4" fill="#cbd5e1"/><rect x="6" y="9" width="4" height="2" fill="#94a3b8"/><rect x="7" y="11" width="2" height="3" fill="#78350f"/>', 26) },
    { key: 'coffee_latte', name: '拉花拿铁', svg: _svg16('<rect x="3" y="5" width="10" height="7" fill="#fef3c7"/><rect x="4" y="6" width="8" height="5" fill="#d97706"/><rect x="6" y="7" width="4" height="3" fill="#ffffff"/><rect x="4" y="12" width="8" height="2" fill="#94a3b8"/>', 26) },
    { key: 'coffee_moka', name: '摩卡小壶', svg: _svg16('<rect x="6" y="2" width="4" height="2" fill="#334155"/><rect x="5" y="4" width="6" height="4" fill="#cbd5e1"/><rect x="6" y="8" width="4" height="1" fill="#475569"/><rect x="4" y="9" width="8" height="5" fill="#94a3b8"/>', 26) }
  ],
  sprout: [
    { key: 'sprout_clover', name: '四叶幸运草', svg: _svg16('<rect x="4" y="4" width="3" height="3" fill="#22c55e"/><rect x="9" y="4" width="3" height="3" fill="#4ade80"/><rect x="4" y="8" width="3" height="3" fill="#4ade80"/><rect x="9" y="8" width="3" height="3" fill="#22c55e"/><rect x="7" y="10" width="2" height="4" fill="#15803d"/>', 26) },
    { key: 'sprout_cactus', name: '晨露多肉', svg: _svg16('<rect x="6" y="4" width="4" height="6" fill="#22c55e"/><rect x="4" y="6" width="2" height="3" fill="#16a34a"/><rect x="10" y="6" width="2" height="3" fill="#16a34a"/><rect x="7" y="3" width="2" height="1" fill="#f472b6"/><rect x="5" y="10" width="6" height="4" fill="#c2410c"/>', 26) },
    { key: 'sprout_sun', name: '向日葵花苞', svg: _svg16('<rect x="5" y="2" width="6" height="6" fill="#facc15"/><rect x="6" y="3" width="4" height="4" fill="#78350f"/><rect x="7" y="8" width="2" height="6" fill="#16a34a"/><rect x="5" y="10" width="2" height="2" fill="#4ade80"/>', 26) },
    { key: 'sprout_cherry', name: '樱桃小盆栽', svg: _svg16('<rect x="5" y="3" width="6" height="2" fill="#22c55e"/><rect x="6" y="5" width="1" height="4" fill="#16a34a"/><rect x="9" y="5" width="1" height="4" fill="#16a34a"/><rect x="4" y="9" width="3" height="3" fill="#ef4444"/><rect x="9" y="9" width="3" height="3" fill="#dc2626"/>', 26) }
  ]
};

function mintCollectible(mascotKey, index, dateStr) {
  const pool = COLLECTIBLE_CATALOG[mascotKey] || COLLECTIBLE_CATALOG.fire;
  const pick = pool[index % pool.length];
  return {
    id: `${Date.now()}-${index}`,
    key: pick.key,
    mascot: mascotKey,
    name: pick.name,
    date: dateStr
  };
}

function getCollectibleSvg(item) {
  if (!item) return getMascotSvg('fire', 'idle');
  for (const pool of Object.values(COLLECTIBLE_CATALOG)) {
    const found = pool.find(entry => entry.key === item.key);
    if (found) return found.svg;
  }
  return getMascotSvg(item.mascot || 'fire', 'complete');
}

// ================= RETRO DAILY THERMAL RECEIPT =================
function _receiptHM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getCompanionRemark(data) {
  const mins = data.totalMinutes || 0;
  const mascot = data.mascot || 'fire';
  if (mins === 0) {
    return '今天还没点亮专注灯，随时准备陪你开始第一轮。';
  }
  const quotes = {
    fire: mins >= 90 ? '炉火烧得旺旺的，今天你把时间握在手里了！' : '稳定的微光最持久，干得漂亮。',
    cat: mins >= 90 ? '喵~ 今天超自律，奖励你摸摸猫头！' : '乖乖陪你写完这一段，记得伸个懒腰喵。',
    coffee: mins >= 90 ? '醇厚满满的一天，这杯手冲敬你的深度心流。' : '香气刚刚好，不急不躁最舒服。',
    sprout: mins >= 90 ? '今天阳光充足，心流花园又多开了一片花！' : '每一分钟都是养分，小树苗正在悄悄长高。'
  };
  return quotes[mascot] || quotes.fire;
}

function formatReceiptText(data) {
  const serial = `AF-${(data.date || '').replaceAll('-', '')}-${String(data.sessionCount || 0).padStart(2, '0')}`;
  const mascotName = MASCOT_NAMES[data.mascot] || '伴侣';
  const lines = [
    '================================',
    '   AURAFOCUS · 口袋专注机',
    `   单号: ${serial}`,
    `   日期: ${data.date}   伴侣: ${mascotName}`,
    '--------------------------------',
    '   [专注明细]'
  ];
  if (!data.sessions || !data.sessions.length) {
    lines.push('   (今日尚无记录，开始第一轮吧)');
  } else {
    data.sessions.forEach((s, idx) => {
      const range = `${_receiptHM(s.startAt)}-${_receiptHM(s.endAt)}`;
      const extra = s.overtimeMins > 0 ? `+${s.overtimeMins}m` : '';
      lines.push(`   ${idx + 1}. ${range} ${s.task || '自由专注'}`);
      lines.push(`      时长: ${s.actualMins}m ${extra}  收获: ${s.collectible || '徽章'}`);
    });
  }
  lines.push('--------------------------------');
  lines.push(`   今日总计: ${data.totalMinutes} 分钟 (${data.sessionCount} 轮)`);
  if (data.overtimeTotal > 0) {
    lines.push(`   心流顺延: +${data.overtimeTotal} 分钟`);
  }
  if (data.thoughts && data.thoughts.length) {
    lines.push('--------------------------------');
    lines.push(`   [暂存念头 · ${data.thoughts.length} 条]`);
    data.thoughts.slice(0, 8).forEach(t => {
      lines.push(`   [${t.done ? 'x' : ' '}] ${t.text}`);
    });
  }
  lines.push('--------------------------------');
  lines.push(`   ${mascotName}寄语: ${getCompanionRemark(data)}`);
  lines.push('   ||| || |||| | ||| || |||| |||');
  lines.push('================================');
  return lines.join('\n');
}

function formatReceiptMarkdown(data) {
  const mascotName = MASCOT_NAMES[data.mascot] || '伴侣';
  const lines = [
    `## AuraFocus 专注小票 · ${data.date}`,
    '',
    `- **今日专注**：${data.totalMinutes} 分钟（共 ${data.sessionCount} 轮${data.overtimeTotal > 0 ? `，含心流顺延 +${data.overtimeTotal} 分钟` : ''}）`,
    `- **陪伴伴侣**：${mascotName}`,
    ''
  ];
  if (data.sessions && data.sessions.length) {
    lines.push('### 专注明细');
    data.sessions.forEach(s => {
      const range = `${_receiptHM(s.startAt)}-${_receiptHM(s.endAt)}`;
      const extra = s.overtimeMins > 0 ? `（顺延 +${s.overtimeMins}m）` : '';
      lines.push(`- \`${range}\` **${s.task || '自由专注'}** — ${s.actualMins}m${extra} · 收藏「${s.collectible || '专注徽章'}」`);
    });
    lines.push('');
  }
  if (data.thoughts && data.thoughts.length) {
    lines.push('### 暂存念头');
    data.thoughts.forEach(t => {
      lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
    });
    lines.push('');
  }
  lines.push(`> ${mascotName}：${getCompanionRemark(data)}`);
  return lines.join('\n');
}

function renderReceiptCanvasDataUrl(data) {
  const W = 440;
  const pad = 28;
  const sessions = data.sessions || [];
  const thoughts = (data.thoughts || []).slice(0, 8);
  const lineH = 22;
  const estHeight = 280 + Math.max(1, sessions.length) * 42 + (thoughts.length ? 42 + thoughts.length * 22 : 0) + 120;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = estHeight;
  const ctx = canvas.getContext('2d');

  // Outer warm backdrop
  ctx.fillStyle = '#dce0d6';
  ctx.fillRect(0, 0, W, estHeight);

  // Paper body with serrated zigzag edges
  const paperX = 16;
  const paperW = W - 32;
  const paperTop = 18;
  const paperBot = estHeight - 18;
  const tooth = 8;

  ctx.fillStyle = '#f8f5ec';
  ctx.beginPath();
  ctx.moveTo(paperX, paperTop + tooth);
  for (let x = paperX; x < paperX + paperW; x += tooth * 2) {
    ctx.lineTo(x + tooth, paperTop);
    ctx.lineTo(Math.min(paperX + paperW, x + tooth * 2), paperTop + tooth);
  }
  ctx.lineTo(paperX + paperW, paperBot - tooth);
  for (let x = paperX + paperW; x > paperX; x -= tooth * 2) {
    ctx.lineTo(x - tooth, paperBot);
    ctx.lineTo(Math.max(paperX, x - tooth * 2), paperBot - tooth);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c5bfb0';
  ctx.lineWidth = 1;
  ctx.stroke();

  const ink = '#2b3129';
  const muted = '#5d645a';
  let y = paperTop + 38;

  const drawDash = () => {
    ctx.strokeStyle = '#b4ae9f';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad + 6, y);
    ctx.lineTo(W - pad - 6, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 22;
  };

  // Header
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px "Consolas", "Microsoft YaHei", monospace';
  ctx.fillText('AURAFOCUS · 口袋专注机', W / 2, y);
  y += 22;
  ctx.fillStyle = muted;
  ctx.font = '12px "Consolas", "Microsoft YaHei", monospace';
  const mascotName = MASCOT_NAMES[data.mascot] || '伴侣';
  ctx.fillText(`日期 ${data.date}   ·   陪伴伴侣 ${mascotName}`, W / 2, y);
  y += 18;
  drawDash();

  // Sessions
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
  ctx.fillText('专注明细', pad + 6, y);
  y += 24;

  if (!sessions.length) {
    ctx.fillStyle = muted;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('今天还没有完成的专注记录，随时开启第一轮！', pad + 6, y);
    y += 26;
  } else {
    sessions.forEach((s, i) => {
      const range = `${_receiptHM(s.startAt)}-${_receiptHM(s.endAt)}`;
      ctx.fillStyle = ink;
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      const title = `${i + 1}. ${(s.task || '自由专注').slice(0, 18)}`;
      ctx.fillText(title, pad + 6, y);
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px "Consolas", monospace';
      ctx.fillText(`${s.actualMins}m${s.overtimeMins > 0 ? ` (+${s.overtimeMins})` : ''}`, W - pad - 6, y);
      ctx.textAlign = 'left';
      y += 18;
      ctx.fillStyle = muted;
      ctx.font = '11px "Consolas", "Microsoft YaHei", monospace';
      ctx.fillText(`   ${range}   收获「${s.collectible || '徽章'}」`, pad + 6, y);
      y += 22;
    });
  }

  drawDash();

  // Totals
  ctx.fillStyle = ink;
  ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
  ctx.fillText('今日专注总计', pad + 6, y);
  ctx.textAlign = 'right';
  ctx.font = 'bold 18px "Consolas", monospace';
  ctx.fillText(`${data.totalMinutes} MIN`, W - pad - 6, y);
  ctx.textAlign = 'left';
  y += 22;
  ctx.fillStyle = muted;
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillText(`完成 ${data.sessionCount} 轮${data.overtimeTotal > 0 ? ` · 心流顺延 +${data.overtimeTotal}m` : ''}`, pad + 6, y);
  y += 20;

  if (thoughts.length) {
    drawDash();
    ctx.fillStyle = ink;
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`暂存念头 (${thoughts.length})`, pad + 6, y);
    y += 20;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    thoughts.forEach(t => {
      ctx.fillStyle = t.done ? muted : ink;
      ctx.fillText(`${t.done ? '☑' : '☐'} ${t.text.slice(0, 24)}`, pad + 6, y);
      y += lineH;
    });
  }

  drawDash();

  // Companion remark
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillText(`${mascotName}：${getCompanionRemark(data)}`, W / 2, y);
  y += 24;

  // Pixel Barcode
  const bars = [2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 2, 3, 1, 2];
  const barTotal = bars.reduce((a, b) => a + b * 3, 0);
  let bx = Math.round((W - barTotal) / 2);
  ctx.fillStyle = ink;
  bars.forEach((w, idx) => {
    if (idx % 2 === 0) ctx.fillRect(bx, y, w * 3, 28);
    bx += w * 3;
  });

  return canvas.toDataURL('image/png');
}
