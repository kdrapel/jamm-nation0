import { Memory } from '../src/core/memory.mjs';
import { CpuState } from '../src/core/cpu.mjs';
import { fn_2188d } from '../src/recursive-grid-helper.mjs';
import { fn_2165b } from '../src/neighbor-average.mjs';
import { fn_2137f, fn_211f4 } from '../src/phase-helper.mjs';
import { fn_3dbd4, fn_3d997 } from '../src/dispatcher-3d5d9.mjs';

const canvas = document.querySelector('#voxelCanvas'), ctx = canvas.getContext('2d');
const status = document.querySelector('#canvasBadge');
const memory = new Memory(), cpu = new CpuState();
const runtime = {memory, cpu, segments:{esBase:0,ssBase:0},
  writeEs8:(a,v)=>memory.write8(a,v), writeEs16:(a,v)=>memory.write16(a,v),
  writeEs32:(a,v)=>memory.write32(a,v), readEs8:a=>memory.read8(a),
  readEs16:a=>memory.read16(a), readEs32:a=>memory.read32(a)};
const BASE=0x100000, TEMP=0x110000, ROTATED=0x120000, OUTPUT=0x180000;
let ready=false, playing=true, phase=0, angle=0, mode='terrain', last=0;
let baseMap, radialBase, palette;
const controls=[...document.querySelectorAll('button,input')];
controls.forEach(e=>e.disabled=true);

async function initialize() {
  const response=await fetch('../original/NATION0.EXE');
  if(!response.ok) throw Error('Cannot load NATION0.EXE');
  const exe=new Uint8Array(await response.arrayBuffer());
  memory.bytes.set(exe.subarray(0xf00));
  cpu.set('esp',0x300000);
  fn_2137f(runtime);
  memory.bytes.fill(255,BASE,BASE+65535);
  for(const [offset,value] of [[0,0],[0x80,254],[0x8000,254],[0x8080,0]]) memory.write8(BASE+offset,value);
  cpu.set('esi',2); cpu.set('esp',0x300000);
  memory.write32(0x300000,0x21b50);
  memory.write16(0x300004,256); memory.write16(0x300006,0);
  fn_2188d(runtime,{esBase:BASE,ssBase:0});
  cpu.set('edi',TEMP); fn_2165b(runtime,{fsBase:BASE});
  cpu.set('edi',BASE); fn_2165b(runtime,{fsBase:TEMP});
  baseMap=memory.bytes.slice(BASE,BASE+65536);
  memory.write32(0,0x140000);memory.write32(4,0x170000);
  cpu.set('esp',0x300000);fn_211f4(runtime);radialBase=memory.read32(0x202f0);
  palette=Array.from({length:256},(_,i)=>Array.from({length:3},(_,k)=>Math.round((memory.read8(0x3bdd0+i*3+k)&63)*255/63)));
  memory.write32(0x3cdbe,ROTATED); memory.write32(0x3d2c8,OUTPUT);
  memory.write32(0x3d2d8,0x5e58);memory.write16(0x3c0d4,1);memory.write16(0x20c66,2);memory.write16(0x3d2c4,3);
  for(let i=0;i<768;i++) {
    const step=i<256?128:64;
    const index=((i<512?i:i-512)*step)&4095;
    const value=((Math.imul(100,memory.read32(0x2198c+index*4))>>16)+100)&255;
    memory.write8(0x3c0d6+i,value);
  }
  ready=true;controls.forEach(e=>e.disabled=false);render();
}

function heightField() {
  if(!document.querySelector('#waves').checked){memory.bytes.set(baseMap,BASE);return;}
  // Original 0x3d7ba..0x3d82b: radial byte + phase -> lookup, duplicate 2×2.
  for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
    const index=memory.read8(radialBase+y*128+x)+phase;
    const value=memory.read8(0x3c0d6+index);
    const p=BASE+y*512+x*2;
    memory.write8(p,value);memory.write8(p+1,value);
    memory.write8(p+256,value);memory.write8(p+257,value);
  }
}

function render() {
  if(!ready)return;
  heightField();memory.write16(0x3cdbc,angle);
  fn_3dbd4(runtime,{loadFsSelector:()=>{},readFs8:(_r,a)=>memory.read8(BASE+(a&65535))});
  const image=ctx.createImageData(320,200), data=image.data;
  if(mode==='terrain'||mode==='spans') {
    memory.bytes.fill(0,OUTPUT,OUTPUT+0x30000);
    memory.write8(0x3cdb9,Number(document.querySelector('#relief').value));
    memory.write32(0x3ca91,Number(document.querySelector('#offset').value));
    fn_3d997(runtime,{getGsSelector:()=>2,loadGsSelector:()=>{},loadFsSelector:()=>{},
      readGs8:(_r,a)=>memory.read8(ROTATED+(a&65535)),
      // Inspection-only color texture: keep samples within the embedded
      // landscape's 21-color ramp rather than its unused black DAC slots.
      readFs8:(_r,a)=>Math.floor(memory.read8(BASE+(a&65535))*20/255),
      writeEs32ForSelector:(_r,_s,a,v)=>memory.write32(a,v)});
    for(let y=0;y<200;y++)for(let x=0;x<320;x++) {
      const value=memory.read8(OUTPUT+0x3e80+y*320+(x>>1));
      const rgb=mode==='spans'?[value,value,value]:palette[value];
      const p=(y*320+x)*4;data.set(rgb,p);data[p+3]=255;
    }
  } else {
    const map=mode==='height'?BASE:ROTATED;
    for(let y=0;y<200;y++)for(let x=0;x<320;x++) {
      const v=memory.read8(map+Math.floor(y*256/200)*256+Math.floor(x*256/320));
      const p=(y*320+x)*4;data.set([v,v,v,255],p);
    }
  }
  ctx.putImageData(image,0,0);
  status.textContent=`${mode.toUpperCase()} · PHASE ${phase}/511 · ANGLE ${angle}/4095`;
}

document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-mode]').forEach(e=>e.classList.toggle('active',e===b));mode=b.dataset.mode;render();
}));
document.querySelector('#btnToggle').addEventListener('click',e=>{playing=!playing;e.target.textContent=playing?'Pause':'Play';});
document.querySelector('#btnStep').addEventListener('click',()=>{playing=false;document.querySelector('#btnToggle').textContent='Play';advance();render();});
for(const id of ['relief','offset','waves','rotate'])document.getElementById(id).addEventListener('input',render);
document.querySelector('#phase').addEventListener('input',e=>{phase=Number(e.target.value);render();});
function advance(){phase=(phase+1)&511;if(document.querySelector('#rotate').checked)angle=(angle+16)&4095;document.querySelector('#phase').value=phase;}
function frame(now){if(ready&&playing&&now-last>50){last=now;advance();render();}requestAnimationFrame(frame);}
initialize().catch(e=>{status.textContent=`Unable to load preview: ${e.message}. Open this page through Start.cmd or a static web server.`;console.error(e);});
requestAnimationFrame(frame);
