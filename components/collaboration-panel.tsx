'use client';
import {MapPin,Navigation,Users} from 'lucide-react';
import type {Member,Note} from '@/lib/document';
import type {Peer} from '@/lib/presence';
import {PrivateImage} from './private-image';
export function CollaborationPanel({members,peers,status,userId,notes,onJump}:{members:Member[];peers:Peer[];status:string;userId:string;notes:Note[];onJump:(peer:Peer)=>void}) {
 const onlineIds=new Set(peers.filter(p=>p.active).map(p=>p.userId));if(status==='Live')onlineIds.add(userId);
 const row=(member:Member)=>{const peer=peers.find(p=>p.userId===member.user_id&&p.active);const section=notes.find(n=>n.id===peer?.sectionId);const online=onlineIds.has(member.user_id||'');return <li key={member.user_id||member.name}><PrivateImage className="avatar" bucket="profile-images" path={member.avatar_path} alt={`${member.name}'s profile`} fallback={member.name[0].toUpperCase()}/><div><strong>{member.name}{member.user_id===userId?' (you)':''}</strong><span>{peer&&section?<><MapPin size={15}/>{section.title}</>:online?'In this workspace':'Offline'}</span></div><span className={`person-status ${online?'online':''}`} title={online?'Online':'Offline'}/>{peer?.sectionId&&<button className="jump-button" onClick={()=>onJump(peer)} aria-label={`Jump to ${member.name}`}><Navigation size={17}/> Jump</button>}</li>;};
 return <div className="collaboration-panel"><div className="collaboration-heading"><Users size={21}/><strong>Your people</strong><span className="presence-status">{status==='Live'?'Live presence':status}</span></div><div className="people-lists"><details open><summary>Contributors <span>{members.length}</span></summary><ul>{members.map(row)}</ul></details><details open><summary>Online now <span>{onlineIds.size}</span></summary><ul>{members.filter(m=>onlineIds.has(m.user_id||'')).map(row)}</ul>{status!=='Live'&&<p>Connecting to live presence…</p>}{status==='Live'&&onlineIds.size<=1&&<p>Invite someone to see their live location and cursor.</p>}</details></div></div>;
}
