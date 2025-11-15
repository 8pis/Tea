(function(){
  const host = document.getElementById('tubeGame');
  if(!host) return;

  // ====== المسارات ======
  const BALL_SRC_BASE = 'img/ball';
  const QUESTIONS_DIR = 'الاسئلة/';
  const PERKS_DIR = 'الخواص/';        // ← مجلد الخواص بالعربي كما طلبت
  const PERK2_DIR = 'الصورة الثانية/';
  const NUKE_DIR  = 'نيوك/';

  // أنواع الملفات المقبولة
  const TRY_IMG = ['.png','.jpg','.jpeg','.webp','.gif','.avif','.svg'];
  const TRY_VID = ['.mp4','.webm','.ogg','.m4v','.mov','.mkv'];

  // عناصر التحكم
  const speedEl = document.getElementById('speed');
  const speedValEl = document.getElementById('speedVal');
  const sizeEl = document.getElementById('ballSize');
  const sizeValEl = document.getElementById('ballSizeVal');
  const pickPlayersDirBtn = document.getElementById('pickPlayersDir');
  const refreshPlayersBtn = document.getElementById('refreshPlayers');
  const startGameBtn = document.getElementById('startGameBtn');
  const pauseResumeBtn = document.getElementById('pauseResumeBtn');

  // قيم
  let SPEED = parseFloat(speedEl.value || '220');
  let BALL_SIZE_PCT = parseFloat(sizeEl.value || '100');
  let REVERSE = false;
  let PAUSED  = false;

  let playersDirHandle = null;
  const players=[];

  // ====== SVG و الرسم ======
  const TUBE_THICKNESS = 28;
  const BASE_BALL_REL_THICK = 0.68;
  const TRAIL_LENGTH = 22;
  const TRAIL_FADE = 0.92;

  const XLINK = "http://www.w3.org/1999/xlink";
  const svgNS = "http://www.w3.org/2000/svg";

  // صنع SVG
  const svg = document.createElementNS(svgNS,'svg');
  svg.classList.add('tube-svg');
  host.appendChild(svg);

  const defs = document.createElementNS(svgNS,'defs');
  svg.appendChild(defs);

  const tubeGroup = document.createElementNS(svgNS,'g');
  tubeGroup.classList.add('tube-glow');
  svg.appendChild(tubeGroup);

  const triPath = document.createElementNS(svgNS,'path');
  triPath.setAttribute('fill','none');
  triPath.setAttribute('stroke','var(--tube)');
  triPath.setAttribute('stroke-width',TUBE_THICKNESS);
  triPath.setAttribute('stroke-linejoin','round');
  tubeGroup.appendChild(triPath);

  const mask = document.createElementNS(svgNS,'mask');
  mask.id='tubeMask';
  const mBg=document.createElementNS(svgNS,'rect');
  mBg.setAttribute('width','100%');
  mBg.setAttribute('height','100%');
  mBg.setAttribute('fill','black');
  mask.appendChild(mBg);
  const mStroke=document.createElementNS(svgNS,'path');
  mStroke.setAttribute('fill','none');
  mStroke.setAttribute('stroke','white');
  mStroke.setAttribute('stroke-width',TUBE_THICKNESS);
  mStroke.setAttribute('stroke-linejoin','round');
  mask.appendChild(mStroke);
  defs.appendChild(mask);

  const trailG = document.createElementNS(svgNS,'g');
  trailG.setAttribute('mask','url(#tubeMask)');
  trailG.classList.add('trail-blur');
  svg.appendChild(trailG);

  const ballImg = document.createElementNS(svgNS,'image');
  ballImg.setAttribute('preserveAspectRatio','xMidYMid meet');
  ballImg.setAttribute('mask','url(#tubeMask)');
  svg.appendChild(ballImg);

  // ====== صندوق الأسئلة ======
  const qBox=document.createElement('div');
  qBox.className='question-box';
  const qInner=document.createElement('div');
  qInner.className='question-inner';
  const qImg=document.createElement('img');
  qImg.className='question-img';
  qInner.appendChild(qImg);
  qBox.appendChild(qInner);
  host.appendChild(qBox);

  // ====== نوافذ الميديا ======
  const dimmer=document.createElement('div');
  dimmer.className='modal-dim';
  const centerBox=document.createElement('div');
  centerBox.className='modal-center';
  dimmer.appendChild(centerBox);
  document.body.appendChild(dimmer);

  const fullOverlay=document.createElement('div');
  fullOverlay.className='modal-full';
  const fullVideo=document.createElement('video');
  fullVideo.autoplay=true;
  fullVideo.playsInline=true;
  fullVideo.controls=false;
  const winnerBanner=document.createElement('div');
  winnerBanner.className='winner-banner';
  fullOverlay.appendChild(fullVideo);
  fullOverlay.appendChild(winnerBanner);
  document.body.appendChild(fullOverlay);

  // ====== أدوات مساعدة ======
  function bust(url){ return url + (url.includes('?')?'&':'?') + 't=' + Date.now(); }

  async function canLoad(url){
    return new Promise(res=>{
      const i=new Image();
      i.onload=()=>res(true);
      i.onerror=()=>res(false);
      i.src=bust(url);
    });
  }

  async function resolveAuto(base,exts){
    for(const e of exts){
      const url = base + e;
      if(await canLoad(url)) return url;
    }
    return null;
  }

  async function resolveAnyFromDir(dir){
    const common = ['one','a','file','media','video','nuke'];
    for(const n of common){
      const vid=await resolveAuto(dir+n,TRY_VID);
      if(vid) return vid;
      const img=await resolveAuto(dir+n,TRY_IMG);
      if(img) return img;
    }
    for(let i=1;i<=50;i++){
      const vid=await resolveAuto(dir+i,TRY_VID);
      if(vid) return vid;
      const img=await resolveAuto(dir+i,TRY_IMG);
      if(img) return img;
    }
    return null;
  }

  // ====== تحميل صور الخواص 1/2/3 ======
  async function loadPerksImages(){
    const urls = await Promise.all([
      resolveAuto(PERKS_DIR+'1',TRY_IMG),
      resolveAuto(PERKS_DIR+'2',TRY_IMG),
      resolveAuto(PERKS_DIR+'3',TRY_IMG),
    ]);

    players.forEach(pl=>{
      pl.perks.forEach((pk,i)=>{
        const u = urls[i];
        if(u) pk.img.src = bust(u);
      });
    });
  }

  // ====== اللاعبين (صور + نقاط + خواص) ======
  const overlay=document.createElement('div');
  overlay.className='players-overlay';
  host.appendChild(overlay);

  function createPlayerSlots(){
    overlay.innerHTML='';
    players.length=0;

    for(let i=1;i<=3;i++){
      const slot=document.createElement('div');
      slot.className='player-slot';

      const avatar=document.createElement('img');
      avatar.className='avatar';

      const label=document.createElement('div');
      label.className='pname';
      label.textContent='Player '+i;

      const scoreWrap=document.createElement('div');
      scoreWrap.className='score-controls '+(i===3?'score-left':'score-right');

      const up=document.createElement('button');
      up.className='score-btn up';
      up.textContent='▲';

      const down=document.createElement('button');
      down.className='score-btn down';
      down.textContent='▼';

      const val=document.createElement('div');
      val.className='score-value';
      val.textContent='0';

      scoreWrap.appendChild(up);
      scoreWrap.appendChild(val);
      scoreWrap.appendChild(down);

      const perksRow=document.createElement('div');
      perksRow.className='perks-row ' + (i===3?'perks-left':'perks-right');

      const thresholds=[2,4,6];
      const perks = thresholds.map(t=>{
        const box=document.createElement('div');
        box.className='perk';
        const img=document.createElement('img');
        img.className='perk-img';
        box.appendChild(img);
        perksRow.appendChild(box);
        return {el:box,img,t};
      });

      slot.appendChild(avatar);
      slot.appendChild(label);
      slot.appendChild(scoreWrap);
      slot.appendChild(perksRow);
      overlay.appendChild(slot);

      const P={id:i,slot,avatar,label,score:0,valueEl:val,upBtn:up,downBtn:down,perksRow,perks};
      players.push(P);

      const refresh=()=>{
        P.valueEl.textContent=P.score;
        updatePerksState(P);
      };

      up.onclick = ()=>{P.score++; refresh();};
      down.onclick=()=>{P.score--; refresh();};

      // ضغط مربعات الخواص
      perks.forEach((pk,idx)=>{
        pk.el.onclick = async ()=>{
          if(!pk.el.classList.contains('on')) return;

          // تصفير النقاط بعد استخدام الخاصية
          P.score=0; refresh();

          if(idx===0){
            // المربع الأول: عكس اتجاه الكرة
            REVERSE=!REVERSE;

          }else if(idx===1){
            // المربع الثاني: إيقاف 3 ثواني + نافذة من مجلد "الصورة الثانية"
            PAUSED=true;
            const media=await resolveAnyFromDir(PERK2_DIR);
            if(media){
              const isVid=TRY_VID.some(x=>media.toLowerCase().endsWith(x));
              showCenterMedia(media,isVid);
            }
            setTimeout(()=>{
              hideCenter();
              PAUSED=false;
            },3000);

          }else if(idx===2){
            // المربع الثالث: نيوك – فيديو ملء الشاشة + اسم الفائز
            PAUSED=true;
            const nuke=await resolveAnyFromDir(NUKE_DIR);
            showFull(nuke, P.label.textContent);
          }
        };
      });
    }
  }

  function updatePerksState(P){
    P.perks.forEach(pk=>{
      if(P.score>=pk.t) pk.el.classList.add('on');
      else pk.el.classList.remove('on');
    });
  }

  // ====== هندسة المثلث + الكرة ======
  let W=0,H=0,side=0,height=0,totalLen=0,tLen=0,lastEdge=-1;
  let ball={r:10,last:performance.now()};
  const trail=[];

  function updateGeometry(){
    const rect=host.getBoundingClientRect();
    W=rect.width;
    H=rect.height;

    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);

    side=Math.min(W*0.96,H*0.96/(Math.sqrt(3)/2));
    height=side*Math.sqrt(3)/2;

    const cx=W/2, cy=H/2+6;
    const top ={x:cx,y:cy-height/2};
    const right={x:cx+side/2,y:cy+height/2};
    const left ={x:cx-side/2,y:cy+height/2};

    const d=`M ${top.x},${top.y} L ${right.x},${right.y} L ${left.x},${left.y} Z`;
    triPath.setAttribute('d',d);
    mask.querySelector('path').setAttribute('d',d);

    const L1=Math.hypot(top.x-right.x,top.y-right.y);
    const L2=Math.hypot(right.x-left.x,right.y-left.y);
    const L3=Math.hypot(left.x-top.x,left.y-top.y);
    const scale=triPath.getTotalLength()/(L1+L2+L3);

    edgeCut=[L1*scale,(L1+L2)*scale,triPath.getTotalLength()];
    totalLen=edgeCut[2];

    ball.r=(TUBE_THICKNESS*BASE_BALL_REL_THICK/2)*(BALL_SIZE_PCT/100);
    const dia=ball.r*2;
    ballImg.setAttribute('width',dia);
    ballImg.setAttribute('height',dia);

    const diameter=W*0.18;
    const rad=diameter/2;
    const outDist=rad+TUBE_THICKNESS/2+24;

    function out(pt){
      const dx=pt.x-cx;
      const dy=pt.y-cy;
      const len=Math.hypot(dx,dy)||1;
      return {x:pt.x+(dx/len)*outDist,y:pt.y+(dy/len)*outDist};
    }

    const pos=[ out(top), out(right), out(left) ];

    // تعديلك القديم: اللاعب الأول يمين 160 وتحت 100
    pos[0].x+=160;
    pos[0].y+=100;

    players.forEach((P,i)=>{
      P.slot.style.width=diameter+'px';
      P.slot.style.left =pos[i].x+'px';
      P.slot.style.top  =pos[i].y+'px';
      P.slot.style.setProperty('--avatar-diam',diameter+'px');
    });
  }

  function whichEdge(len){
    if(len<edgeCut[0]) return 0;
    if(len<edgeCut[1]) return 1;
    return 2;
  }

  function drawTrail(x,y){
    trail.unshift({x,y});
    if(trail.length>TRAIL_LENGTH) trail.pop();

    while(trailG.firstChild) trailG.removeChild(trailG.firstChild);

    for(let i=0;i<trail.length;i++){
      const t=i/TRAIL_LENGTH;
      const a=Math.pow(1-t,1/TRAIL_FADE)*0.5;
      const r=ball.r*(1-t*0.7);

      const c=document.createElementNS("http://www.w3.org/2000/svg",'circle');
      c.setAttribute('cx',trail[i].x);
      c.setAttribute('cy',trail[i].y);
      c.setAttribute('r',Math.max(0.5,r));
      c.setAttribute('fill',`rgba(124,246,230,${a})`);
      trailG.appendChild(c);
    }
  }

  function nextQuestion(){
    if(qList.length===0) return;
    const url=qList[qIndex++];
    if(qIndex>=qList.length){
      shuffle(qList);
      qIndex=0;
    }
    qImg.classList.remove('show');
    const tmp=new Image();
    tmp.onload=()=>{
      qImg.src=url;
      requestAnimationFrame(()=>qImg.classList.add('show'));
    };
    tmp.src=bust(url);
  }

  // ====== الأسئلة ======
  let qList=[],qIndex=0;

  async function scanQuestions(){
    qList=[];
    let miss=0;
    for(let i=1;i<=5000;i++){
      const url=await resolveAuto(QUESTIONS_DIR+i,TRY_IMG);
      if(url){
        qList.push(url);
        miss=0;
      }else{
        miss++;
        if(miss>=20) break;
      }
    }
    shuffle(qList);
    qIndex=0;
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
  }

  // ====== حلقة اللعبة ======
  let edgeCut=[0,0,0];

  function loop(){
    const now=performance.now();
    const dt=(now-ball.last)/1000;
    ball.last=now;

    if(!PAUSED){
      const v=REVERSE?-SPEED:SPEED;
      tLen+=v*dt;
      if(tLen>=totalLen) tLen-=totalLen;
      if(tLen<0) tLen+=totalLen;
    }

    const p=triPath.getPointAtLength(tLen);
    ballImg.setAttribute('x',p.x-ball.r);
    ballImg.setAttribute('y',p.y-ball.r);

    const e=whichEdge(tLen);
    if(e!==lastEdge){
      lastEdge=e;
      nextQuestion();
    }

    drawTrail(p.x,p.y);

    requestAnimationFrame(loop);
  }

  // ====== نوافذ ======
  function hideCenter(){
    dimmer.classList.remove('show');
    centerBox.innerHTML='';
  }

  function showCenterMedia(src,isVid){
    centerBox.innerHTML='';
    if(isVid){
      const v=document.createElement('video');
      v.src=src;
      v.autoplay=true;
      v.controls=false;
      v.playsInline=true;
      centerBox.appendChild(v);
      v.play().catch(()=>{v.muted=true;v.play();});
    }else{
      const i=document.createElement('img');
      i.src=src;
      centerBox.appendChild(i);
    }
    dimmer.classList.add('show');
  }

  function showFull(src,winner){
    fullOverlay.classList.add('show');
    winnerBanner.textContent = `الفائز: ${winner}`;
    if(src){
      fullVideo.src=src;
      fullVideo.play().catch(()=>{fullVideo.muted=true;fullVideo.play();});
    }else{
      fullVideo.removeAttribute('src');
    }
  }

  // ====== مجلد اللاعبين ======
  async function loadPlayers(){
    if(!playersDirHandle) return;

    let files=[];
    for await(const f of playersDirHandle.values()){
      if(f.kind==='file'){
        const ext=f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
        if([...TRY_IMG,...TRY_VID].includes(ext)){
          files.push(f);
        }
      }
    }
    files.sort((a,b)=>a.name.localeCompare(b.name,'ar',{numeric:true}));

    for(let i=0;i<3;i++){
      if(!files[i]) continue;
      const file=await files[i].getFile();
      const url=URL.createObjectURL(file);
      players[i].avatar.src=url;
      players[i].label.textContent=file.name.replace(/\.[^.]+$/,'');
    }
  }

  pickPlayersDirBtn.onclick=async()=>{
    try{
      playersDirHandle=await window.showDirectoryPicker({id:'tea-players'});
      await loadPlayers();
    }catch{}
  };

  refreshPlayersBtn.onclick=loadPlayers;

  // ====== التحكم ======
  speedEl.oninput=e=>{
    SPEED=parseInt(e.target.value);
    speedValEl.textContent=SPEED;
  };

  sizeEl.oninput=e=>{
    BALL_SIZE_PCT=parseInt(e.target.value);
    sizeValEl.textContent=BALL_SIZE_PCT;
    updateGeometry();
  };

  startGameBtn.onclick=()=>{
    tLen=0;
    lastEdge=-1;
    PAUSED=false;
    ball.last=performance.now();
  };

  pauseResumeBtn.onclick=()=> PAUSED=!PAUSED;

  // ====== التشغيل ======
  createPlayerSlots();
  loadPerksImages();
  scanQuestions();
  updateGeometry();
  requestAnimationFrame(loop);
  window.onresize=updateGeometry;

  // تحميل صورة الكرة
  (async()=>{
    const ballSrc = await resolveAuto(BALL_SRC_BASE,TRY_IMG);
    if(ballSrc) {
      ballImg.setAttribute('href',ballSrc);
      ballImg.setAttributeNS(XLINK,'href',ballSrc);
    }
  })();

})();
