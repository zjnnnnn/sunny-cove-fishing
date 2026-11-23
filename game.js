"use strict";

const select = (id) => document.getElementById(id);
const fishLayer = select("fish");
const caughtLayer = select("caught");
const rod = select("rod");
const line = select("line");
const bobber = select("bobber");
const meter = select("meter");
const fill = select("fill");
const tensionFill = select("tension-fill");
const meterHint = select("meter-hint");
const splash = select("splash");
const timingCue = select("timing-cue");
const chargeMeter = select("charge-meter");
const chargeFill = select("charge-fill");
const chargeHint = select("charge-hint");
const chargeDetail = select("charge-detail");
const castMarker = select("cast-marker");
const status = select("status");
const button = select("action");
const label = select("action-label");
const journalSummary = select("journal-summary");
const storageNote = select("journal-storage");
const challenge = select("koi-challenge");
const challengeBadge = select("challenge-badge");
const storageKey = "sunny-cove-catches-v1";
const chargeDuration = 1200;
const target = 8;
const castDuration = 0.42;
const landingDuration = 0.72;
const warningTension = 0.7;
const barWidth = 150;
const near = { swimX: [460, 635], swimY: [341, 440] };
const deep = { swimX: [675, 909], swimY: [357, 485] };
const bank = { name: "近岸", zone: near, notice: [0.7, 1.4],
  detail: "温顺的鲫鱼，适合练手", surgePull: 0.16, surgeRelease: 0.16 };
const weeds = { name: "水草边", zone: deep, from: 0.49, notice: [1.0, 1.7],
  detail: "咬钩快，挣扎时容易绷线", surgePull: 0.28, surgeRelease: 0.09 };
const openWater = { name: "开阔水面", zone: deep, from: 0.76, notice: [2.7, 3.9],
  detail: "等得久，挣扎时更好松线", surgePull: 0.11, surgeRelease: 0.26 };
const carp = { id: "carp", name: "鲫鱼", color: "#ffd080", fin: "#eb9162", pull: 0.22, speed: [48, 64], zone: near };
const bass = { id: "bass", name: "鲈鱼", color: "#a9dce3", fin: "#79aebd", pull: 0.26, speed: [57, 77], zone: deep,
  burst: { start: 0.9, warning: 0.65, surge: 0.75, period: 3.3 } };
const koi = { id: "koi", name: "金鲤", color: "#ffad55", fin: "#ec6f48", pull: 0.29, speed: [39, 52], zone: deep,
  burst: { start: 1.45, warning: 0.8, surge: 1.15, opening: 1.2, period: 4.5 } };
const species = [carp, bass, koi];
const random = (min, max) => min + Math.random() * (max - min);
const mix = (a, b, t) => a + (b - a) * t;
const waypoint = (kind) => ({ x: random(...kind.zone.swimX), y: random(...kind.zone.swimY) });
const castSpot = (power) => ({ x: mix(485, 850, power), y: mix(350, 405, power),
  spot: power >= openWater.from ? openWater : power >= weeds.from ? weeds : bank });
const readyMessage = "轻按空格钓近岸，按住时看准落点再松开。";
const canCast = () => state === "ready" || state === "landed";
let fish = [];
let bait = castSpot(0);
let state, progress, tension, hooked, curious, age, noticeAt, last, chargeStart, landedMessage;
let chargeSource = null;
let pressedPointer = null;
let openingUsed = false;
let timedPullThisCatch = false;
let liftStartX = bait.x;

function loadJournal() {
  let saved;
  try {
    saved = JSON.parse(window.localStorage.getItem(storageKey));
  } catch {
    storageNote.textContent = "未能读取存档，可以继续钓鱼。";
  }
  const counts = Object.fromEntries(species.map(({ id }) => {
    const count = saved?.[id];
    return [id, Number.isSafeInteger(count) && count > 0 ? count : 0];
  }));
  return { counts, koiTiming: saved?.koiTiming === true };
}

const journal = loadJournal();
const catches = journal.counts;

function showJournal() {
  let discovered = 0;
  for (const { id } of species) {
    const count = catches[id];
    if (count) discovered++;
    select(`journal-${id}`).classList.toggle("unlocked", count > 0);
    select(`count-${id}`).textContent = count ? `钓到 ${count} 条` : "尚未钓到";
  }
  journalSummary.textContent = discovered === species.length ? "图鉴已集齐 · 3 / 3" : `已发现 ${discovered} / ${species.length} 种`;
  challenge.classList.toggle("completed", journal.koiTiming);
  challengeBadge.textContent = journal.koiTiming ? "已完成" : "待完成";
}

