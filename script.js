(() => {
    "use strict";

    // ---------- Canvas setup ----------
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const LOGICAL_W = 400;
    const LOGICAL_H = 600;

    function fitCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = LOGICAL_W * dpr;
        canvas.height = LOGICAL_H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    fitCanvas();
    window.addEventListener("resize", fitCanvas);

    // ---------- Assets ----------
    const shipImg = new Image();
    const missileImg = new Image();
    const ufoImg = new Image();
    shipImg.src = "Fighterjet.png";
    missileImg.src = "missile.jpeg";
    ufoImg.src = "Ufo.jpeg";

    let assetsReady = false;
    Promise.all([shipImg, missileImg, ufoImg].map(img => new Promise(res => {
        if (img.complete) return res();
        img.onload = res;
        img.onerror = res;
    }))).then(() => {
        assetsReady = true;
        startBtn.textContent = "LAUNCH MISSION";
        startBtn.disabled = false;
    });

    // ---------- DOM refs ----------
    const scoreEl = document.getElementById("score");
    const livesEl = document.getElementById("lives");
    const levelEl = document.getElementById("level");
    const powerupBanner = document.getElementById("powerupBanner");

    const startScreen = document.getElementById("startScreen");
    const pauseScreen = document.getElementById("pauseScreen");
    const gameOverScreen = document.getElementById("gameOverScreen");
    const startBtn = document.getElementById("startBtn");
    const resumeBtn = document.getElementById("resumeBtn");
    const restartBtn = document.getElementById("restartBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const finalScoreEl = document.getElementById("finalScore");
    const hiscoreStartEl = document.getElementById("hiscoreStart");
    const hiscoreEndEl = document.getElementById("hiscoreEnd");

    const btnLeft = document.getElementById("btnLeft");
    const btnRight = document.getElementById("btnRight");
    const btnFire = document.getElementById("btnFire");

    startBtn.disabled = true;
    startBtn.textContent = "LOADING...";

    // ---------- High score ----------
    const HS_KEY = "voidInterceptorHighScore";
    let highScore = Number(localStorage.getItem(HS_KEY) || 0);
    hiscoreStartEl.textContent = highScore;

    // ---------- Game state ----------
    let state = "start"; // start | playing | paused | gameover
    let score = 0;
    let level = 1;
    let lives = 3;
    let last = 0;
    let spawnTimer = 0;
    let shakeTime = 0;
    let shakeMag = 0;
    let rapidUntil = 0;

    const keys = { left: false, right: false };

    const player = {
        x: LOGICAL_W / 2 - 20,
        y: LOGICAL_H - 70,
        w: 40,
        h: 50,
        vx: 0,
        tilt: 0,
        cooldown: 0,
        invincibleUntil: 0,
        thrusterTimer: 0
    };

    let bullets = [];
    let enemies = [];
    let enemyBullets = [];
    let particles = [];
    let powerups = [];
    let dust = [];

    for (let i = 0; i < 46; i++) {
        dust.push({
            x: Math.random() * LOGICAL_W,
            y: Math.random() * LOGICAL_H,
            depth: 0.3 + Math.random() * 0.9,
            r: Math.random() * 1.6 + 0.4
        });
    }

    // ---------- Helpers ----------
    function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function spawnParticles(x, y, color, count, spread = 90, life = 500) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * spread;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life,
                maxLife: life,
                color,
                size: Math.random() * 3 + 1.5
            });
        }
    }

    function triggerShake(mag, time) {
        shakeMag = Math.max(shakeMag, mag);
        shakeTime = Math.max(shakeTime, time);
    }

    function updateHUD() {
        scoreEl.textContent = score;
        levelEl.textContent = level;
        livesEl.textContent = "❤".repeat(Math.max(lives, 0)) + "🖤".repeat(Math.max(3 - lives, 0));
    }

    function resetGame() {
        score = 0;
        level = 1;
        lives = 3;
        bullets = [];
        enemies = [];
        enemyBullets = [];
        particles = [];
        powerups = [];
        player.x = LOGICAL_W / 2 - 20;
        player.vx = 0;
        player.cooldown = 0;
        player.invincibleUntil = 0;
        rapidUntil = 0;
        spawnTimer = 900;
        updateHUD();
    }

    // ---------- Input ----------
    document.addEventListener("keydown", e => {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = true;
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = true;
        if (e.key === " ") { e.preventDefault(); if (state === "playing") shoot(); }
        if (e.key === "p" || e.key === "P") togglePause();
        if ((e.key === "Enter") && state === "start" && assetsReady) beginGame();
    });
    document.addEventListener("keyup", e => {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = false;
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = false;
    });

    function bindHold(el, onDown, onUp) {
        el.addEventListener("pointerdown", e => { e.preventDefault(); onDown(); });
        el.addEventListener("pointerup", () => onUp());
        el.addEventListener("pointerleave", () => onUp());
        el.addEventListener("pointercancel", () => onUp());
    }
    bindHold(btnLeft, () => keys.left = true, () => keys.left = false);
    bindHold(btnRight, () => keys.right = true, () => keys.right = false);
    bindHold(btnFire, () => { if (state === "playing") shoot(); }, () => {});

    startBtn.addEventListener("click", () => { if (assetsReady) beginGame(); });
    restartBtn.addEventListener("click", () => beginGame());
    resumeBtn.addEventListener("click", togglePause);
    pauseBtn.addEventListener("click", togglePause);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden && state === "playing") togglePause();
    });

    function beginGame() {
        resetGame();
        state = "playing";
        startScreen.classList.add("hidden");
        gameOverScreen.classList.add("hidden");
        pauseScreen.classList.add("hidden");
        last = performance.now();
        requestAnimationFrame(loop);
    }

    function togglePause() {
        if (state === "playing") {
            state = "paused";
            pauseScreen.classList.remove("hidden");
        } else if (state === "paused") {
            state = "playing";
            pauseScreen.classList.add("hidden");
            last = performance.now();
            requestAnimationFrame(loop);
        }
    }

    function endGame() {
        state = "gameover";
        if (score > highScore) {
            highScore = score;
            localStorage.setItem(HS_KEY, String(highScore));
        }
        finalScoreEl.textContent = score;
        hiscoreEndEl.textContent = highScore;
        gameOverScreen.classList.remove("hidden");
    }

    // ---------- Actions ----------
    function shoot() {
        if (player.cooldown > 0) return;
        const rapid = performance.now() < rapidUntil;
        player.cooldown = rapid ? 110 : 260;
        bullets.push({
            x: player.x + player.w / 2 - 6,
            y: player.y - 6,
            w: 12, h: 26,
            vy: -420
        });
        if (rapid) {
            bullets.push({ x: player.x + 4, y: player.y + 6, w: 10, h: 20, vy: -400 });
            bullets.push({ x: player.x + player.w - 14, y: player.y + 6, w: 10, h: 20, vy: -400 });
        }
        spawnParticles(player.x + player.w / 2, player.y + player.h - 4, "255,205,120", 4, 40, 220);
    }

    function damagePlayer() {
        if (performance.now() < player.invincibleUntil) return;
        lives -= 1;
        player.invincibleUntil = performance.now() + 1600;
        triggerShake(10, 260);
        spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "255,80,80", 26, 160, 500);
        updateHUD();
        if (lives <= 0) {
            spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "255,220,140", 40, 220, 700);
            setTimeout(endGame, 250);
        }
    }

    function spawnEnemy() {
        const shooter = level >= 2 && Math.random() < 0.25;
        enemies.push({
            x: 20 + Math.random() * (LOGICAL_W - 40),
            baseX: 0,
            y: -30,
            depth: 0,
            hp: shooter ? 2 : 1,
            shooter,
            swayPhase: Math.random() * Math.PI * 2,
            swayAmp: 20 + Math.random() * 30,
            shootTimer: 900 + Math.random() * 1200,
            speed: 55 + level * 8 + Math.random() * 20
        });
    }

    function spawnPowerup(x, y) {
        powerups.push({ x, y, vy: 90 });
    }

    // ---------- Update ----------
    function update(dt) {
        const now = performance.now();

        // difficulty
        level = 1 + Math.floor(score / 60);
        const spawnInterval = Math.max(1400 - level * 110, 480);
        spawnTimer += dt * 1000;
        if (spawnTimer > spawnInterval) {
            spawnTimer = 0;
            spawnEnemy();
        }

        // player movement (velocity + easing)
        const accel = 1400, maxSpeed = 260, friction = 1600;
        if (keys.left && !keys.right) player.vx -= accel * dt;
        else if (keys.right && !keys.left) player.vx += accel * dt;
        else {
            if (player.vx > 0) player.vx = Math.max(0, player.vx - friction * dt);
            else if (player.vx < 0) player.vx = Math.min(0, player.vx + friction * dt);
        }
        player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
        player.x += player.vx * dt;
        if (player.x < 4) { player.x = 4; player.vx = 0; }
        if (player.x > LOGICAL_W - player.w - 4) { player.x = LOGICAL_W - player.w - 4; player.vx = 0; }
        player.tilt = Math.max(-0.35, Math.min(0.35, player.vx / maxSpeed * 0.35));

        if (player.cooldown > 0) player.cooldown -= dt * 1000;

        // thruster particles
        player.thrusterTimer -= dt * 1000;
        if (player.thrusterTimer <= 0) {
            player.thrusterTimer = 40;
            spawnParticles(player.x + player.w / 2 + (Math.random() * 6 - 3), player.y + player.h - 2, "120,200,255", 2, 30, 260);
        }

        // bullets
        bullets.forEach(b => b.y += b.vy * dt);
        bullets = bullets.filter(b => b.y + b.h > -20);

        // enemy bullets
        enemyBullets.forEach(b => b.y += b.vy * dt);
        enemyBullets = enemyBullets.filter(b => b.y < LOGICAL_H + 20);

        // enemies
        enemies.forEach(en => {
            en.depth = Math.min(1, en.depth + dt * 0.32);
            const scale = 0.35 + en.depth * 0.75;
            en.scale = scale;
            en.y += en.speed * (0.5 + en.depth) * dt;
            en.swayPhase += dt * 2;
            en.drawX = en.x + Math.sin(en.swayPhase) * en.swayAmp * (1 - en.depth * 0.4);

            if (en.shooter) {
                en.shootTimer -= dt * 1000;
                if (en.shootTimer <= 0 && en.y > 20 && en.y < LOGICAL_H - 80) {
                    en.shootTimer = 1400 + Math.random() * 900;
                    enemyBullets.push({ x: en.drawX, y: en.y + 16 * scale, vy: 200 + level * 8 });
                }
            }
        });

        // enemy reaches bottom
        enemies = enemies.filter(en => {
            if (en.y > LOGICAL_H + 20) {
                damagePlayer();
                return false;
            }
            return true;
        });

        // powerups
        powerups.forEach(p => p.y += p.vy * dt);
        powerups = powerups.filter(p => p.y < LOGICAL_H + 20);

        // particles
        particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 1000;
        });
        particles = particles.filter(p => p.life > 0);

        // dust parallax
        dust.forEach(d => {
            d.y += d.depth * 60 * dt;
            if (d.y > LOGICAL_H) { d.y = -2; d.x = Math.random() * LOGICAL_W; }
        });

        // --- collisions: bullets vs enemies ---
        for (let i = enemies.length - 1; i >= 0; i--) {
            const en = enemies[i];
            const size = 40 * en.scale;
            const ex = en.drawX - size / 2, ey = en.y - size / 2;
            for (let j = bullets.length - 1; j >= 0; j--) {
                const b = bullets[j];
                if (rectsOverlap(b.x, b.y, b.w, b.h, ex, ey, size, size)) {
                    bullets.splice(j, 1);
                    en.hp -= 1;
                    spawnParticles(b.x, b.y, "180,255,255", 6, 60, 220);
                    if (en.hp <= 0) {
                        spawnParticles(en.drawX, en.y, "255,150,60", 22, 180, 520);
                        triggerShake(4, 120);
                        score += en.shooter ? 18 : 10;
                        if (Math.random() < 0.16) spawnPowerup(en.drawX, en.y);
                        enemies.splice(i, 1);
                        updateHUD();
                    }
                    break;
                }
            }
        }

        // --- collisions: enemies vs player ---
        if (now >= player.invincibleUntil) {
            for (let i = enemies.length - 1; i >= 0; i--) {
                const en = enemies[i];
                const size = 40 * en.scale;
                const ex = en.drawX - size / 2, ey = en.y - size / 2;
                if (rectsOverlap(ex, ey, size, size, player.x, player.y, player.w, player.h)) {
                    spawnParticles(en.drawX, en.y, "255,150,60", 18, 160, 420);
                    enemies.splice(i, 1);
                    damagePlayer();
                    break;
                }
            }
        }

        // --- collisions: enemy bullets vs player ---
        if (now >= player.invincibleUntil) {
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const b = enemyBullets[i];
                if (rectsOverlap(b.x - 4, b.y - 8, 8, 16, player.x, player.y, player.w, player.h)) {
                    enemyBullets.splice(i, 1);
                    damagePlayer();
                    break;
                }
            }
        }

        // --- collisions: powerups vs player ---
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            if (rectsOverlap(p.x - 10, p.y - 10, 20, 20, player.x, player.y, player.w, player.h)) {
                powerups.splice(i, 1);
                rapidUntil = now + 5000;
                powerupBanner.classList.remove("hidden");
                void powerupBanner.offsetWidth;
                powerupBanner.style.animation = "none";
                requestAnimationFrame(() => { powerupBanner.style.animation = ""; });
            }
        }

        if (shakeTime > 0) shakeTime -= dt * 1000;
    }

    // ---------- Draw ----------
    function drawGlowImage(img, x, y, w, h, rotation, glowColor, glowBlur) {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(rotation);
        if (glowColor) {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = glowBlur;
        }
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }

    function draw() {
        ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

        ctx.save();
        if (shakeTime > 0) {
            const m = shakeMag * (shakeTime / 260);
            ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
        }

        // dust parallax
        dust.forEach(d => {
            ctx.globalAlpha = 0.25 + d.depth * 0.4;
            ctx.fillStyle = "#bfe9ff";
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // powerups
        powerups.forEach(p => {
            const pulse = 1 + Math.sin(performance.now() / 120) * 0.08;
            ctx.save();
            ctx.shadowColor = "#4de8ff";
            ctx.shadowBlur = 18;
            ctx.fillStyle = "rgba(77,232,255,0.25)";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#bff6ff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = "#eafcff";
            ctx.font = "bold 11px Orbitron, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("R", p.x, p.y + 1);
            ctx.restore();
        });

        // enemy bullets
        enemyBullets.forEach(b => {
            ctx.save();
            ctx.shadowColor = "#ff3b4e";
            ctx.shadowBlur = 12;
            ctx.fillStyle = "#ff8a90";
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, 3.5, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // enemies (far -> near, so draw in current array order which is spawn order; smaller ones drawn first naturally since depth grows over time is fine)
        enemies.slice().sort((a, b) => a.depth - b.depth).forEach(en => {
            const size = 40 * en.scale;
            const alpha = 0.55 + en.depth * 0.45;
            ctx.save();
            ctx.globalAlpha = alpha;
            drawGlowImage(ufoImg, en.drawX - size / 2, en.y - size / 2, size, size,
                Math.sin(en.swayPhase) * 0.15, en.shooter ? "#ff3b4e" : "#b06bff", 14 * en.scale);
            ctx.restore();
        });

        // bullets (player)
        bullets.forEach(b => {
            ctx.save();
            ctx.shadowColor = "#ffcf6b";
            ctx.shadowBlur = 14;
            ctx.drawImage(missileImg, b.x, b.y, b.w, b.h);
            ctx.restore();
        });

        // particles
        particles.forEach(p => {
            const t = p.life / p.maxLife;
            ctx.globalAlpha = Math.max(t, 0);
            ctx.fillStyle = `rgba(${p.color},${t})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * t + 0.5, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // player
        const now = performance.now();
        const blinking = now < player.invincibleUntil && Math.floor(now / 100) % 2 === 0;
        if (!blinking) {
            ctx.save();
            // drop shadow beneath ship for depth
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.ellipse(player.x + player.w / 2, player.y + player.h + 6, player.w * 0.4, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const rapid = now < rapidUntil;
            drawGlowImage(shipImg, player.x, player.y, player.w, player.h, player.tilt,
                rapid ? "#4de8ff" : "#6fd3ff", rapid ? 20 : 10);
            ctx.restore();
        }

        ctx.restore();
    }

    // ---------- Loop ----------
    function loop(ts) {
        if (state !== "playing") return;
        let dt = (ts - last) / 1000;
        last = ts;
        dt = Math.min(dt, 0.05);

        update(dt);
        draw();

        if (state === "playing") requestAnimationFrame(loop);
    }

    // idle render of start screen background
    function idleDraw() {
        draw();
        if (state === "start" || state === "gameover") requestAnimationFrame(idleDraw);
    }
    requestAnimationFrame(idleDraw);

    updateHUD();
})();