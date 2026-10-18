'use client';
import {Fragment, useCallback, useEffect, useRef, useState} from 'react';
import {Plus, Search, Sun, Moon, Monitor, ChevronDown, ArrowUpRight, Menu, X, ListTodo, AlignLeft, Paperclip, Trash2, Copy, Users, LogOut, Upload, FileText, MoreHorizontal, Settings, ImageIcon, PanelsTopLeft, PanelLeftClose, PanelLeftOpen, Heading, Captions, Quote, Lightbulb, Images, LayoutGrid, Milestone, SeparatorHorizontal, UnfoldVertical} from 'lucide-react';
import {emptySection, readSection, orderedNotes, moveSection, sectionText, sectionLabels as labels, decorativeTypes, type SectionType, type Room, type Note, type Member, type Section, type Profile} from '@/lib/document';
import {initialize, request, RequestError, isSupabase, authenticate, signOut, upload, openFile, accountEmail, getProfile, saveProfile, uploadProfile} from '@/lib/workspace-client';
import {SectionEditor} from '@/components/section-editor';
import {PrivateImage} from '@/components/private-image';
import {CollaborationPanel} from '@/components/collaboration-panel';
import {useWorkspacePresence,CursorOverlay} from '@/hooks/use-workspace-presence';
import type {Peer} from '@/lib/presence';
import {safeColor,mixColor,contrastInk} from '@/lib/colors';
import {SettingsPanel, defaultPreferences, type Preferences} from '@/components/settings-panel';

type User = {id:string; name:string; local:boolean};
type Theme = 'light'|'dark'|'system';
const insertGroups:{label:string;types:{type:SectionType;icon:React.ReactNode;hint:string}[]}[] = [
  {label:'Write',types:[
    {type:'text',icon:<AlignLeft size={21}/>,hint:'Write freely, together'},
    {type:'header',icon:<Heading size={21}/>,hint:'A single bold line of text'},
    {type:'caption',icon:<Captions size={21}/>,hint:'A small note under anything'},
    {type:'quote',icon:<Quote size={21}/>,hint:'Set a line apart, with credit'},
    {type:'callout',icon:<Lightbulb size={21}/>,hint:'A colored box for a key note'},
    {type:'list',icon:<ListTodo size={21}/>,hint:'Keep track of the little things'},
  ]},
  {label:'Media',types:[
    {type:'image',icon:<ImageIcon size={21}/>,hint:'Give an image its own space'},
    {type:'feature',icon:<PanelsTopLeft size={21}/>,hint:'Pair an image with your words'},
    {type:'gallery',icon:<Images size={21}/>,hint:'A grid of rounded photos'},
    {type:'files',icon:<Paperclip size={21}/>,hint:'Keep everything in one place'},
  ]},
  {label:'Layout & design',types:[
    {type:'cards',icon:<LayoutGrid size={21}/>,hint:'Clickable cards with full stories'},
    {type:'timeline',icon:<Milestone size={21}/>,hint:'Moments in order, over time'},
    {type:'divider',icon:<SeparatorHorizontal size={21}/>,hint:'A decorative break'},
    {type:'spacer',icon:<UnfoldVertical size={21}/>,hint:'Breathing room between sections'},
  ]},
];