function recordCatch(kind) {
  const first = catches[kind.id] === 0;
  const completed = kind === koi && timedPullThisCatch && !journal.koiTiming;
  if (completed) journal.koiTiming = true;
  catches[kind.id]++;
  showJournal();
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...catches, koiTiming: journal.koiTiming }));
    storageNote.textContent = "";
  } catch {
    storageNote.textContent = "浏览器未能保存，刷新可能丢失本次记录。";
  }
  return { first, completed };
}

function makeFish(kind) {
  const { color, fin } = kind;
  const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
  el.innerHTML = `<g stroke="#2e6255" stroke-width="2" stroke-linejoin="round">
    <path d="M-15 0l-17-10 3 10-3 10Z" fill="${fin}"/>
    <path d="M-9-8q4-10 13-5l4 5" fill="${fin}"/>
    <path d="M-19 0q11-15 28-9 18 8 0 17-17 7-28-8Z" fill="${color}"/>
    <path d="M-1-2l-6 7 10-2" fill="${fin}"/>
    <circle cx="9" cy="-3" r="2" fill="#254b43" stroke="none"/>
  </g>`;
  fishLayer.append(el);
  return { el, kind, ...waypoint(kind), goal: waypoint(kind), speed: random(...kind.speed), facing: 1, phase: random(0, Math.PI * 2) };
}

function changeState(next, message, action) {
  state = next;
  age = 0;
  status.textContent = message;
  label.textContent = action;
  button.disabled = next === "landing";
}

function startGame() {
  fish = [carp, bass, carp, bass, carp, koi].map(makeFish);
  progress = tension = 0;
  showJournal();
  changeState("ready", readyMessage, "甩竿");
}

function startCharge(source) {
  chargeSource = source;
  chargeStart = performance.now();
  changeState("charging", "按住增加力度，松开就甩竿。", "松开甩竿");
  render(chargeStart / 1000);
}

const chargePower = (now) => Math.max(0, Math.min(1, (now - chargeStart) / chargeDuration));

function releaseCharge(source) {
  if (state !== "charging" || chargeSource !== source) return;
  chargeSource = null;
  castRod(chargePower(performance.now()));
  render(performance.now() / 1000);
}

function cancelCharge() {
  if (state !== "charging") return;
  chargeSource = null;
  if (hooked) changeState("landed", landedMessage, "再抛一竿");
  else changeState("ready", readyMessage, "甩竿");
  render(performance.now() / 1000);
}

function castRod(power) {
  if (hooked) {
    // 下一竿只补上一条同种鱼，其他鱼继续在原处游动。
    hooked.el.remove();
    fish[fish.indexOf(hooked)] = makeFish(hooked.kind);
    hooked = null;
  }
  bait = castSpot(power);
  // 两个深水落点共享鱼群，只改变咬钩速度和挣扎时的张力。
  const spot = bait.spot;
  const candidates = fish.filter((f) => f.kind.zone === spot.zone);
  curious = candidates[Math.floor(Math.random() * candidates.length)];
  noticeAt = random(...spot.notice);
  changeState("waiting", `${spot.name}｜${spot.detail}。按空格可以空收。`, "收竿");
}

function clearLure() {
  if (curious) curious.goal = waypoint(curious.kind);
  curious = null;
}

const burstCycle = (burst) => (age - burst.start) % burst.period;

function fishPhase() {
  if (state !== "reeling") return "calm";
  const burst = hooked.kind.burst;
  if (!burst || age < burst.start) return "calm";
  // 先溅水预警，再短时间挣扎；松手总能让张力下降。
  const cycle = burstCycle(burst);
  if (cycle < burst.warning) return "warning";
  if (cycle < burst.warning + burst.surge) return "surge";
  if (burst.opening && cycle < burst.warning + burst.surge + burst.opening) return "opening";
  return "calm";
}

function shoreDrift(phase) {
  if (phase !== "opening") return 0;
  const burst = hooked.kind.burst;
  const fraction = (burstCycle(burst) - burst.warning - burst.surge) / burst.opening;
  return 34 * Math.sin(Math.PI * fraction);
}

