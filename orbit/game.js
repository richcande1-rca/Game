const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const messageEl = document.getElementById("message");

const TAU = Math.PI * 2;
const ringCount = 5;

let width = 0;
let height = 0;
let centerX = 0;
let centerY = 0;
let planetRadius = 46;
let rings = [];
let bgStars = [];
let dust = [];

let lastTime = 0;
let state = "waiting";
let score = 0;
let lives = 3;
let level = 1;
let flash = 0;
let shake = 0;
let invulnerable = 0;

const player = {
  lane: 0,
  angle: -Math.PI / 2,
  speed: 1.15,
  radius: 8,
};

let hazards = [];
let bonusStar = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function angleDistance(a, b) {
  let diff = Math.abs((a - b) % TAU);
  return diff > Math.PI ? TAU - diff : diff;
}

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  width = Math.floor(window.innerWidth);
  height = Math.floor(window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  centerX = width / 2;
  centerY = height / 2 + Math.min(24, height * 0.03);

  const maxRadius = Math.min(width, height) * 0.41;
  const inner = Math.max(72, Math.min(width, height) * 0.16);
  const spacing = (maxRadius - inner) / (ringCount - 1);
  rings = Array.from({ length: ringCount }, (_, i) => inner + i * spacing);
  planetRadius = Math.max(34, inner * 0.52);

  makeBackground();
}

function makeBackground() {
  const starCount = Math.floor(clamp((width * height) / 4300, 85, 260));
  bgStars = Array.from({ length: starCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: rand(0.45, 1.85),
    twinkle: rand(0, TAU),
    speed: rand(0.25, 1.2),
  }));

  dust = Array.from({ length: 26 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: rand(24, 90),
    drift: rand(-0.06, 0.06),
    alpha: rand(0.018, 0.055),
  }));
}

function startGame() {
  state = "running";
  score = 0;
  lives = 3;
  level = 1;
  player.angle = -Math.PI / 2;
  player.lane = 0;
  invulnerable = 1.0;
  flash = 0;
  shake = 0;
  makeHazards();
  placeBonusStar();
  updateHud("Cross the rings. Don't crash.");
}

function restartAfterGameOver() {
  startGame();
}

function makeHazards() {
  const speedScale = 1 + (level - 1) * 0.09;
  hazards = [];

  for (let lane = 0; lane < ringCount; lane++) {
    const count = lane === 0 ? 1 : 1 + (level > 4 && Math.random() < 0.42 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const direction = lane % 2 === 0 ? 1 : -1;
      hazards.push({
        lane,
        angle: rand(0, TAU),
        speed: direction * rand(0.5, 0.9 + lane * 0.08) * speedScale,
        size: rand(10, 15),
        wobble: rand(0, TAU),
      });
    }
  }
}

function placeBonusStar() {
  bonusStar = {
    lane: Math.floor(rand(1, ringCount - 1)),
    angle: rand(0, TAU),
    speed: rand(-0.18, 0.18),
    pulse: rand(0, TAU),
  };
}

function updateHud(text) {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
  if (text) messageEl.textContent = text;
}

function handleTap(event) {
  event.preventDefault();

  if (state === "waiting") {
    startGame();
    return;
  }

  if (state === "gameover") {
    restartAfterGameOver();
    return;
  }

  if (state !== "running") return;

  player.lane += 1;
  flash = 0.2;

  if (player.lane >= ringCount) {
    score += 1;
    level += 1;
    player.lane = 0;
    invulnerable = 0.9;
    makeHazards();
    placeBonusStar();
    updateHud("Clear! Again.");
  } else {
    updateHud("Good. Keep crossing.");
  }
}

function crash() {
  if (invulnerable > 0 || state !== "running") return;

  lives -= 1;
  shake = 0.42;
  flash = 0.55;
  player.lane = 0;
  player.angle -= 0.2;
  invulnerable = 1.1;

  if (lives <= 0) {
    state = "gameover";
    updateHud(`Game over. Score ${score}. Tap to restart.`);
  } else {
    updateHud("Crash. Back to the inner ring.");
  }
}

function update(dt) {
  const timeScale = state === "running" ? 1 : 0.35;

  for (const star of bgStars) {
    star.twinkle += dt * star.speed;
  }

  for (const puff of dust) {
    puff.x += puff.drift * dt * 20;
    if (puff.x < -puff.r) puff.x = width + puff.r;
    if (puff.x > width + puff.r) puff.x = -puff.r;
  }

  if (flash > 0) flash = Math.max(0, flash - dt);
  if (shake > 0) shake = Math.max(0, shake - dt);
  if (invulnerable > 0) invulnerable = Math.max(0, invulnerable - dt);

  player.angle = (player.angle + player.speed * dt * timeScale) % TAU;

  for (const hazard of hazards) {
    hazard.angle = (hazard.angle + hazard.speed * dt * timeScale) % TAU;
    hazard.wobble += dt * 3;
  }

  if (bonusStar) {
    bonusStar.angle = (bonusStar.angle + bonusStar.speed * dt * timeScale) % TAU;
    bonusStar.pulse += dt * 4;
  }

  if (state !== "running") return;

  checkBonusStar();
  checkHazards();
}

function checkBonusStar() {
  if (!bonusStar || bonusStar.lane !== player.lane) return;

  const diff = angleDistance(player.angle, bonusStar.angle);
  if (diff < 0.12) {
    score += 3;
    flash = 0.34;
    placeBonusStar();
    updateHud("Star bonus +3.");
  }
}

