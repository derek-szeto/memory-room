export type Location = {sectionId:string|null;x:number;y:number;field:string|null;caret:number|null};
export type Peer = Location & {clientId:string;userId:string;name:string;color:string;avatar_path:string;active:boolean;updatedAt:number};
export function validLocation(value:unknown):boolean {
  if(!value||typeof value!=='object')return false;
  const v=value as Location;
  return (v.sectionId===null||typeof v.sectionId==='string'&&/^[a-f0-9-]{36}$/.test(v.sectionId))&&Number.isFinite(v.x)&&v.x>=0&&v.x<=1&&Number.isFinite(v.y)&&v.y>=0&&v.y<=1&&(v.field===null||typeof v.field==='string'&&v.field.length<=100)&&(v.caret===null||Number.isSafeInteger(v.caret)&&v.caret>=0&&v.caret<=20000);
}
export function caretPoint(element:HTMLInputElement|HTMLTextAreaElement,offset:number) {
  const mirror=document.createElement('div'),style=getComputedStyle(element);
  for(const key of ['boxSizing','width','fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','textIndent','textAlign','tabSize'] as const)mirror.style[key]=style[key];
  Object.assign(mirror.style,{position:'fixed',left:'-10000px',top:'0',visibility:'hidden',whiteSpace:element instanceof HTMLTextAreaElement?'pre-wrap':'pre',overflowWrap:'break-word',borderStyle:'solid'});
  mirror.textContent=element.value.slice(0,offset);const marker=document.createElement('span');marker.textContent=element.value.slice(offset)||'\u200b';mirror.appendChild(marker);document.body.appendChild(mirror);
  const mr=mirror.getBoundingClientRect(),cr=marker.getBoundingClientRect(),er=element.getBoundingClientRect();
  const point={x:er.left+cr.left-mr.left-element.scrollLeft,y:er.top+cr.top-mr.top-element.scrollTop,height:parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.6};mirror.remove();return point;
}