export default function Home() {
  const [rooms,setRooms]=useState<Room[]>([]),[room,setRoom]=useState(''),[notes,setNotes]=useState<Note[]>([]),[members,setMembers]=useState<Member[]>([]);
  const [user,setUser]=useState<User>({id:'',name:'',local:false}),[ready,setReady]=useState(false),[needsAuth,setNeedsAuth]=useState(false),[sync,setSync]=useState('Connecting');
  const [theme,setTheme]=useState<Theme>('system'),[menu,setMenu]=useState(false),[insert,setInsert]=useState(false),[query,setQuery]=useState('');
  const [settings,setSettings]=useState(false),[settingsTab,setSettingsTab]=useState<'appearance'|'account'|'workspace'>('appearance'),[preferences,setPreferences]=useState<Preferences>(defaultPreferences),[preferencesLoaded,setPreferencesLoaded]=useState(false),[signingOut,setSigningOut]=useState(false);
  const [dialog,setDialog]=useState<'create'|'join'|'share'|'rename'|null>(null),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null),[workspaceLayout,setWorkspaceLayout]=useState<'document'|'webpage'>('document');
  const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[now,setNow]=useState(Date.now());
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [moving,setMoving]=useState(false),[draggedId,setDraggedId]=useState<string|null>(null),[dropHint,setDropHint]=useState<{id:string;after:boolean}|null>(null);
  const ordering=useRef(false),dragged=useRef<string|null>(null);
  const roomRef=useRef(room);roomRef.current=room;
  const current=rooms.find(r=>r.id===room);
  const fail=useCallback((message:string)=>setError(message),[]);
  const loadRooms=useCallback(async(select?:string)=>{
    const data=await request<{rooms:Room[];user:User}>();setRooms(data.rooms);setUser(data.user);setProfile(await getProfile());setNeedsAuth(false);setRoom(previous=>select||previous||data.rooms[0]?.id||'');
  },[]);
  useEffect(()=>{initialize().then(()=>loadRooms()).catch(error=>{if(error instanceof RequestError&&error.status===401)setNeedsAuth(true);else setError(error.message);}).finally(()=>setReady(true));},[loadRooms]);
  useEffect(()=>{
    let initial:Theme='system';try{const value=localStorage.getItem('memory-theme');if(value==='light'||value==='dark'||value==='system')initial=value;}catch{}
    setTheme(initial);
  },[]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme;};apply();media.addEventListener('change',apply);localStorage.setItem('memory-theme',theme);
    return()=>media.removeEventListener('change',apply);
  },[theme]);
  useEffect(()=>{
    try {
      const stored=JSON.parse(localStorage.getItem('memory-preferences')||'null');
      if(stored)setPreferences({textSize:['standard','large','extra'].includes(stored.textSize)?stored.textSize:'standard',font:stored.font==='serif'?'serif':'sans',width:stored.width==='wide'?'wide':'focused',showOutline:typeof stored.showOutline==='boolean'?stored.showOutline:true,reduceMotion:stored.reduceMotion===true,accent:safeColor(stored.accent,defaultPreferences.accent),lightBackground:safeColor(stored.lightBackground,defaultPreferences.lightBackground),darkBackground:safeColor(stored.darkBackground,defaultPreferences.darkBackground)});
    } catch { /* Use defaults for invalid preferences. */ }
    setPreferencesLoaded(true);
  },[]);
  useEffect(()=>{
    if(preferencesLoaded)localStorage.setItem('memory-preferences',JSON.stringify(preferences));
    document.documentElement.dataset.reduceMotion=String(preferences.reduceMotion);
  },[preferences,preferencesLoaded]);
  useEffect(()=>{
    const root=document.documentElement,media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{const dark=theme==='dark'||theme==='system'&&media.matches;const page=dark?preferences.darkBackground:preferences.lightBackground;const ink=contrastInk(page);const surface=mixColor(page,ink==='#ffffff'?'#000000':'#ffffff',ink==='#ffffff'?.08:.65);const values={'--page':page,'--surface':surface,'--sidebar':mixColor(page,ink,.035),'--ink':ink,'--muted':mixColor(ink,page,.28),'--line':mixColor(page,ink,.2),'--accent':preferences.accent,'--accent-soft':mixColor(page,preferences.accent,.18),'--hover':mixColor(page,preferences.accent,.09),'--accent-ink':contrastInk(preferences.accent)};Object.entries(values).forEach(([key,value])=>root.style.setProperty(key,value));};apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[theme,preferences.accent,preferences.lightBackground,preferences.darkBackground]);
  useEffect(()=>{try{setSidebarCollapsed(localStorage.getItem('memory-sidebar')==='collapsed');}catch{ /* Keep the sidebar open. */ }},[]);
  const toggleSidebar=useCallback(()=>{
    // On phones the sidebar is a drawer, so the same button just closes it.
    if(window.matchMedia('(max-width:700px)').matches){setMenu(false);return;}
    setSidebarCollapsed(previous=>{const next=!previous;try{localStorage.setItem('memory-sidebar',next?'collapsed':'open');}catch{ /* Not persisted. */ }return next;});
  },[]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key==='\\'){event.preventDefault();toggleSidebar();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[toggleSidebar]);
  const refresh=useCallback(async()=>{
    const target=roomRef.current;if(!target)return;
    const data=await request<{notes:Note[];members:Member[];serverTime:number;room?:Room}>(`?room=${encodeURIComponent(target)}`);
    if(roomRef.current!==target||ordering.current||document.querySelector('.delete-dialog[open]'))return;
    if(data.room)setRooms(previous=>previous.map(r=>r.id===target?data.room!:r));
    setNotes(orderedNotes(data.notes,data.room?.section_order));setMembers(data.members);setNow(data.serverTime);setSync('All changes saved');
  },[]);
  useEffect(()=>{
    if(!room)return;setNotes([]);setMembers([]);setSync('Connecting');let inFlight=false,stopped=false;
    const update=async()=>{if(inFlight||document.hidden||stopped||ordering.current||document.querySelector('.delete-dialog[open]'))return;inFlight=true;try{await refresh();}catch(error){if(!stopped){setSync('Connection lost · retrying');if(error instanceof RequestError&&error.status===401)setNeedsAuth(true);}}finally{inFlight=false;}};
    const heartbeat=()=>{if(!document.hidden)request('',{action:'heartbeat',roomId:room}).catch(()=>{});};
    void update();heartbeat();const poll=setInterval(update,2000),beat=setInterval(heartbeat,15000);const resume=()=>{void update();heartbeat();};document.addEventListener('visibilitychange',resume);
    return()=>{stopped=true;clearInterval(poll);clearInterval(beat);document.removeEventListener('visibilitychange',resume);};
  },[room,refresh]);
  function selectRoom(id:string){setDraggedId(null);setDropHint(null);dragged.current=null;setRoom(id);setQuery('');setMenu(false);setError('');}
  function showDialog(type:typeof dialog){setDialog(type);setInput(type==='rename'?current?.name||'':'');setError('');}
  async function addSection(type:Section['type']) {
    if(busy||!room)return;setBusy(true);setInsert(false);setError('');
    try {const result=await request<{noteId:string}>('',{action:'add',roomId:room,title:labels[type],body:JSON.stringify(emptySection(type)),kind:'note',pinned:false,memoryDate:''});await refresh();setTimeout(()=>document.getElementById(`section-${result.noteId}`)?.scrollIntoView({behavior:preferences.reduceMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'}),100);}
    catch(error){setError(error instanceof Error?error.message:'Could not add section.');}finally{setBusy(false);}
  }
  async function submitRoom(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{if(dialog==='rename'){await request('',{action:'rename',roomId:room,name:input});await loadRooms();}else{const data=await request('',dialog==='create'?{action:'create',name:input,layout:workspaceLayout}:{action:'join',invite:input.trim()});await loadRooms(data.roomId);}setDialog(null);}catch(error){setError(error instanceof Error?error.message:'Request failed.');}finally{setBusy(false);}}
  async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const signedIn=await authenticate(email,password,signup?name:undefined);if(signedIn){await loadRooms();setPassword('');}else setNotice('Check your email to confirm your account, then sign in.');}catch(error){setError(error instanceof Error?error.message:'Sign in failed.');}finally{setBusy(false);}}
  async function logout(){
    if(signingOut)return;setSigningOut(true);setError('');let message='Signed out. Your drafts are kept on this device.';
    try {await signOut();}catch{message='Signed out on this device. The server could not confirm session revocation.';}
    finally{roomRef.current='';setRooms([]);setRoom('');setNotes([]);setMembers([]);setUser({id:'',name:'',local:false});setProfile(null);setNeedsAuth(true);setSignup(false);setPassword('');setSettings(false);setMenu(false);setDialog(null);setQuery('');setSigningOut(false);setNotice(message);}
  }
  function exportDocument(){
    if(!current)return;
    const body=[current.name,...notes.filter(note=>!['divider','spacer'].includes(readSection(note.body).type)).map(note=>`\n${note.title}\n${sectionText(readSection(note.body))}`)].join('\n');
    const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`${current.name.replace(/[^a-zA-Z0-9_-]/g,'_')||'workspace'}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Downloaded the latest saved document.');
  }
  const presence=useWorkspacePresence(needsAuth?'':room,user,profile);
  async function updateProfile(value:Profile){await saveProfile(value);setProfile(await getProfile());setUser(previous=>({...previous,name:value.name}));await refresh();}
  async function updateWorkspace(value:{description:string;icon_path:string;layout:'document'|'webpage';version:number}){if(!current)return;await request('',{action:'workspace',roomId:current.id,...value});await loadRooms();}
  function jumpToPerson(peer:Peer){setQuery('');setTimeout(()=>{const section=document.getElementById(`section-${peer.sectionId}`);if(!section)return;const rect=section.getBoundingClientRect();window.scrollTo({top:window.scrollY+rect.top+rect.height*peer.y-window.innerHeight*.4,behavior:preferences.reduceMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});section.dataset.followHighlight='true';setTimeout(()=>delete section.dataset.followHighlight,1800);},50);}
  async function persistOrder(order:string[]){
    if(!current||ordering.current||moving)return;const target=current.id;
    if(order.every((id,index)=>notes[index]?.id===id))return;
    ordering.current=true;setMoving(true);setError('');setNotes(previous=>orderedNotes(previous,order));
    try {await request('',{action:'reorder',roomId:target,version:current.order_version||1,order});if(roomRef.current===target)setNotice('Section position saved.');}
    catch(error){if(roomRef.current===target)setError(error instanceof Error?error.message:'Could not move the section.');}
    finally {ordering.current=false;if(roomRef.current===target)await refresh().catch(error=>setError(error.message));setMoving(false);}
  }
  function moveBy(id:string,direction:-1|1){const index=notes.findIndex(n=>n.id===id),target=notes[index+direction];if(target)void persistOrder(moveSection(notes.map(n=>n.id),id,target.id,direction===1));}
  function startDrag(event:React.DragEvent,id:string){if(moving||query)return;dragged.current=id;setDraggedId(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}
  function endDrag(){dragged.current=null;setDraggedId(null);setDropHint(null);}
  function dragOver(event:React.DragEvent,id:string){if(!dragged.current||moving||query||dragged.current===id)return;event.preventDefault();event.dataTransfer.dropEffect='move';const rect=event.currentTarget.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;setDropHint(previous=>previous?.id===id&&previous.after===after?previous:{id,after});}
  function dropSection(event:React.DragEvent,id:string){if(!dragged.current||moving||query)return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2;const order=moveSection(notes.map(n=>n.id),dragged.current,id,after);endDrag();void persistOrder(order);}
  const visible=notes.filter(note=>`${note.title} ${sectionText(readSection(note.body))}`.toLowerCase().includes(query.toLowerCase()));
  const online=members.filter(m=>now-m.last_seen<35000);
  const insertButtons=<>{insertGroups.map(group=><Fragment key={group.label}><div className="insert-group-label">{group.label}</div>{group.types.map(({type,icon,hint})=><button key={type} onClick={()=>void addSection(type)} disabled={busy}>{icon}<span><strong>{labels[type]}</strong><small>{hint}</small></span><Plus size={17}/></button>)}</Fragment>)}</>;
  return <div className="app-shell" data-sidebar={sidebarCollapsed?'collapsed':'open'} data-text-size={preferences.textSize} data-font={preferences.font} data-page-width={preferences.width} data-workspace-layout={current?.layout||'document'}>
    {menu&&<button className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside className={`sidebar ${menu?'expanded':''}`}>
      <div className="brand-row"><a className="brand" href="/">memory room<span>.</span></a><button className="icon-button sidebar-collapse" aria-label="Hide sidebar" title="Hide sidebar (Ctrl+\)" onClick={toggleSidebar}><PanelLeftClose size={20}/></button></div>
      <div className="workspace-caption">A place to think together</div>
      <button className="new-workspace" onClick={()=>showDialog('create')} disabled={!user.id}><Plus size={19}/> New workspace</button>
      <div className="nav-label">YOUR WORKSPACES <span>{rooms.length}</span></div>
      <nav aria-label="Workspaces">{rooms.map(r=><button key={r.id} className={`workspace-link ${room===r.id?'active':''}`} onClick={()=>selectRoom(r.id)}><PrivateImage className="workspace-nav-icon" path={r.icon_path} alt="" fallback={r.name[0].toUpperCase()}/><span>{r.name}</span>{room===r.id&&<span className="active-dot"/>}</button>)}</nav>
      <button className="join-link" onClick={()=>showDialog('join')} disabled={!user.id}>Join a workspace <ArrowUpRight size={17}/></button>
      {current&&preferences.showOutline&&<div className="outline"><div className="nav-label">IN THIS DOCUMENT</div>{notes.filter(n=>!decorativeTypes.includes(readSection(n.body).type)).map(n=><a href={`#section-${n.id}`} key={n.id} onClick={()=>{setQuery('');setMenu(false);}}>{n.title}</a>)}{!notes.length&&<p>Your sections will appear here.</p>}</div>}
      <div className="sidebar-bottom"><button className="sidebar-settings" onClick={()=>{setSettings(true);setMenu(false);}}><Settings size={19}/> Settings</button><div className="theme-control" aria-label="Appearance">{(['light','dark','system'] as const).map(t=><button key={t} title={`${t} theme`} aria-label={`${t} theme`} aria-pressed={theme===t} className={theme===t?'selected':''} onClick={()=>setTheme(t)}>{t==='light'?<Sun size={18}/>:t==='dark'?<Moon size={18}/>:<Monitor size={18}/>}<span>{t}</span></button>)}</div><div className="user-row"><PrivateImage className="avatar" path={profile?.avatar_path} bucket="profile-images" alt="Your profile photo" fallback={(profile?.name||user.name||'M')[0].toUpperCase()}/><div><strong>{user.name||'Your workspace'}</strong><small>{isSupabase()?'Connected to Supabase':'Memory Room'}</small></div>{isSupabase()&&user.id&&<button className="icon-button" aria-label="Sign out" disabled={signingOut} onClick={()=>void logout()}><LogOut size={18}/></button>}</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMenu(true)}><Menu size={22}/></button>{sidebarCollapsed&&<button className="icon-button sidebar-open" aria-label="Show sidebar" title="Show sidebar (Ctrl+\)" onClick={toggleSidebar}><PanelLeftOpen size={21}/></button>}<span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{current?.name||'Welcome home'}</strong></div><div className="header-actions"><button className="icon-button" aria-label="Open settings" onClick={()=>setSettings(true)}><Settings size={20}/></button>{room&&<span className={`sync ${sync.startsWith('All')?'connected':''}`}><span/>{sync.startsWith('All')?'Connected':sync}</span>}<button className="theme-shortcut icon-button" aria-label="Toggle light and dark mode" onClick={()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={20}/>:<Moon size={20}/>}</button>{room&&<button className="share-button" onClick={()=>showDialog('share')}><Users size={18}/> Share</button>}</div></header>
      <div className="workspace-body">
        {error&&<div className="alert" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={18}/></button></div>}
        {notice&&<div className="notice" role="status">{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={18}/></button></div>}
        {!ready?<div className="welcome"><p>Opening your workspace…</p></div>:needsAuth?<form className="auth-panel" onSubmit={login}><div className="eyebrow">YOUR SHARED SPACE</div><h1>{signup?'Make yourself at home.':'Welcome back.'}</h1><p>Notes, plans, and the things you keep together.</p>{signup&&<label>Your name<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>}<label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label><label>Password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'}/></label><button className="primary" disabled={busy}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button><button type="button" className="text-button" onClick={()=>{setSignup(!signup);setError('');}}>{signup?'Already have an account? Sign in':'New here? Create an account'}</button></form>:current?<>
          <div className="document-intro"><div className="eyebrow">A SHARED DOCUMENT <span>·</span> {notes.length} {notes.length===1?'SECTION':'SECTIONS'}</div><div className="document-title-row">{current.icon_path&&<PrivateImage className="workspace-title-icon" path={current.icon_path} alt="Workspace icon"/>}<h1>{current.name}</h1><button className="icon-button" aria-label="Rename workspace" onClick={()=>showDialog('rename')}><MoreHorizontal size={26}/></button></div><div className="workspace-description"><p>{current.description||'Add a description to introduce this workspace.'}</p><button className="text-button" onClick={()=>{setSettingsTab('workspace');setSettings(true);}}>Edit description</button></div><div className="document-meta"><div className="avatar-stack">{online.slice(0,4).map((m,i)=><span className={`avatar avatar-${i}`} title={m.name} key={`${m.name}-${i}`}>{m.name[0].toUpperCase()}</span>)}</div><span>{online.length?`${online.length} ${online.length===1?'person':'people'} recently active`:'Your shared workspace'}</span><span className="meta-separator">·</span><span>Changes save automatically</span></div></div>
          <div className="document-toolbar"><div className="toolbar-label"><FileText size={19}/> {current.layout==='webpage'?'Webpage':'Document'}</div><div className="toolbar-right"><label className="search"><Search size={18}/><input placeholder="Find in document…" aria-label="Find in document" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label><div className="insert-control"><button className="primary" aria-expanded={insert} onClick={()=>setInsert(!insert)} disabled={busy}><Plus size={18}/> Insert section <ChevronDown size={16}/></button>{insert&&<><button className="menu-dismiss" aria-label="Close insert menu" onClick={()=>setInsert(false)}/><div className="insert-menu">{insertButtons}</div></>}</div></div></div>
          <p className="section-move-hint" role="status">{moving?'Saving section position?':query?'Clear search to move sections.':'Drag a section?s Move handle or use its arrows to change its position.'}</p><CollaborationPanel members={members} peers={presence.peers} status={presence.status} userId={user.id} notes={notes} onJump={jumpToPerson}/><article className="document-paper" aria-label={current.name}>{visible.map(note=><SectionEditor key={`${room}-${note.id}`} note={note} room={room} user={user.id} peers={presence.peers} onSaved={refresh} onError={fail} index={notes.findIndex(n=>n.id===note.id)} count={notes.length} moveDisabled={moving||!!query||!isSupabase()} onMove={direction=>moveBy(note.id,direction)} onDragStart={event=>startDrag(event,note.id)} onDragEnd={endDrag} onDragOver={event=>dragOver(event,note.id)} onDrop={event=>dropSection(event,note.id)} dragging={draggedId===note.id} dropSide={dropHint?.id===note.id?(dropHint.after?'after':'before'):null}/>)}{query&&!visible.length&&<div className="empty-search">No sections match “{query}”. <button onClick={()=>setQuery('')}>Clear search</button></div>}{!notes.length&&<div className="blank-document"><span className="small-label">THE BEGINNING OF SOMETHING GOOD</span><h2>Every idea starts with a little space.</h2><p>Add a section and start writing. Invite your people when you're ready.</p></div>}{!query&&<div className="insert-tray"><div className="insert-tray-caption"><span/><strong>Add to your document</strong><span/></div><div className="insert-options">{insertButtons}</div></div>}</article>
          <footer className="document-footer"><span>Made for the things you keep together.</span><span>Saved changes sync every 2 seconds</span></footer>
        </>:<div className="welcome"><div className="eyebrow">WELCOME TO MEMORY ROOM</div><h1>A shared space.<br/>A fresh start.</h1><p>Bring your notes, lists, and people together in one living document.</p><div><button className="primary" onClick={()=>showDialog('create')}><Plus size={19}/> Create a workspace</button><button className="secondary" onClick={()=>showDialog('join')}>Join with a code <ArrowUpRight size={18}/></button></div></div>}
      </div>
    </main>
    <CursorOverlay peers={presence.peers}/>
    {settings&&<SettingsPanel initialTab={settingsTab} theme={theme} setTheme={setTheme} preferences={preferences} setPreferences={setPreferences} name={user.name} email={accountEmail()} signedIn={!!user.id} canSignOut={isSupabase()&&!!user.id} signingOut={signingOut} profile={profile} onSaveProfile={updateProfile} onUploadProfile={uploadProfile} onSaveWorkspace={updateWorkspace} onUploadIcon={async file=>{if(!current)throw new Error('Open a workspace first.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP image.');return (await upload(current.id,file)).path;}} workspace={current?{...current,sections:notes.length,members:members.length}:undefined} onClose={()=>setSettings(false)} onSignOut={logout} onRename={()=>{setSettings(false);showDialog('rename');}} onShare={()=>{setSettings(false);showDialog('share');}} onExport={exportDocument}/>}
    {dialog&&<div className="modal-backdrop" onClick={()=>!busy&&setDialog(null)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={e=>e.stopPropagation()}><div className="modal-heading"><h2 id="dialog-title">{dialog==='share'?'Better, together.':dialog==='create'?'A space of your own.':dialog==='rename'?'Rename workspace':'Come on in.'}</h2><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={()=>setDialog(null)}><X size={22}/></button></div>{dialog==='share'?<><p>Everyone who joins can edit the sections in this workspace.</p>{current?.invite?<><label className="field-label">Private invite code</label><code className="invite-code">{current.invite}</code><button className="primary" onClick={()=>navigator.clipboard.writeText(current.invite!).then(()=>{setNotice('Invite code copied.');setDialog(null);}).catch(()=>setError('Could not copy. Select and copy the code above.'))}><Copy size={18}/> Copy invite code</button><p className="modal-hint">Share the website link and this code with your people. They need an account to join.</p></>:<p>Ask the workspace owner for an invite code.</p>}</>:<form onSubmit={submitRoom}><p>{dialog==='join'?'Enter the invite code from someone in your circle.':dialog==='rename'?'Give this shared document a new name.':'A trip, a project, or just life. Give it a name.'}</p><label className="field-label" htmlFor="room-input">{dialog==='join'?'Invite code':'Workspace name'}</label>{dialog==='create'&&<label className="layout-picker">Workspace type<select value={workspaceLayout} onChange={e=>setWorkspaceLayout(e.target.value as 'document'|'webpage')}><option value="document">Document</option><option value="webpage">Webpage</option></select></label>}<input id="room-input" autoFocus required maxLength={dialog==='join'?32:60} placeholder={dialog==='join'?'Paste your invite code':'e.g. Our next adventure'} value={input} onChange={e=>setInput(e.target.value)}/><button className="primary" disabled={busy}>{busy?'Please wait…':dialog==='join'?'Join workspace':dialog==='rename'?'Save name':'Create workspace'}<ArrowUpRight size={18}/></button></form>}{error&&<p className="dialog-error" role="alert">{error}</p>}</div></div>}
  </div>;
}
