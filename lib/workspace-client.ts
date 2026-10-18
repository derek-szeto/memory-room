import type {Room, Note, Member, Attachment, Profile} from './document';

export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {super(message);this.status=status;}
}
type Session = {access_token: string; refresh_token: string; expires_at: number; user: {id:string; email?:string; user_metadata?: {name?:string}}};
type Config = {url:string; key:string};
type AuthResponse = Omit<Session,'expires_at'> & {expires_in:number};
let config: Config | null = null;
let session: Session | null = null;
let refreshing: Promise<void> | null = null;
export const isSupabase = () => !!config;
export const accountEmail = () => session?.user.email;
export async function realtimeClient() {
  if(!config) throw new Error('Connect Supabase for live collaboration.');
  const {createClient}=await import('@supabase/supabase-js');
  return createClient(config.url,config.key,{accessToken:token,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export async function getProfile():Promise<Profile|null> {
  if(!config)return null;
  return supa<Profile>('/rest/v1/rpc/workspace_profile',{method:'POST',body:'{}'});
}
export async function saveProfile(profile:Profile) {
  await request('',{action:'profile',name:profile.name,avatar_path:profile.avatar_path,color:profile.color});
  const user=await supa<Session['user']>('/auth/v1/user',{method:'PUT',body:JSON.stringify({data:{name:profile.name}})});
  if(session){session.user=user;localStorage.setItem('memory-session',JSON.stringify(session));}
}
export async function initialize() {
  const response = await fetch('/api/config', {cache:'no-store'});
  if (!response.ok) throw new Error('Could not load workspace configuration.');
  config = await response.json();
  if (config) {
    try {session = JSON.parse(localStorage.getItem('memory-session') || 'null');} catch {session = null;}
  } else if (!sessionStorage.getItem('memory-user')) {
    sessionStorage.setItem('memory-user',crypto.randomUUID());
    sessionStorage.setItem('memory-name',`Friend ${Math.floor(Math.random()*900+100)}`);
  }
}
async function decode<T>(response: Response): Promise<T> {
  const value = await response.json().catch(()=>({})) as Record<string,unknown>;
  if (!response.ok) throw new RequestError(String(value.error_description || value.msg || value.message || value.error || 'Request failed.'), value.code === '40001' ? 409 : response.status);
  return value as T;
}
function remember(value: Omit<Session,'expires_at'> & {expires_in:number}) {
  session = {...value,expires_at:Date.now()+value.expires_in*1000};
  localStorage.setItem('memory-session',JSON.stringify(session));
}
async function token() {
  if (!session) throw new RequestError('Sign in to open your shared workspace.',401);
  if (session.expires_at < Date.now()+60000) {
    refreshing ??= (async()=>{
      const response = await fetch(`${config!.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:config!.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session!.refresh_token})});
      try {remember(await decode<AuthResponse>(response));} catch(error) {session=null;localStorage.removeItem('memory-session');throw error;}
    })().finally(()=>{refreshing=null;});
    await refreshing;
  }
  return session!.access_token;
}
async function supa<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = await token();
  return decode<T>(await fetch(`${config!.url}${path}`,{...init,headers:{apikey:config!.key,Authorization:`Bearer ${access}`,'Content-Type':'application/json',...init.headers},cache:'no-store'}));
}
export async function authenticate(email: string, password: string, name?: string) {
  if (!config) return;
  const path = name ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
  const value = await decode<AuthResponse>(await fetch(`${config.url}${path}`,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password,...(name?{data:{name}}:{})})}));
  if (!value.access_token) return false;
  remember(value); return true;
}
export async function signOut() {
  try {if(config && session) await supa('/auth/v1/logout?scope=local',{method:'POST'});} finally {session=null;localStorage.removeItem('memory-session');}
}
export async function request<T = {roomId:string}>(path = '', data?: Record<string,unknown>): Promise<T> {
  if (!config) {
    return decode<T>(await fetch(`/api/collab${path}`,{method:data?'POST':'GET',cache:'no-store',headers:{'x-local-user':sessionStorage.getItem('memory-user')||'','x-local-name':sessionStorage.getItem('memory-name')||'Friend',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}));
  }
  if (data) return supa<T>('/rest/v1/rpc/workspace_action',{method:'POST',body:JSON.stringify({input:data})});
  await token();
  const room = new URLSearchParams(path.replace(/^\?/, '')).get('room');
  if (room) {
    return supa<T>('/rest/v1/rpc/workspace_snapshot',{method:'POST',body:JSON.stringify({target:room})});
  }
  const rooms = await supa('/rest/v1/rpc/workspace_rooms',{method:'POST',body:'{}'});
  return {rooms:rooms as Room[],user:{id:session!.user.id,name:session!.user.user_metadata?.name||session!.user.email||'Friend',local:false}} as T;
}
export async function uploadProfile(file:File):Promise<string> {
  if(!config)throw new Error('Connect Supabase to upload a profile photo.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw new Error('Choose a JPG, PNG, or WebP up to 2 MB.');
  const access=await token();const path=`${session!.user.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  await decode(await fetch(`${config.url}/storage/v1/object/profile-images/${path}`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${access}`,'Content-Type':file.type},body:file}));
  return path;
}
const imageCache=new Map<string,{url:string;expires:number}>();
export async function imageUrl(path:string,bucket='workspace-files'):Promise<string> {
  if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-zA-Z0-9._-]+$/.test(path))throw new Error('Invalid image path.');
  const key=`${session?.user.id}:${bucket}:${path}`,cached=imageCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.url;
  const value=await supa<{signedURL:string}>(`/storage/v1/object/sign/${bucket}/${path}`,{method:'POST',body:JSON.stringify({expiresIn:900})});
  const url=`${config!.url}/storage/v1${value.signedURL}`;imageCache.set(key,{url,expires:Date.now()+8*60000});return url;
}
export async function upload(room: string, file: File): Promise<Attachment> {
  if (!config) throw new Error('Connect Supabase to upload files.');
  const allowed = ['image/jpeg','image/png','image/webp','application/pdf','text/plain'];
  if(file.size>10*1024*1024 || !allowed.includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, PDF, or text file up to 10 MB.');
  const path = `${room}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const access = await token();
  await decode(await fetch(`${config.url}/storage/v1/object/workspace-files/${path}`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${access}`,'Content-Type':file.type},body:file}));
  return {path,name:file.name,size:file.size};
}
export async function openFile(file: Attachment) {
  // Open synchronously to avoid browser popup blocking after the signed-URL request.
  const tab = window.open('about:blank','_blank');
  if (!tab) throw new Error('Allow popups to open this file.');
  tab.opener = null;
  try {
    const value = await supa<{signedURL:string}>(`/storage/v1/object/sign/workspace-files/${file.path}`,{method:'POST',body:JSON.stringify({expiresIn:60})});
    tab.location.href = `${config!.url}/storage/v1${value.signedURL}`;
  } catch(error) {tab.close();throw error;}
}
