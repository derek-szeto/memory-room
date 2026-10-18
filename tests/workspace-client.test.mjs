import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {initialize,request,authenticate,upload,RequestError,signOut} from '../lib/workspace-client.ts';
const originalFetch=globalThis.fetch;
const store=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
globalThis.localStorage=store();globalThis.sessionStorage=store();
after(()=>{globalThis.fetch=originalFetch;});
const config={url:'https://test.supabase.co',key:'sb_publishable_test'};
const auth={access_token:'new-jwt',refresh_token:'refresh',expires_in:3600,user:{id:'user',email:'friend@example.com'}};
const json=value=>Response.json(value);
test('Supabase requests share a single session refresh and pass the user JWT to writes',async()=>{
  localStorage.setItem('memory-session',JSON.stringify({...auth,access_token:'old-jwt',expires_at:0}));
  let refreshes=0,writes=0;
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/config')return json(config);
    if(url.includes('grant_type=refresh_token')){refreshes++;await new Promise(resolve=>setTimeout(resolve,10));return json(auth);}
    assert.equal(options.headers.Authorization,'Bearer new-jwt');
    assert.equal(options.headers.apikey,config.key);
    assert.equal(JSON.parse(options.body).input.action,'heartbeat');writes++;return json({ok:true});
  };
  await initialize();
  await Promise.all([request('',{action:'heartbeat'}),request('',{action:'heartbeat'})]);
  assert.equal(refreshes,1);assert.equal(writes,2);
});
test('PostgreSQL conflict code becomes a recoverable 409 error',async()=>{
  globalThis.fetch=async()=>Response.json({code:'40001',message:'Stale draft'},{status:400});
  await assert.rejects(()=>request('',{action:'edit'}),error=>error instanceof RequestError&&error.status===409&&error.message==='Stale draft');
});
test('sign-up requiring confirmation does not create a fake signed-in session',async()=>{
  localStorage.removeItem('memory-session');
  globalThis.fetch=async url=>url==='/api/config'?json(config):json({user:auth.user});
  await initialize();
  assert.equal(await authenticate('friend@example.com','password123','Friend'),false);
  assert.equal(localStorage.getItem('memory-session'),null);
  await assert.rejects(()=>request(),error=>error.status===401);
});
test('upload rejects unsupported files before sending them to Storage',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return json({});};
  await assert.rejects(()=>upload('room',new File(['data'],'test.html',{type:'text/html'})),/Choose a JPG/);
  assert.equal(calls,0);
});
test('sign-out revokes this session and keeps device drafts and preferences',async()=>{
  localStorage.setItem('memory-session',JSON.stringify({...auth,expires_at:Date.now()+3600000}));
  localStorage.setItem('memory-preferences','{"textSize":"large"}');
  localStorage.setItem('memory-draft:user:room:section','unsaved draft');
  let loggedOut=false;
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/config')return json(config);
    assert.equal(url,config.url+'/auth/v1/logout?scope=local');
    assert.equal(options.headers.Authorization,'Bearer new-jwt');
    loggedOut=true;return new Response(null,{status:204});
  };
  await initialize();await signOut();
  assert.equal(loggedOut,true);assert.equal(localStorage.getItem('memory-session'),null);
  assert.equal(localStorage.getItem('memory-draft:user:room:section'),'unsaved draft');
  assert.equal(localStorage.getItem('memory-preferences'),'{"textSize":"large"}');
  await assert.rejects(()=>request(),error=>error.status===401);
});
test('a failed server logout still clears local authentication',async()=>{
  localStorage.setItem('memory-session',JSON.stringify({...auth,expires_at:Date.now()+3600000}));
  globalThis.fetch=async url=>{if(url==='/api/config')return json(config);throw new Error('Network unavailable');};
  await initialize();await assert.rejects(()=>signOut(),/Network unavailable/);
  assert.equal(localStorage.getItem('memory-session'),null);
  await assert.rejects(()=>request(),error=>error.status===401);
});
