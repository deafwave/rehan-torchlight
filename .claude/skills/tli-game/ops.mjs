/* One-call Skill-panel operations, verified step by step from memory (tli_dump --ui-json). Elevated shell,
   Torchlight in front (clicks need the real cursor). Never screenshots; aborts on the first unexpected state.
   usage:
     node ops.mjs state                                   loadout, open views, equipped gear with item ids (memory)
     node ops.mjs aura <aura name> on|off                 Activate/Deactivate an aura (passive slot)
     node ops.mjs unequip <skill> [<support>]             remove a support (or the whole skill) from its slot
     node ops.mjs restore                                 put back the last unequipped item (same copy, verified by item id)
     node ops.mjs install <skill> [<support>] [--slot N --socket S]   install by name from the picker (typed search)
     node ops.mjs equip <bag item name>                   equip a gear-page bag item (right-click); gear-restore undoes the last swap
     node ops.mjs close                                   ESC until no Skill panel
   Names match case-insensitively by substring. Restoring = install the same name back into the same place. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const poor = path.resolve(here, "../../../../poorchlight");
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ui = () => JSON.parse(execFileSync(path.join(poor, "target/release/tli_dump.exe"), ["--ui-json"],
  { cwd: poor, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8"));
const front = () => execFileSync("powershell", ["-NoProfile", "-Command",
  "Add-Type -Name F -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);'; $p=0; [U.F]::GetWindowThreadProcessId([U.F]::GetForegroundWindow(),[ref]$p)|Out-Null; (Get-Process -Id $p).ProcessName"],
  { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() === "torchlight_infinite";
// clicks need the real cursor: wait (up to TLI_WAIT_S, default 1800) for the user to bring the game to front
function waitFront() {
  const until = Date.now() + 1000 * Number(process.env.TLI_WAIT_S ?? 1800);
  let said = false;
  while (!front()) {
    if (Date.now() > until) die("game never came to the front");
    if (!said) { console.log("waiting for Torchlight to be in front (clicks need the cursor)..."); said = true; }
    sleep(3000);
  }
}
const game = (...a) => (a[0] === "click" && waitFront(), execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "game.ps1"), ...a.map(String)],
  { stdio: ["ignore", "pipe", "pipe"] }).toString());
const LOG = path.resolve(here, "../../../../scratch/removed.json");
const removed = () => fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];
const die = msg => { console.error(`ABORT: ${msg}`); process.exit(1); };

// screen layout of the F2 Skill panel (game client pixels, 3440x1440)
const SLOT_Y = { 1: 400, 2: 484, 3: 568, 4: 652, 5: 736, 6: 838, 7: 922, 8: 1008, 9: 1092 };
const SOCKET_XY = { 1: [1720, 720], 2: [1720, 470], 3: [1500, 590], 4: [1500, 850], 5: [1940, 850], 6: [1940, 590] };
const BTN = { unequip: [2245, 972], unequipMagnificent: [2222, 972], aura: [2187, 487], confirm: [1860, 936],
  search: [1230, 1042], searchGo: [1516, 1042], firstItem: [1702, 516], install: [1454, 623] };

const has = (a, b) => a && b && a.toLowerCase().includes(b.toLowerCase());
const slots = u => [...u.loadout.active, ...u.loadout.passive];
function find(u, skill, support) {
  const s = slots(u).find(x => has(x.skill?.name, skill));
  if (!s) return null;
  if (!support) return { slot: s.slot, socket: 1, name: s.skill.name, itemId: s.skill.itemId, level: s.skill.level, entry: s };
  const sp = s.supports.find(x => has(x.name, support));
  return sp ? { slot: s.slot, socket: sp.socket, name: sp.name, itemId: sp.itemId, level: sp.level, entry: s } : null;
}
const summary = u => slots(u).map(s => `${s.slot}: ${s.skill?.name ?? "(empty)"} L${s.skill?.level ?? "-"}` +
  (s.activated === false ? " [DEACTIVATED]" : "") + "  | " + s.supports.map(x => `${x.socket}:${x.name} L${x.level}`).join(", ")).join("\n");

function openSlot(slot) {
  waitFront();
  let u = ui();
  if (!u.skillPanel.open) { game("key", "F2"); for (let i = 0; i < 16 && !u.skillPanel.open; i++) { sleep(250); u = ui(); } }
  if (!u.skillPanel.open) die("Skill panel did not open");
  if (u.skillPanel.selectedSlot !== slot) { game("click", 120, SLOT_Y[slot]); for (let i = 0; i < 12 && u.skillPanel.selectedSlot !== slot; i++) { sleep(250); u = ui(); } }
  if (u.skillPanel.selectedSlot !== slot) die(`slot ${slot} not selected (got ${u.skillPanel.selectedSlot})`);
  return u;
}
function close() {
  for (let i = 0; i < 4 && ui().skillPanel.open; i++) { game("key", "ESC"); sleep(500); }
  if (ui().skillPanel.open) die("Skill panel still open");
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = k => rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined;
const names = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));

if (cmd === "state") {
  const u = ui();
  console.log(`views: ${u.views.map(v => v.page).join(", ")}  | skill panel ${u.skillPanel.open ? "OPEN" : "closed"}`);
  console.log(summary(u));
  console.log(`life sealed ${u.life.sealed}/${u.life.max}, mana sealed ${u.mana.sealed}/${u.mana.max}`);
  console.log(`gear: ${Object.entries(u.gear.equipped).map(([k, v]) => `${k}=${v.uniqueName ?? v.baseName}#${v.instanceId}`).join(", ")}`);
} else if (cmd === "close") {
  close(); console.log("closed");
} else if (cmd === "aura") {
  const [name, want] = names;
  const t = find(ui(), name); if (!t || t.slot < 6) die(`no aura matching "${name}"`);
  if ((t.entry.activated !== false) === (want === "on")) { console.log(`${t.name} already ${want}`); process.exit(0); }
  openSlot(t.slot); game("click", ...SOCKET_XY[1]); sleep(600); game("click", ...BTN.aura); sleep(800);
  close(); sleep(1500);
  const now = find(ui(), name).entry.activated !== false;
  if (now !== (want === "on")) die(`${t.name} is still ${now ? "on" : "off"}`);
  console.log(`${t.name} -> ${want}`);
} else if (cmd === "unequip") {
  const [skill, support] = names;
  const before = ui(); const t = find(before, skill, support);
  if (!t) die(`nothing matching ${skill}${support ? " / " + support : ""}`);
  openSlot(t.slot);
  const sock = ui().skillPanel.sockets.find(s => s.socket === t.socket);
  if (!has(sock?.name, t.name)) die(`socket ${t.socket} shows "${sock?.name}", expected "${t.name}"`);
  game("click", ...SOCKET_XY[t.socket]); sleep(700);
  game("click", ...(/Magnificent|Noble/.test(t.name) ? BTN.unequipMagnificent : BTN.unequip)); sleep(900);
  let after = ui();
  if (find(after, skill, support) && t.socket === 1) { game("click", ...BTN.confirm); sleep(900); after = ui(); }
  if (find(after, skill, support)) die(`${t.name} still equipped`);
  // nothing else may have changed
  const sig = u => slots(u).map(s => [s.skill?.name, ...s.supports.map(x => x.name)].join("|"));
  const diff = sig(before).map((s, i) => s === sig(after)[i] ? null : i + 1).filter(Boolean);
  if (diff.length !== 1 || diff[0] !== t.slot) die(`unexpected loadout change in slots ${diff}`);
  close();
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, JSON.stringify([...removed(), { slot: t.slot, socket: t.socket, name: t.name, itemId: t.itemId, level: t.level }], null, 1));
  console.log(`removed ${t.name} L${t.level} from slot ${t.slot} socket ${t.socket} (restore: node ops.mjs restore)`);
} else if (cmd === "install" || cmd === "restore") {
  const [skill, support] = names;
  const rec = cmd === "restore" ? removed().at(-1) : null;
  if (cmd === "restore" && !rec) die("nothing to restore");
  const slot = rec?.slot ?? Number(flag("--slot")), socket = rec?.socket ?? Number(flag("--socket") ?? (support ? NaN : 1));
  if (!slot || !socket) die("install needs --slot N and (for a support) --socket S — the place it was removed from");
  const item = rec?.name ?? support ?? skill;
  const u = openSlot(slot);
  const cur = slots(u).find(s => s.slot === slot);
  const held = socket === 1 ? cur?.skill?.name : cur?.supports.find(x => x.socket === socket)?.name;
  if (held) die(`socket ${socket} is occupied by "${held}"`);
  game("click", ...SOCKET_XY[socket]); sleep(900);
  game("click", ...BTN.search); sleep(300); game("type", item); sleep(300); game("click", ...BTN.searchGo); sleep(700);
  game("click", ...BTN.firstItem); sleep(700); game("click", ...BTN.install); sleep(1200);
  const now = slots(ui()).find(s => s.slot === slot);
  const got = socket === 1 ? now?.skill?.name : now?.supports.find(x => x.socket === socket)?.name;
  if (!has(got, item)) die(`socket ${socket} now holds "${got ?? "(empty)"}", expected "${item}"`);
  if (rec) {
    const e = socket === 1 ? now.skill : now.supports.find(x => x.socket === socket);
    if (e.itemId !== rec.itemId) die(`installed a different copy of ${item} (L${e.level}, ${e.itemId}; removed L${rec.level}, ${rec.itemId}) — swap it manually`);
    fs.writeFileSync(LOG, JSON.stringify(removed().slice(0, -1), null, 1));
  }
  close();
  console.log(`installed ${got} in slot ${slot} socket ${socket}`);
} else if (cmd === "equip" || cmd === "gear-restore") {
  // right-click a gear-page bag item: the game equips it and drops the old piece into the same bag cell
  const GLOG = path.resolve(here, "../../../../scratch/gear-swaps.json");
  const swaps = fs.existsSync(GLOG) ? JSON.parse(fs.readFileSync(GLOG, "utf8")) : [];
  const rec = cmd === "gear-restore" ? swaps.at(-1) : null;
  if (cmd === "gear-restore" && !rec) die("no gear swap to restore");
  let u = ui();
  const bagslot = flag("--bagslot") !== undefined ? Number(flag("--bagslot")) : null;
  const item = rec ? u.gear.bag.find(b => b.instanceId === rec.removed)
    : u.gear.bag.find(b => b.page === 100 && (bagslot === null || b.slot === bagslot) && (has(b.uniqueName, names[0]) || has(b.baseName, names[0])));
  if (!item) die(`no gear-page bag item matching "${rec ? rec.removedName : names[0]}"`);
  if (item.page !== 100) die(`${item.uniqueName ?? item.baseName} is on bag page ${item.page}, not the gear page`);
  const before = Object.fromEntries(Object.entries(u.gear.equipped).map(([k, v]) => [k, v.instanceId]));
  waitFront();
  if (!u.inventory.open) { game("key", "B"); for (let i = 0; i < 16 && !u.inventory.open; i++) { sleep(250); u = ui(); } }
  if (!u.inventory.open) die("inventory did not open");
  if (u.inventory.selectedPage !== 100) die(`bag shows page ${u.inventory.selectedPage}; select the gear tab (100) first`);
  // the grid shows 3 rows starting at scrollOffset/cellHeight; wheel it until the target row is visible
  const visRow = () => Math.floor(item.slot / 9) - Math.round(u.inventory.grid.scrollOffset / u.inventory.grid.cellHeight);
  for (let i = 0; i < 12 && (visRow() < 0 || visRow() > 2); i++) {
    game("wheel", 3000, 1136, visRow() < 0 ? 1 : -1); sleep(400); u = ui();
  }
  if (visRow() < 0 || visRow() > 2) die(`could not scroll slot ${item.slot} into view`);
  game("rclick", 2556 + (item.slot % 9) * 100, 996 + visRow() * 140); sleep(1000);
  u = ui();
  const changed = Object.entries(u.gear.equipped).filter(([k, v]) => before[k] !== v.instanceId);
  if (changed.length !== 1 || changed[0][1].instanceId !== item.instanceId) die(`unexpected gear change: ${JSON.stringify(changed.map(([k, v]) => [k, v.uniqueName ?? v.baseName]))}`);
  const [slot] = changed[0];
  const out = u.gear.bag.find(b => b.instanceId === before[slot]);
  game("click", 3354, 56); sleep(600);   // bag X (ESC would also close the dummy panel)
  if (rec) fs.writeFileSync(GLOG, JSON.stringify(swaps.slice(0, -1), null, 1));
  else fs.writeFileSync(GLOG, JSON.stringify([...swaps, { slot, equipped: item.instanceId, equippedName: item.uniqueName ?? item.baseName,
    removed: before[slot], removedName: out?.uniqueName ?? out?.baseName }], null, 1));
  console.log(`${slot}: ${out?.uniqueName ?? out?.baseName} -> ${item.uniqueName ?? item.baseName}${rec ? " (restored)" : "  (undo: node ops.mjs gear-restore)"}`);
} else {
  die("usage: ops.mjs state | aura <name> on|off | unequip <skill> [<support>] | install <skill> [<support>] --slot N [--socket S] | close");
}
