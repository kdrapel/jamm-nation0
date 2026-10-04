import { NationPlayback } from './playback.mjs';
import { decodeReplayPackets } from './replay-packets.mjs';
import { SITE } from './site.mjs';

const gate=document.querySelector('#gate'),shell=document.querySelector('#shell'),start=document.querySelector('#start');
const status=document.querySelector('#status'),hud=document.querySelector('#hud'),timeline=document.querySelector('#timeline');
const pause=document.querySelector('#pause'),time=document.querySelector('#time');
let playing=false,backgroundFrames=[],backgroundDuration=0,backgroundEpoch=0,hudTimer;
let scrubbing=false,scrubPointer=null;
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function drawTitlePixels(executable){
  const bytes=new Uint8Array(executable);
  for(const element of document.querySelectorAll('h1 span, .group')){
    const label=element.textContent.trim(),text=label.toLowerCase();
    const canvas=document.createElement('canvas');canvas.width=text.length*18-2;canvas.height=11;
    canvas.className='bitmap-text';canvas.setAttribute('aria-hidden','true');
    canvas.style.width=`${canvas.width/16}em`;
    const context=canvas.getContext('2d');context.fillStyle='#fff';
    for(let n=0;n<text.length;n++){
      let glyph=-1;
      for(let i=0;i<33;i++)if(bytes[0x5e010+0xf00+i]===text.charCodeAt(n)){glyph=i;break;}
      if(glyph<0)continue;
      for(let y=0;y<11;y++){
        const bits=bytes[0x18289+0xf00+glyph+y*160];
        for(let x=0;x<8;x++)if(bits&(0x80>>x))context.fillRect(n*18+x*2,y,2,1);
      }
    }
    element.setAttribute('aria-label',label);element.replaceChildren(canvas);
  }
}
const player=new NationPlayback(document.querySelector('#screen'),change=>{
  if(change.error){status.textContent=change.error;stop();return;}
  if(change.loading!==undefined)status.textContent=change.loading?'Loading…':'';
  if(change.seconds!==undefined&&!scrubbing){timeline.value=String(change.seconds);time.textContent=`${clock(change.seconds)} / 3:00`;}
  if(change.paused!==undefined)pause.textContent=change.paused?'Resume':'Pause';
  if(change.ended)stop();
});
if(SITE.github){const link=document.querySelector('#github');link.href=SITE.github;link.hidden=false;link.target='_blank';link.rel='noopener noreferrer';}
function revealControls(){if(document.fullscreenElement)return;hud.classList.add('visible');clearTimeout(hudTimer);hudTimer=setTimeout(()=>hud.classList.remove('visible'),2500);}
async function run(seconds=0){
  playing=true;gate.classList.add('hidden');hud.hidden=false;revealControls();
  try{await player.start(seconds);}catch(error){status.textContent=error.message;await stop();}
}
async function stop(){scrubbing=false;scrubPointer=null;await player.stop();playing=false;gate.classList.remove('hidden');hud.hidden=true;pause.textContent='Pause';timeline.value='0';time.textContent='0:00 / 3:00';backgroundEpoch=performance.now();if(status.textContent==='Loading…')status.textContent='';}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen();}catch{status.textContent='Fullscreen is unavailable in this browser.';}}
start.addEventListener('click',()=>run());pause.addEventListener('click',()=>player.pause());
document.querySelector('#stop').addEventListener('click',()=>stop());document.querySelector('#fullscreen').addEventListener('click',()=>fullscreen());
function previewCue(){time.textContent=`${clock(Number(timeline.value))} / 3:00`;}
function commitCue(){const target=Number(timeline.value);scrubbing=false;scrubPointer=null;run(target);}
function cueAtPointer(event){
  const rect=timeline.getBoundingClientRect(),inset=8;
  const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left-inset)/Math.max(1,rect.width-inset*2)));
  const min=Number(timeline.min),max=Number(timeline.max),step=Number(timeline.step)||0.1;
  timeline.value=String(min+Math.round(ratio*(max-min)/step)*step);previewCue();
}
timeline.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();scrubbing=true;scrubPointer=event.pointerId;
  timeline.focus();timeline.setPointerCapture(event.pointerId);cueAtPointer(event);
});
timeline.addEventListener('pointermove',event=>{if(event.pointerId===scrubPointer)cueAtPointer(event);});
timeline.addEventListener('pointerup',event=>{
  if(event.pointerId!==scrubPointer)return;
  cueAtPointer(event);timeline.releasePointerCapture(event.pointerId);commitCue();
});
timeline.addEventListener('pointercancel',()=>{scrubbing=false;scrubPointer=null;timeline.value=String(player.position);previewCue();});
timeline.addEventListener('input',()=>{scrubbing=true;previewCue();});
timeline.addEventListener('change',commitCue);
shell.addEventListener('pointermove',revealControls);shell.addEventListener('pointerdown',revealControls);
document.addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement)return;
  if(event.code==='Space'){event.preventDefault();if(playing)player.pause();else if(!start.disabled)run();}
  else if(event.code==='ArrowLeft'||event.code==='ArrowRight'){event.preventDefault();if(playing)run(player.position+(event.code==='ArrowRight'?10:-10));}
  else if(event.code==='KeyF')fullscreen();else if(event.code==='Escape'&&playing)stop();
});
async function prepareBackground(){
  const response=await fetch(new URL('../data/voxel.gz',import.meta.url));if(!response.ok)return;
  const bytes=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  for(const packet of decodeReplayPackets(bytes))if(packet.type==='frame')backgroundFrames.push({...packet,indices:packet.indices.slice(),palette:packet.palette.slice()});
  if(!backgroundFrames.length)return;
  backgroundDuration=backgroundFrames.at(-1).elapsedUs/1000+28.571; backgroundEpoch=performance.now();
  const canvas=document.querySelector('#background'),context=canvas.getContext('2d',{alpha:false});
  const image=new ImageData(320,200),rgba=new Uint32Array(image.data.buffer);
  let last=-1;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const animate=now=>{
    if(!playing&&!document.hidden){
      const elapsed=reduced.matches?0:Math.max(0,now-backgroundEpoch)%backgroundDuration;
      let index=Math.min(backgroundFrames.length-1,Math.floor(elapsed/28.571));
      if(index!==last){last=index;const frame=backgroundFrames[index];
        for(let i=0;i<frame.indices.length;i++){const p=(frame.indices[i]&frame.pelMask)*3,r=frame.palette[p],g=frame.palette[p+1],b=frame.palette[p+2];rgba[i]=(0xff000000|(((b<<2)|(b>>>4))<<16)|(((g<<2)|(g>>>4))<<8)|((r<<2)|(r>>>4)))>>>0;}
        context.putImageData(image,0,0);
      }
    }
    requestAnimationFrame(animate);
  };requestAnimationFrame(animate);
}
prepareBackground().catch(()=>{});
try{await player.prepare();drawTitlePixels(player.executable);start.disabled=false;start.textContent='Start';}
catch(error){status.textContent=error.message;start.textContent='Reload to retry';}
window.nation0={player,seek:seconds=>run(seconds),stop};