function checkHazards() {
  for (const hazard of hazards) {
    if (hazard.lane !== player.lane) continue;

    const ringRadius = rings[hazard.lane];
    const angularHitBox = hazard.size / ringRadius + 0.08;
    if (angleDistance(player.angle, hazard.angle) < angularHitBox) {
      crash();
      return;
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, width, height);

  const shakeX = shake > 0 ? rand(-shake * 10, shake * 10) : 0;
  const shakeY = shake > 0 ? rand(-shake * 10, shake * 10) : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawNebula();
  drawOrbitGlow();
  drawPlanet();
  drawBonusStar();
  drawHazards();
  drawPlayer();

  ctx.restore();

  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = flash * 0.22;
    ctx.fillStyle = "#dff8ff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawBackground() {
  const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(width, height));
  gradient.addColorStop(0, "#14275d");
  gradient.addColorStop(0.28, "#081331");
  gradient.addColorStop(0.62, "#030713");
  gradient.addColorStop(1, "#000106");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (const star of bgStars) {
    const alpha = 0.35 + Math.sin(star.twinkle) * 0.24;
    ctx.globalAlpha = clamp(alpha, 0.1, 0.88);
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawNebula() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const puff of dust) {
    const gradient = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, puff.r);
    gradient.addColorStop(0, `rgba(108, 198, 255, ${puff.alpha})`);
    gradient.addColorStop(0.48, `rgba(160, 84, 255, ${puff.alpha * 0.65})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.r, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function drawOrbitGlow() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  rings.forEach((radius, lane) => {
    const pulse = 0.5 + Math.sin(performance.now() / 620 + lane) * 0.15;
    ctx.lineWidth = lane === player.lane ? 3.2 : 1.4;
    ctx.strokeStyle = lane === player.lane
      ? `rgba(141, 236, 255, ${0.55 + pulse * 0.25})`
      : "rgba(125, 195, 255, 0.22)";
    ctx.shadowBlur = lane === player.lane ? 24 : 10;
    ctx.shadowColor = "rgba(117, 225, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, TAU);
    ctx.stroke();
  });

  ctx.restore();
}

function drawPlanet() {
  ctx.save();

  const glow = ctx.createRadialGradient(centerX, centerY, planetRadius * 0.7, centerX, centerY, planetRadius * 2.6);
  glow.addColorStop(0, "rgba(98, 220, 255, 0.22)");
  glow.addColorStop(1, "rgba(98, 220, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, planetRadius * 2.6, 0, TAU);
  ctx.fill();

  const planet = ctx.createRadialGradient(centerX - planetRadius * 0.35, centerY - planetRadius * 0.45, 2, centerX, centerY, planetRadius * 1.15);
  planet.addColorStop(0, "#a7f6ff");
  planet.addColorStop(0.22, "#4bb7ff");
  planet.addColorStop(0.58, "#193983");
  planet.addColorStop(1, "#05091e");
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(centerX, centerY, planetRadius, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + i * planetRadius * 0.18, planetRadius * 0.82, planetRadius * 0.12, 0, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

function pointOnRing(lane, angle) {
  const radius = rings[lane];
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function drawPlayer() {
  if (state === "waiting") return;

  const p = pointOnRing(player.lane, player.angle);
  const blink = invulnerable > 0 ? 0.46 + Math.sin(performance.now() / 70) * 0.34 : 1;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = blink;

  const tailAngle = player.angle - 0.18;
  const tail = pointOnRing(player.lane, tailAngle);
  const tailGradient = ctx.createLinearGradient(tail.x, tail.y, p.x, p.y);
  tailGradient.addColorStop(0, "rgba(76, 216, 255, 0)");
  tailGradient.addColorStop(1, "rgba(221, 252, 255, 0.86)");
  ctx.strokeStyle = tailGradient;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();

  ctx.shadowBlur = 26;
  ctx.shadowColor = "#bff8ff";
  ctx.fillStyle = "#f4feff";
  ctx.beginPath();
  ctx.arc(p.x, p.y, player.radius, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = blink * 0.38;
  ctx.beginPath();
  ctx.arc(p.x, p.y, player.radius * 2.8, 0, TAU);
  ctx.fillStyle = "#65ddff";
  ctx.fill();

  ctx.restore();
}

function drawHazards() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const hazard of hazards) {
    const p = pointOnRing(hazard.lane, hazard.angle);
    const wobbleSize = hazard.size + Math.sin(hazard.wobble) * 1.6;

    ctx.shadowBlur = 18;
    ctx.shadowColor = "rgba(255, 103, 103, 0.9)";
    ctx.fillStyle = "rgba(255, 82, 111, 0.92)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, wobbleSize, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(p.x, p.y, wobbleSize * 1.9, 0, TAU);
    ctx.fillStyle = "rgba(255, 80, 120, 0.72)";
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawBonusStar() {
  if (!bonusStar || state === "waiting") return;

  const p = pointOnRing(bonusStar.lane, bonusStar.angle);
  const radius = 8 + Math.sin(bonusStar.pulse) * 1.8;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 22;
  ctx.shadowColor = "rgba(255, 232, 138, 0.9)";
  ctx.fillStyle = "#ffe991";

  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const r = i % 2 === 0 ? radius : radius * 0.43;
    const x = p.x + Math.cos(a) * r;
    const y = p.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", handleTap, { passive: false });
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    handleTap(event);
  }
});

document.addEventListener("gesturestart", (event) => event.preventDefault());

resize();
makeHazards();
placeBonusStar();
updateHud("Tap to begin");
requestAnimationFrame(loop);