function showReelingHint(phase) {
  const hint = tension >= warningTension ? "鱼线太紧，松手等一等"
    : phase === "surge" ? (bait.spot === weeds ? "水草边容易绷线，先别拉" : "鱼在挣扎，先别拉")
    : phase === "warning" ? "鱼漂在抖，准备停手"
    : phase === "opening" ? (openingUsed ? "抓准时机，收了两格" : "鱼漂横移！现在按空格收两格")
    : "按空格拉鱼，留意张力";
  const message = `${hooked.kind.name} · ${progress}/${target}｜${hint}`;
  if (status.textContent !== message) status.textContent = message;
  if (meterHint.textContent !== hint) meterHint.textContent = hint;
}

function act() {
  if (canCast()) {
    castRod(0);
  } else if (state === "waiting") {
    clearLure();
    changeState("ready", "收回空竿了，再抛一次吧。", "甩竿");
  } else if (state === "reeling") {
    const phase = fishPhase();
    const timed = phase === "opening" && !openingUsed;
    tension += (timed ? 0.18 : hooked.kind.pull) + (phase === "surge" ? bait.spot.surgePull : 0);
    if (tension >= 1) {
      const name = hooked.kind.name;
      hooked.goal = waypoint(hooked.kind);
      hooked = null;
      changeState("ready", `鱼线断了，${name}跑了。再抛一竿吧。`, "甩竿");
    } else {
      if (timed) openingUsed = timedPullThisCatch = true;
      progress = Math.min(target, progress + (timed ? 2 : 1));
      if (progress === target) {
        liftStartX = bait.x - shoreDrift(phase);
        caughtLayer.append(hooked.el);
        changeState("landing", "鱼要出水了！", "提竿中");
        meterHint.textContent = "鱼要出水了！";
      }
    }
  }
  render(performance.now() / 1000);
}

function move(dt) {
  age += dt;
  if (state === "landing" && age >= landingDuration) {
    const { first, completed } = recordCatch(hooked.kind);
    const reward = `${first ? "图鉴点亮新鱼。" : ""}${completed ? "完成挑战「抓准时机」。" : ""}`;
    landedMessage = `钓到${hooked.kind.name}啦！${reward || "可以再抛一竿。"}`;
    changeState("landed", landedMessage, "再抛一竿");
  }
  if (state === "reeling") {
    const phase = fishPhase();
    if (phase !== "opening") openingUsed = false;
    const release = phase === "surge" ? bait.spot.surgeRelease : 0.48;
    tension = Math.max(0, tension - dt * release);
  }
  if (state === "waiting" && curious && age >= noticeAt) {
    curious.goal = bait;
    noticeAt = Infinity;
  }
  for (const f of fish) {
    if (f === hooked) continue;
    const dx = f.goal.x - f.x;
    const dy = f.goal.y - f.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) {
      f.goal = waypoint(f.kind);
    } else {
      const step = Math.min(f.speed * dt, distance);
      f.x += dx * step / distance;
      f.y += dy * step / distance;
      if (Math.abs(dx) > 2) f.facing = Math.sign(dx);
    }
    if (state === "waiting" && f.kind.zone === bait.spot.zone && age >= bait.spot.notice[0] && Math.hypot(f.x - bait.x, f.y - bait.y) <= 16) {
      hooked = f;
      clearLure();
      progress = tension = 0;
      openingUsed = timedPullThisCatch = false;
      changeState("reeling", `是${f.kind.name}！`, "拉鱼");
    }
  }
}

