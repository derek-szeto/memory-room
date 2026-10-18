'use client';
import {useEffect,useRef,useState} from 'react';
import {realtimeClient,isSupabase} from '@/lib/workspace-client';
import {validLocation,caretPoint,type Peer,type Location} from '@/lib/presence';
import type {Profile} from '@/lib/document';
import {contrastInk} from '@/lib/colors';

export function useWorkspacePresence(room:string,user:{id:string;name:string},profile:Profile|null) {
 const [peers,setPeers]=useState<Peer[]>([]),[status,setStatus]=useState('Connecting');
 const clientId=useRef('');const current=useRef<Location>({sectionId:null,x:0,y:0,field:null,caret:null});
 useEffect(()=>{
  if(!room||!user.id||!isSupabase()){setPeers([]);setStatus('Unavailable');return;}
  if(!clientId.current)clientId.current=crypto.randomUUID();let stopped=false,ready=false;let dispose:()=>void=()=>{};
  current.current={sectionId:null,x:0,y:0,field:null,caret:null};
  setPeers([]);setStatus('Connecting');
  void realtimeClient().then(client=>{
   if(stopped){void client.realtime.disconnect();return;}
   const channel=client.channel(`workspace:${room}`,{config:{private:true,broadcast:{self:false},presence:{key:clientId.current}}});
   const identity=()=>({...current.current,clientId:clientId.current,userId:user.id,name:profile?.name||user.name,color:profile?.color||'#466c50',avatar_path:profile?.avatar_path||'',active:!document.hidden,updatedAt:Date.now()});
   const sync=()=>{const state=channel.presenceState();const next:Peer[]=[];for(const rows of Object.values(state)){for(const raw of rows){const p=raw as unknown as Peer;if(validLocation(p)&&typeof p.userId==='string'&&typeof p.clientId==='string'&&p.clientId!==clientId.current&&typeof p.name==='string'&&typeof p.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(p.color))next.push({...p,updatedAt:Date.now()});}}setPeers(previous=>next.map(peer=>{const old=previous.find(p=>p.clientId===peer.clientId);return old&&old.updatedAt>peer.updatedAt?old:peer;}));};
   channel.on('presence',{event:'sync'},sync).on('broadcast',{event:'location'},({payload})=>{
    if(!validLocation(payload)||typeof payload.clientId!=='string'||typeof payload.active!=='boolean')return;
    setPeers(previous=>previous.map(peer=>peer.clientId===payload.clientId?{...peer,sectionId:payload.sectionId,x:payload.x,y:payload.y,field:payload.field,caret:payload.caret,active:payload.active,updatedAt:Date.now()}:peer));
   }).subscribe(state=>{if(stopped)return;ready=state==='SUBSCRIBED';setStatus(ready?'Live':state==='CHANNEL_ERROR'||state==='TIMED_OUT'?'Reconnecting':'Connecting');if(ready)void channel.track(identity());else setPeers([]);});
   let lastSent=0;const publish=()=>{if(!ready||Date.now()-lastSent<80)return;lastSent=Date.now();void channel.send({type:'broadcast',event:'location',payload:{...current.current,clientId:clientId.current,active:!document.hidden}});};
   const locate=(event:PointerEvent)=>{
    if(document.querySelector('dialog[open]'))return;
    const target=event.target instanceof Element?event.target:null;const section=target?.closest<HTMLElement>('.document-section');if(!section)return;
    const rect=section.getBoundingClientRect();const sectionId=section.id.replace('section-','');current.current={...current.current,...(current.current.sectionId!==sectionId?{field:null,caret:null}:{}),sectionId,x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};publish();
   };
   const selection=()=>{const field=document.activeElement;if(!(field instanceof HTMLTextAreaElement||field instanceof HTMLInputElement)||!field.dataset.presenceField)return;const section=field.closest<HTMLElement>('.document-section');if(!section)return;current.current={...current.current,sectionId:section.id.replace('section-',''),field:field.dataset.presenceField,caret:field.selectionStart};publish();};
   const blur=()=>{current.current={...current.current,field:null,caret:null};publish();};
   const viewport=()=>{if(document.hidden||document.querySelector('dialog[open]'))return;const sections=[...document.querySelectorAll<HTMLElement>('.document-section')];const section=sections.find(el=>{const rect=el.getBoundingClientRect();return rect.top<window.innerHeight*.5&&rect.bottom>window.innerHeight*.25;});if(section){const sectionId=section.id.replace('section-','');current.current={...current.current,...(current.current.sectionId!==sectionId?{field:null,caret:null,x:.5,y:.5}:{}),sectionId};publish();}};
   const visibility=()=>{if(ready)void channel.track(identity());publish();};
   document.addEventListener('pointermove',locate);document.addEventListener('selectionchange',selection);document.addEventListener('input',selection);document.addEventListener('focusout',blur);document.addEventListener('visibilitychange',visibility);window.addEventListener('scroll',viewport,{passive:true});
   const pulse=setInterval(()=>{if(!current.current.sectionId)viewport();if(ready)void channel.track(identity());},5000);const auth=setInterval(()=>{void client.realtime.setAuth().catch(()=>{});},30000);
   viewport();
   dispose=()=>{ready=false;clearInterval(pulse);clearInterval(auth);document.removeEventListener('pointermove',locate);document.removeEventListener('selectionchange',selection);document.removeEventListener('input',selection);document.removeEventListener('focusout',blur);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('scroll',viewport);void channel.untrack().finally(()=>client.removeChannel(channel)).finally(()=>client.realtime.disconnect()).catch(()=>{});};
  }).catch(()=>{if(!stopped)setStatus('Unavailable');});
  return()=>{stopped=true;dispose();};
 },[room,user.id,user.name,profile?.name,profile?.color,profile?.avatar_path]);
 return {peers,status};
}
export function CursorOverlay({peers}:{peers:Peer[]}) {
 const [positions,setPositions]=useState<{peer:Peer;x:number;y:number;caret?:{x:number;y:number;height:number}}[]>([]);
 useEffect(()=>{let frame=0;const update=()=>{
  if(document.querySelector('dialog[open]')){setPositions([]);return;}
  setPositions(peers.filter(p=>p.active&&p.sectionId).flatMap(peer=>{
   const section=document.getElementById(`section-${peer.sectionId}`);if(!section)return[];const rect=section.getBoundingClientRect();
   const fields=[...section.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('[data-presence-field]')];const field=fields.find(f=>f.dataset.presenceField===peer.field);
   const caret=field&&peer.caret!==null?caretPoint(field,Math.min(peer.caret,field.value.length)):undefined;
   return [{peer,x:rect.left+rect.width*peer.x,y:rect.top+rect.height*peer.y,caret}];
  }));
 };const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};update();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);const interval=setInterval(schedule,500);return()=>{cancelAnimationFrame(frame);clearInterval(interval);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);};},[peers]);
 return <div className="cursor-overlay" aria-hidden="true">{positions.map(({peer,x,y,caret})=><div key={peer.clientId}>{y>0&&y<window.innerHeight&&<div className="remote-cursor" style={{left:x,top:y,color:peer.color}}><svg width="18" height="23" viewBox="0 0 18 23"><path d="M1 1L16 14H8L5 21Z" fill="currentColor" stroke="white"/></svg><span style={{background:peer.color,color:contrastInk(peer.color)}}>{peer.name}</span></div>}{caret&&caret.y>0&&caret.y<window.innerHeight&&<div className="remote-caret" style={{left:caret.x,top:caret.y,height:caret.height,borderColor:peer.color}}><span style={{background:peer.color,color:contrastInk(peer.color)}}>{peer.name}</span></div>}</div>)}</div>;
}
