import { drawNation0Loading } from './loading-overlay.mjs';

export class NationPlayback {
  constructor(canvas, onChange) {
    this.canvas = canvas; this.context = canvas.getContext('2d', { alpha:false });
    this.onChange = onChange; this.current = null; this.epoch = 0; this.position = 0;
    this.loading = false; this.lastSeekMs = null;
  }
  async prepare() {
    const [exe, manifest] = await Promise.all([
      fetch(new URL('../original/NATION0.EXE', import.meta.url)).then(async r => { if(!r.ok)throw new Error('Could not load the intro.');return r.arrayBuffer(); }),
      fetch(new URL('./replay-cache/manifest.json', import.meta.url)).then(r => r.ok ? r.json() : null).catch(()=>null),
    ]);
    this.executable=exe; this.manifest=manifest; this.endUs=manifest?.endUs ?? 179985714;
  }
  async start(seconds=0) {
    const epoch=++this.epoch, startedAt=performance.now();
    seconds=Math.max(0,Math.min(179.9,seconds));
    this.loading=true; this.onChange({ loading:true, seconds });
    const overlay=()=>{if(!this.loading||epoch!==this.epoch)return;drawNation0Loading(this.context,this.executable);requestAnimationFrame(overlay);};overlay();
    await this.dispose();
    if(epoch!==this.epoch)return;
    const audio=new AudioContext({sampleRate:44100});
    await audio.resume();
    if(epoch!==this.epoch){await audio.close();return;}
    const cached=!!this.manifest;
    if(!cached&&!self.crossOriginIsolated){await audio.close();throw new Error('Please run Start.cmd to load the intro.');}
    const control=new Int32Array(cached&&!self.crossOriginIsolated?new ArrayBuffer(20):new SharedArrayBuffer(20));
    const worker=new Worker(new URL(cached?'./replay-cache-worker.mjs':'./continuous-player-worker.mjs',import.meta.url),{type:'module'});
    const state={audio,worker,control,cached,frames:[],paused:false,anchorUs:seconds*1e6,audioStart:audio.currentTime+.45,nextAudio:audio.currentTime+.45,animation:0,ended:false};
    this.current=state;
    const pump=()=>{
      if(this.current!==state)return;
      let newest=null;
      while(state.frames.length&&state.frames[0].due<=audio.currentTime)newest=state.frames.shift();
      if(newest){
        this.draw(newest.frame);this.position=newest.frame.elapsedUs/1e6;
        if(this.loading){this.loading=false;this.lastSeekMs=performance.now()-startedAt;}
        this.onChange({seconds:this.position,loading:false,paused:state.paused});
      }
      if(state.ended&&!state.frames.length&&audio.currentTime>=state.nextAudio){this.onChange({ended:true});return;}
      state.animation=requestAnimationFrame(pump);
    };
    state.animation=requestAnimationFrame(pump);
    worker.onmessage=({data})=>{
      if(this.current!==state)return;
      if(data.type==='position'&&!data.seeking){state.anchorUs=data.elapsedUs;state.audioStart=audio.currentTime+.45;state.nextAudio=state.audioStart;}
      else if(data.type==='frame')state.frames.push({frame:data,due:state.audioStart+Math.max(0,(data.elapsedUs-state.anchorUs)/1e6)});
      else if(data.type==='pcm'){
        const pcm=new Int16Array(data.pcm),count=pcm.length/2;
        const buffer=audio.createBuffer(2,count,data.sampleRate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
        for(let i=0;i<count;i++){left[i]=pcm[i*2]/32768;right[i]=pcm[i*2+1]/32768;}
        const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);
        const timestamp=Number.isFinite(data.elapsedUs)?state.audioStart+Math.max(0,(data.elapsedUs-state.anchorUs)/1e6):state.nextAudio;
        const due=Math.max(timestamp,state.nextAudio,audio.currentTime+.015);source.start(due);state.nextAudio=due+count/data.sampleRate;
      } else if(data.type==='stop')state.ended=true;
      else if(data.type==='error'){this.loading=false;this.onChange({error:data.message});}
    };
    worker.onerror=event=>{this.loading=false;this.onChange({error:event.message||'Playback could not start.'});};
    if(cached)worker.postMessage({type:'start-cache',manifest:this.manifest,control:control.buffer,seekUs:Math.round(seconds*1e6)});
    else {const executable=this.executable.slice(0);worker.postMessage({type:'start',executable,control:control.buffer,seekUs:Math.round(seconds*1e6)},[executable]);}
  }
  draw(frame) {
    const pixels=new Uint8Array(frame.indices),palette=new Uint8Array(frame.palette),image=new ImageData(320,240);
    const rgba=new Uint32Array(image.data.buffer),colors=new Uint32Array(256);rgba.fill(0xff000000);
    for(let i=0;i<256;i++){const p=i*3,r=palette[p],g=palette[p+1],b=palette[p+2];colors[i]=(0xff000000|(((b<<2)|(b>>>4))<<16)|(((g<<2)|(g>>>4))<<8)|((r<<2)|(r>>>4)))>>>0;}
    const y0=Math.floor((240-frame.height)/2),x0=Math.floor((320-frame.width)/2);
    for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++)rgba[(y+y0)*320+x+x0]=colors[pixels[y*frame.width+x]&(frame.pelMask??255)];
    this.context.putImageData(image,0,0);
  }
  async pause() {
    const state=this.current;if(!state||this.loading)return;
    state.paused=!state.paused;
    Atomics.store(state.control,0,state.paused?1:0);Atomics.notify(state.control,0);
    if(state.cached)state.worker.postMessage({type:'control',value:state.paused?1:0});
    if(state.paused)await state.audio.suspend();else await state.audio.resume();
    this.onChange({paused:state.paused});
  }
  async dispose() {
    const state=this.current;if(!state)return;this.current=null;
    cancelAnimationFrame(state.animation);Atomics.store(state.control,0,2);Atomics.notify(state.control,0);Atomics.notify(state.control,1);
    state.worker.terminate();await state.audio.close();
  }
  async stop() {this.epoch++;this.loading=false;await this.dispose();this.position=0;}
}
