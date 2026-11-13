const cv=document.getElementById('wave'),cx=cv.getContext('2d');
let amp=.25,target=.25,t=0,ac=null,playing=false;
function size(){cv.width=cv.clientWidth*devicePixelRatio;cv.height=cv.clientHeight*devicePixelRatio}
size();addEventListener('resize',size);
function draw(){
  const w=cv.width,h=cv.height;cx.clearRect(0,0,w,h);amp+=(target-amp)*.05;t+=.03;
  [[ '#9b5cff',1,0 ],['#2f7bff',1.6,1.5],['#38e8ff',2.3,3]].forEach(([c,f,p],i)=>{
    cx.beginPath();cx.lineWidth=2*devicePixelRatio;cx.strokeStyle=c;cx.shadowColor=c;cx.shadowBlur=14;
    for(let x=0;x<=w;x+=4){
      const n=x/w,env=Math.sin(n*Math.PI);
      const y=h/2+Math.sin(n*10*f+t+p)*h*.32*amp*env+Math.sin(n*23+t*1.7+p)*h*.1*amp*env;
      x?cx.lineTo(x,y):cx.moveTo(x,y)}
    cx.globalAlpha=1-i*.2;cx.stroke()});
  cx.globalAlpha=1;requestAnimationFrame(draw)}
draw();
function note(f,d=2.2){
  ac=ac||new (window.AudioContext||window.webkitAudioContext)();
  [1,1.5,2].forEach((m,i)=>{
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=i?'sine':'triangle';o.frequency.value=f*m;
    g.gain.setValueAtTime(0,ac.currentTime);g.gain.linearRampToValueAtTime(.12/(i+1),ac.currentTime+.08);
    g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d);
    o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d)});
  target=1;clearTimeout(note.tm);note.tm=setTimeout(()=>{if(!playing)target=.25},d*800)}
const scale=[130.8,164.8,196,261.6,329.6,392,523.3];
let loop=null;
document.getElementById('hear').onclick=e=>{
  playing=!playing;
  if(playing){e.target.textContent='❚❚ Listening';target=1;note(scale[0],4);
    loop=setInterval(()=>note(scale[Math.floor(Math.random()*scale.length)],3.5),1600)}
  else{e.target.textContent='▶ Let’s Hear';clearInterval(loop);target=.25}};