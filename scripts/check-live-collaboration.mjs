import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write('Ready for private QA configuration on stdin.\n');
let input='';const configInput=await new Promise(resolve=>{process.stdin.on('data',chunk=>{input+=chunk.toString();if(/[\r\n]/.test(input)){process.stdin.pause();resolve(JSON.parse(input.trim()));}});});
const config=await (await fetch('http://127.0.0.1:5173/api/config')).json();
assert.equal(config.url,'https://cmedwkorafhfjaauisgr.supabase.co');
const clients=configInput.users.map(()=>createClient(config.url,config.key,{global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
const channels=[];let room='',profilePath='',imagePath='';
const ok=({data,error})=>{if(error)throw error;return data;};
const action=(client,payload)=>client.rpc('workspace_action',{input:payload}).then(ok);
const subscribe=channel=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime subscribe timed out')),15000);channel.subscribe((state,error)=>{if(state==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){clearTimeout(timer);reject(error||new Error(state));}});});
try {
 for(let i=0;i<2;i++)ok(await clients[i].auth.signInWithPassword({email:`memory-qa-${configInput.users[i]}@example.invalid`,password:configInput.password}));
 console.log('PASS: two authenticated test clients');
 const [a,b]=clients;
 room=(await action(a,{action:'create',name:'Temporary live collaboration QA',layout:'webpage'})).roomId;
 const outside=b.channel(`workspace:${room}`,{config:{private:true}});channels.push([b,outside]);
 let denied=false;try{await subscribe(outside);}catch{denied=true;}assert.equal(denied,true);await b.removeChannel(outside);
 console.log('PASS: outsider cannot join private collaboration channel');
 const rooms=ok(await a.rpc('workspace_rooms'));const invite=rooms.find(r=>r.id===room).invite;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkN8AAAAASUVORK5CYII=','base64');
 profilePath=`${configInput.users[0]}/${randomUUID()}/avatar.png`;
 ok(await a.storage.from('profile-images').upload(profilePath,png,{contentType:'image/png'}));
 await action(a,{action:'profile',name:'QA contributor',avatar_path:profilePath,color:'#385ca0'});
 const forbidden=await b.storage.from('profile-images').createSignedUrl(profilePath,60);assert.ok(forbidden.error);
 await action(b,{action:'join',invite});
 ok(await b.storage.from('profile-images').createSignedUrl(profilePath,60));
 imagePath=`${room}/${randomUUID()}/image.png`;ok(await a.storage.from('workspace-files').upload(imagePath,png,{contentType:'image/png'}));
 await action(a,{action:'workspace',roomId:room,description:'Verified shared description',layout:'webpage',icon_path:imagePath,version:1});
 const stale=await a.rpc('workspace_action',{input:{action:'workspace',roomId:room,description:'Stale',layout:'document',icon_path:'',version:1}});assert.equal(stale.error?.code,'PT409');
 const section=(await action(a,{action:'add',roomId:room,title:'Image and text',body:JSON.stringify({format:'memory-section-v1',type:'feature',text:'Caption',items:[],files:[{path:imagePath,name:'image.png',size:png.length}]}),kind:'note',pinned:false,memoryDate:''})).noteId;
 const snapshot=ok(await b.rpc('workspace_snapshot',{target:room}));assert.equal(snapshot.room.description,'Verified shared description');assert.equal(snapshot.room.layout,'webpage');assert.equal(snapshot.members.length,2);assert.equal(snapshot.notes[0].id,section);
 console.log('PASS: shared profiles, private images, metadata, image sections, and stale-setting checks');
 const ca=a.channel(`workspace:${room}`,{config:{private:true,presence:{key:'qa-a'},broadcast:{self:false}}}),cb=b.channel(`workspace:${room}`,{config:{private:true,presence:{key:'qa-b'},broadcast:{self:false}}});channels.push([a,ca],[b,cb]);
 let bothResolve;const both=new Promise(resolve=>{bothResolve=resolve;});const timer=setTimeout(()=>bothResolve(false),12000);
 cb.on('presence',{event:'sync'},()=>{const keys=Object.keys(cb.presenceState());if(keys.includes('qa-a')&&keys.includes('qa-b'))bothResolve(true);});
 await Promise.all([subscribe(ca),subscribe(cb)]);
 await ca.track({userId:configInput.users[0],sectionId:section});await cb.track({userId:configInput.users[1],sectionId:section});
 assert.equal(await both,true);clearTimeout(timer);
 let receivedResolve;const received=new Promise(resolve=>{receivedResolve=resolve;});const receiveTimer=setTimeout(()=>receivedResolve(null),8000);
 cb.on('broadcast',{event:'location'},({payload})=>receivedResolve(payload));
 await ca.send({type:'broadcast',event:'location',payload:{sectionId:section,x:.4,y:.5,field:'text',caret:3}});
 const update=await received;clearTimeout(receiveTimer);assert.equal(update?.caret,3);assert.equal(update?.sectionId,section);
 console.log('PASS: two-member online presence and live cursor/caret broadcasts');
} catch(error) {console.error('QA FAILED:',error.message);process.exitCode=1;}
finally {
 const [a]=clients;
 if(imagePath)await a.storage.from('workspace-files').remove([imagePath]);
 if(profilePath)await a.storage.from('profile-images').remove([profilePath]);
 for(const [client,channel] of channels)await client.removeChannel(channel);
 for(const client of clients){await client.auth.signOut({scope:'local'});client.realtime.disconnect();}
 console.log('QA transport and file cleanup finished.');
 process.exit(process.exitCode||0);
}