function render(time) {
  const charging = state === "charging";
  chargeMeter.classList.toggle("hidden", !charging);
  castMarker.classList.toggle("hidden", !charging);
  if (charging) {
    const power = chargePower(time * 1000);
    const aim = castSpot(power);
    const hint = `松开甩竿 · ${aim.spot.name}`;
    if (chargeHint.textContent !== hint) chargeHint.textContent = hint;
    if (chargeDetail.textContent !== aim.spot.detail) chargeDetail.textContent = aim.spot.detail;
    chargeFill.setAttribute("width", String(barWidth * power));
    castMarker.setAttribute("transform", `translate(${aim.x} ${aim.y - 23})`);
  }
  const out = state === "waiting" || state === "reeling";
  const cast = state === "waiting" ? Math.min(1, age / castDuration) : 1;
  const showingCatch = state === "landed" || (charging && hooked);
  const pull = showingCatch ? 1 : state === "landing" ? Math.min(1, age / landingDuration) : 0;
  const phase = fishPhase();
  const danger = state === "reeling" && tension >= warningTension;
  const tight = state === "reeling" ? tension : pull;
  const shake = phase === "surge" ? 6 * Math.sin(time * 26) : phase === "warning" ? 3 * Math.sin(time * 22) : 0;
  const tip = out ? { x: 397, y: 247 - 14 * tight } : { x: 366, y: 193 };
  rod.setAttribute("d", `M260 327 Q326 ${out ? 263 + tight * 12 : 238} ${tip.x} ${tip.y}`);
  const floatX = mix(367, bait.x, cast) + shake - shoreDrift(phase);
  const floatY = mix(216, bait.y - 23, cast) - Math.sin(Math.PI * cast) * 52 + (cast >= 1 ? Math.sin(time * 5) * 1.5 : 0) + (phase === "surge" ? 9 : 0);
  const catchX = mix(liftStartX, 383, pull);
  const catchY = mix(bait.y, 257, pull) - Math.sin(Math.PI * pull) * 123;
  const attached = state === "landing" || showingCatch;
  line.classList.toggle("hidden", !out && !attached);
  line.setAttribute("stroke", danger ? "#a63830" : "#fff9df");
  if (out) line.setAttribute("d", `M${tip.x} ${tip.y} Q${(tip.x + floatX) / 2} ${mix(floatY - 18, (tip.y + floatY) / 2, tight)} ${floatX} ${floatY}`);
  if (attached) line.setAttribute("d", `M${tip.x} ${tip.y} L${catchX} ${catchY - 8}`);
  bobber.classList.toggle("hidden", !out);
  bobber.setAttribute("transform", `translate(${floatX} ${floatY})`);
  splash.classList.toggle("hidden", phase !== "warning" && phase !== "surge");
  splash.setAttribute("transform", `translate(${floatX} ${bait.y - 21}) scale(${phase === "surge" ? 1.2 : 0.75})`);
  timingCue.classList.toggle("hidden", phase !== "opening" || openingUsed || danger);
  timingCue.setAttribute("transform", `translate(${floatX} ${floatY - 17})`);
  meter.classList.toggle("hidden", state !== "reeling" && state !== "landing");
  fill.setAttribute("width", String(barWidth * progress / target));
  tensionFill.setAttribute("width", String(barWidth * Math.min(1, tension)));
  tensionFill.setAttribute("fill", danger ? "#a63830" : "#ca8050");
  if (state === "reeling") showReelingHint(phase);
  for (const f of fish) {
    const wiggle = Math.sin(time * 4 + f.phase) * 2;
    if (f === hooked && attached) {
      f.el.setAttribute("opacity", "1");
      f.el.setAttribute("transform", `translate(${catchX} ${catchY}) rotate(${-32 + 20 * pull}) scale(1.25)`);
    } else if (f === hooked) {
      f.el.setAttribute("transform", `translate(${floatX - 9} ${floatY + 23}) rotate(${wiggle * 3})`);
    } else {
      f.el.setAttribute("opacity", ".72");
      f.el.setAttribute("transform", `translate(${f.x} ${f.y + wiggle}) scale(${f.facing} 1)`);
    }
  }
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  if (event.repeat || pressedPointer !== null) return;
  if (canCast()) startCharge("keyboard");
  else act();
});
window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  event.preventDefault();
  releaseCharge("keyboard");
});
button.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || state === "charging" || state === "landing") return;
  pressedPointer = event.pointerId;
  button.setPointerCapture(event.pointerId);
  if (canCast()) startCharge(event.pointerId);
});
button.addEventListener("pointerup", (event) => {
  if (pressedPointer !== event.pointerId) return;
  pressedPointer = null;
  if (state === "charging") releaseCharge(event.pointerId);
  else act();
});
function cancelPointer(event) {
  if (pressedPointer === event.pointerId) pressedPointer = null;
  if (chargeSource === event.pointerId) cancelCharge();
}
button.addEventListener("pointercancel", cancelPointer);
button.addEventListener("lostpointercapture", cancelPointer);
button.addEventListener("click", (event) => {
  // 鼠标和触屏已在松开时处理；这里保留回车和辅助技术触发的点击。
  if (event.detail === 0) act();
});
window.addEventListener("blur", () => {
  pressedPointer = null;
  cancelCharge();
});

function frame(now) {
  const dt = last === undefined ? 0 : Math.min((now - last) / 1000, 0.05);
  last = now;
  move(dt);
  render(now / 1000);
  window.requestAnimationFrame(frame);
}

startGame();
render(0);
window.requestAnimationFrame(frame);
