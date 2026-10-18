export const safeColor=(value:unknown,fallback:string)=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value)?value:fallback;
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function mixColor(a:string,b:string,ratio:number){const left=rgb(a),right=rgb(b);return '#'+left.map((v,i)=>Math.round(v*(1-ratio)+right[i]*ratio).toString(16).padStart(2,'0')).join('');}
export function contrastInk(background:string){const v=rgb(background).map(x=>{const n=x/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2]>.179?'#142019':'#ffffff';}
