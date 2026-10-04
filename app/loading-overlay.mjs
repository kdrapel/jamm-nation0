// Original Nation0 font: lookup at DS:5e010, eleven rows at DS:18289,
// 160 bytes per row. The executable image normalizes DS by removing F00h.
export function drawNation0Loading(context, executable) {
  if (!executable) return;
  const bytes = new Uint8Array(executable);
  const text = 'loading', width = text.length * 18 - 2;
  const x0 = Math.floor((320-width)/2), y0 = 20 + Math.floor((200-11)/2);
  context.save();
  context.fillStyle = 'rgba(0,0,0,0.85)';
  context.fillRect(x0-12,y0-10,width+24,31);
  context.fillStyle = '#fff';
  for (let n=0;n<text.length;n++) {
    let glyph = -1;
    for (let i=0;i<33;i++) if (bytes[0x5e010+0xf00+i] === text.charCodeAt(n)) { glyph=i; break; }
    if (glyph < 0) continue;
    for (let y=0;y<11;y++) {
      const bits=bytes[0x18289+0xf00+glyph+y*160];
      for (let x=0;x<8;x++) if (bits & (0x80 >> x)) context.fillRect(x0+n*18+x*2,y0+y,2,1);
    }
  }
  context.restore();
}
