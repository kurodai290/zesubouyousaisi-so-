(() => {
  "use strict";
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const W = canvas.width, H = canvas.height;
  const GRAVITY = 620;
  const TOTAL_STAGES = 8;
  const stageNames = [
    "上の2段の足場が動く",
    "白い足場が動く",
    "剣を避けよう。途中でゴールが落ちてくる",
    "波打つ足場を渡る（仮）",
    "傾いた足場を乗り継ぐ（仮）",
    "動く足場と障害物（仮）",
    "点状の障害物を避ける（仮）",
    "複数の障害物を越えてゴールへ（仮）"
  ];
  const stageLayouts = [
    { ball:[105,150], goal:[850,440], platforms:[
      [125,190,205,0.02,"moving"], [300,270,180,-0.10,"moving"], [520,360,230,0.08,"fixed"], [700,455,200,0,"fixed"]
    ]},
    { ball:[125,390], goal:[480,250], platforms:[
      [470,440,300,0,"bowl"], [250,285,180,0,"moving"], [670,280,180,0,"moving"]
    ]},
    { ball:[110,435], goal:[800,180], platforms:[
      [480,450,300,0,"moving"], [650,315,180,-0.1,"fixed"]
    ]},
    { ball:[110,170], goal:[830,440], platforms:[
      [180,210,160,0.12,"fixed"], [350,285,170,-0.18,"moving"], [560,355,170,0.15,"fixed"], [760,420,160,-0.12,"moving"]
    ]},
    { ball:[100,130], goal:[830,440], platforms:[
      [210,180,190,-0.20,"fixed"], [440,270,190,0.16,"moving"], [680,355,190,-0.17,"fixed"], [800,430,120,0.1,"fixed"]
    ]},
    { ball:[100,360], goal:[850,410], platforms:[
      [220,400,210,-0.08,"moving"], [460,310,180,0.16,"fixed"], [680,380,190,-0.12,"moving"]
    ]},
    { ball:[100,90], goal:[480,465], platforms:[
      [200,170,160,0,"fixed"], [360,250,160,0,"fixed"], [520,330,160,0,"fixed"], [680,410,160,0,"fixed"]
    ]},
    { ball:[110,370], goal:[850,420], platforms:[
      [260,390,210,-0.10,"moving"], [500,320,200,0.10,"moving"], [710,400,220,-0.08,"fixed"]
    ]}
  ];

  let stage = 0, lives = 2, score = 0, timeLeft = 120, playing = false, ended = false;
  let ball, goal, platforms, swords, spikes, particles, stageTime = 0, lastTime = 0;
  let tiltInput = 0, tilt = 0, goalFalling = false, goalFallTimer = 0;
  const keys = new Set();

  function initStage(index, preserveLives = true) {
    stage = index;
    if (!preserveLives) lives = 2;
    const def = stageLayouts[stage];
    ball = { x:def.ball[0], y:def.ball[1], vx:0, vy:0, r:9, grounded:false };
    goal = { x:def.goal[0], y:def.goal[1], r:16, active:true, vy:0 };
    platforms = def.platforms.map((p,i) => ({
      x:p[0], y:p[1], len:p[2], angle:p[3], baseAngle:p[3], type:p[4], phase:i*1.3,
      baseX:p[0], baseY:p[1], prevAngle:p[3]
    }));
    swords = []; spikes = []; particles = [];
    stageTime = 0; tilt = 0; tiltInput = 0; goalFalling = false; goalFallTimer = 0;
    if (stage === 2) {
      for (let i=0;i<4;i++) swords.push({x:230+i*165,y:-40-i*105,vy:130+i*12,active:true,phase:i*.8});
    }
    if (stage === 5) {
      for (let i=0;i<5;i++) spikes.push({x:300+i*115,y:245+(i%2)*75,r:8});
    }
    if (stage === 6) {
      for (let x=160;x<830;x+=42) for (let y=90;y<390;y+=42) spikes.push({x,y,r:3.2,dot:true});
    }
    updateHUD();
    $("stage-note").textContent = `STAGE ${stage+1}：${stageNames[stage]}`;
  }
  function resetGame() {
    score=0; timeLeft=120; ended=false; playing=true; lives=2;
    initStage(0,false); hideOverlay(); lastTime=performance.now();
  }
  function showOverlay(title, text, buttonText, action) {
    $("overlay-title").textContent=title;
    $("overlay-text").textContent=text;
    $("main-button").textContent=buttonText;
    $("overlay").classList.remove("hidden");
    $("main-button").onclick=action;
  }
  function hideOverlay(){ $("overlay").classList.add("hidden"); }
  function updateHUD() {
    $("step").textContent = `${stage+1}/${TOTAL_STAGES}`;
    $("lives").textContent = "● ".repeat(Math.max(0,lives)).trim() || "—";
    $("score").textContent = `${String(score).padStart(3,"0")}/100`;
    $("timer").textContent = Math.max(0,timeLeft).toFixed(2);
  }
  function loseLife(message) {
    if (!playing || ended) return;
    lives--;
    if (lives <= 0) {
      lives=0; playing=false; ended=true; updateHUD();
      showOverlay("GAME OVER", message || "ライフがなくなりました。", "もう一度遊ぶ", resetGame);
    } else {
      ball.x=110; ball.y=Math.max(95, platforms[0]?.y-35 || 130); ball.vx=0; ball.vy=0;
      updateHUD();
    }
  }
  function completeStage() {
    if (!playing || ended) return;
    score=Math.min(100,score+10);
    updateHUD();
    playing=false;
    if (stage >= TOTAL_STAGES-1) {
      ended=true;
      showOverlay("ALL CLEAR", `全8ステージクリア！ SCORE ${String(score).padStart(3,"0")}/100`, "最初から遊ぶ", resetGame);
    } else {
      showOverlay(`STEP ${stage+1} CLEAR`, "ゴール到達！ 次のステージへ進みます。", "次のステージ", () => { initStage(stage+1,true); playing=true; hideOverlay(); lastTime=performance.now(); });
    }
  }
  function lineFor(p) {
    const half=p.len/2;
    return {x1:p.x-Math.cos(p.angle)*half,y1:p.y-Math.sin(p.angle)*half,
            x2:p.x+Math.cos(p.angle)*half,y2:p.y+Math.sin(p.angle)*half};
  }
  function update(dt) {
    if (!playing) return;
    stageTime += dt; timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft=0; playing=false; ended=true; updateHUD();
      showOverlay("TIME UP", "制限時間がなくなりました。", "もう一度遊ぶ", resetGame); return;
    }
    tiltInput=(keys.has("ArrowLeft")?-1:0)+(keys.has("ArrowRight")?1:0);
    tilt += (tiltInput*0.62-tilt)*Math.min(1,dt*4);
    platforms.forEach((p,i) => {
      p.prevAngle=p.angle;
      p.angle=p.baseAngle + tilt*(p.type==="fixed"?0.28:0.52);
      if (p.type==="moving") {
        p.y=p.baseY+Math.sin(stageTime*1.3+p.phase)*20;
        p.angle += Math.sin(stageTime*1.5+p.phase)*0.11;
      }
      if (stage===1 && p.type==="bowl") p.angle=tilt*0.55;
    });
    if (stage===2) {
      swords.forEach(s => {
        if (!s.active) return;
        s.y += s.vy*dt;
        s.x += Math.sin(stageTime*3+s.phase)*20*dt;
        if (Math.abs(ball.x-s.x)<13 && Math.abs(ball.y-s.y)<24) {
          s.active=false; loseLife("剣に当たりました。ライフが1つ減りました。");
        }
        if (s.y>H+40) { s.y=-35; s.x=90+Math.random()*780; }
      });
      if (stageTime>17 && !goalFalling) { goalFalling=true; goal.y=-25; goal.vy=35; }
      if (goalFalling) { goal.vy+=150*dt; goal.y+=goal.vy*dt; if(goal.y>220){goal.y=220;goal.vy=0;} }
    }
    if (stage===5) spikes.forEach(s => { s.y += Math.sin(stageTime*2+s.x)*0.25; });
    if (stage===6) { /* static dotted hazard field */ }
    ball.vy += GRAVITY*dt;
    ball.vx += tilt*150*dt;
    ball.vx *= Math.pow(0.993,dt*60);
    ball.x += ball.vx*dt; ball.y += ball.vy*dt;
    ball.grounded=false;

    // Platform collisions: nearest point on each segment.
    for (const p of platforms) {
      const l=lineFor(p), dx=l.x2-l.x1, dy=l.y2-l.y1;
      const len2=dx*dx+dy*dy;
      let t=((ball.x-l.x1)*dx+(ball.y-l.y1)*dy)/len2; t=Math.max(0,Math.min(1,t));
      const px=l.x1+t*dx, py=l.y1+t*dy;
      const nx=ball.x-px, ny=ball.y-py, dist=Math.hypot(nx,ny);
      if (dist < ball.r+3 && ball.vy > -100) {
        const nlen=dist||1, normalX=nx/nlen, normalY=ny/nlen;
        ball.x=px+normalX*(ball.r+3); ball.y=py+normalY*(ball.r+3);
        if (ball.vy*normalY < 0) ball.vy = Math.abs(ball.vy)*0.12;
        ball.vx += Math.sin(p.angle)*80*dt;
        ball.grounded=true;
      }
    }
    // Stage 7's dot field and stage 6's spikes act as hazards.
    for (const s of spikes) {
      if (s.dot) {
        if (Math.hypot(ball.x-s.x,ball.y-s.y)<ball.r+s.r) { loseLife("障害物に触れました。"); break; }
      } else if (Math.hypot(ball.x-s.x,ball.y-s.y)<ball.r+s.r+2) { loseLife("障害物に触れました。"); break; }
    }
    if (stage===7 && stageTime>8) {
      // Decorative moving hazard beams are drawn; collision remains forgiving for this prototype.
    }
    if (stage===3 && ball.y>H-30) { loseLife("足場から落ちました。"); }
    if (ball.x<ball.r) { ball.x=ball.r; ball.vx=Math.abs(ball.vx)*0.35; }
    if (ball.x>W-ball.r) { ball.x=W-ball.r; ball.vx=-Math.abs(ball.vx)*0.35; }
    if (ball.y>H+35) loseLife("足場から落ちました。");
    if (goal.active && Math.hypot(ball.x-goal.x,ball.y-goal.y)<ball.r+goal.r) completeStage();
    updateHUD();
  }

  function drawPlatform(p) {
    const l=lineFor(p);
    ctx.save(); ctx.lineCap="round"; ctx.strokeStyle="#f4f7ff"; ctx.lineWidth=9;
    ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(l.x2,l.y2); ctx.stroke();
    ctx.restore();
  }
  function drawGoal() {
    if (!goal.active) return;
    ctx.save(); ctx.translate(goal.x,goal.y);
    ctx.strokeStyle="#f7f9ff"; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(-12,15); ctx.lineTo(-12,-14); ctx.lineTo(12,-14); ctx.lineTo(12,15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12,-14); ctx.lineTo(12,-14); ctx.stroke();
    ctx.font="bold 11px Arial"; ctx.textAlign="center"; ctx.fillStyle="#fff"; ctx.fillText("GOAL",0,-22);
    ctx.restore();
  }
  function drawSword(s) {
    if (!s.active) return;
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(Math.PI/4);
    ctx.fillStyle="#f6f8ff"; ctx.beginPath(); ctx.moveTo(0,-17); ctx.lineTo(4,-5); ctx.lineTo(2,10); ctx.lineTo(-2,10); ctx.lineTo(-4,-5); ctx.closePath(); ctx.fill();
    ctx.fillRect(-7,4,14,3); ctx.fillRect(-2,8,4,7); ctx.restore();
  }
  function drawSpikes() {
    for (const s of spikes) {
      ctx.fillStyle=s.dot?"#e7efff":"#fff";
      if(s.dot){ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
      else {ctx.beginPath();ctx.moveTo(s.x-s.r,s.y+s.r);ctx.lineTo(s.x,s.y-s.r);ctx.lineTo(s.x+s.r,s.y+s.r);ctx.closePath();ctx.fill();}
    }
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,0,H); grad.addColorStop(0,"#07101f"); grad.addColorStop(1,"#030711");
    ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
    // Subtle star/dot texture.
    ctx.fillStyle="#18253a";
    for(let i=0;i<48;i++){ const x=(i*197+31)%W, y=(i*113+23)%H; ctx.fillRect(x,y,1.5,1.5); }
    if (stage===6) {
      ctx.fillStyle="#e9f0ff";
      for(let x=110;x<890;x+=29) for(let y=65;y<435;y+=29) { ctx.beginPath();ctx.arc(x,y,1.7,0,Math.PI*2);ctx.fill(); }
    }
    platforms.forEach(drawPlatform);
    if(stage===2) swords.forEach(drawSword);
    drawSpikes();
    if(stage===7) {
      ctx.strokeStyle="#eaf0ff";ctx.lineWidth=2;
      for(let i=0;i<3;i++){
        const x=250+i*230, y=stageTime>0?250+Math.sin(stageTime*1.5+i)*25:250;
        ctx.beginPath();ctx.moveTo(x-32,y+12);ctx.lineTo(x,y-30);ctx.lineTo(x+32,y+12);ctx.stroke();
        for(let k=-1;k<=1;k++) {ctx.beginPath();ctx.moveTo(x+k*17,y-20);ctx.lineTo(x+k*17-5,y-29);ctx.stroke();}
      }
    }
    drawGoal();
    // Ball with tiny highlight.
    ctx.beginPath(); ctx.fillStyle="#fff"; ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle="#aebed8"; ctx.arc(ball.x-2.5,ball.y-3,2.1,0,Math.PI*2); ctx.fill();
    if(!playing && !ended && $("overlay").classList.contains("hidden")) {
      ctx.fillStyle="#fff";ctx.font="14px Arial";ctx.fillText("← / →",20,30);
    }
  }
  function frame(now) {
    const dt=Math.min(.032,(now-lastTime)/1000||0); lastTime=now;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  window.addEventListener("keydown", e => {
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    keys.add(e.key);
  });
  window.addEventListener("keyup", e => keys.delete(e.key));
  window.addEventListener("blur", () => keys.clear());
  $("main-button").onclick=resetGame;
  $("restart-button").addEventListener("click", () => {
    if (playing) { initStage(stage,true); playing=true; }
    else if (ended) resetGame();
    else { initStage(stage,true); playing=true; hideOverlay(); }
  });
  initStage(0,false);
  showOverlay("シーソーゲーム", "左右の矢印キーで足場を傾け、白いボールをGOALまで運ぼう。ライフと制限時間に注意！", "ゲームスタート", resetGame);
  lastTime=performance.now();
  requestAnimationFrame(frame);
})();