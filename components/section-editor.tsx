'use client';
import {useEffect,useRef,useState} from 'react';
import {Plus,X,Trash2,Upload,FileText,GripVertical,ArrowUp,ArrowDown} from 'lucide-react';
import {readSection,sectionLabels,untitledTypes,maxCardsPerRow,type Note,type Section,type SectionStyle,type Card,type TimelineEntry,type Attachment} from '@/lib/document';
import {plainToHtml} from '@/lib/rich-text';
import {request,RequestError,upload,openFile,isSupabase} from '@/lib/workspace-client';
import {PrivateImage} from './private-image';
import type {Peer} from '@/lib/presence';
import {DeleteSectionDialog} from './delete-section-dialog';
import {RichText} from './rich-text';
import {CardsBlock,TimelineBlock,GalleryBlock,Divider,Segmented,ColorPicker,calloutColors} from './section-blocks';

const imageTypes=['image/jpeg','image/png','image/webp'];
const alignOptions=[{value:'left' as const,label:'Left'},{value:'center' as const,label:'Center'},{value:'right' as const,label:'Right'}];
const perRowOptions=Array.from({length:maxCardsPerRow},(_,i)=>({value:i+1,label:String(i+1)}));
const htmlOf=(section:{html?:string;text:string})=>section.html??plainToHtml(section.text);
/** Untitled sections take their outline title from their own text. */
const derivedTitle=(section:Section)=>section.text.trim().replace(/\s+/g,' ').slice(0,80)||sectionLabels[section.type];

export function SectionEditor({note,room,user,peers,onSaved,onError,index,count,moveDisabled,onMove,onDragStart,onDragEnd,onDragOver,onDrop,dragging,dropSide}: {note:Note;room:string;user:string;peers:Peer[];onSaved:()=>Promise<void>;onError:(message:string)=>void;index:number;count:number;moveDisabled:boolean;onMove:(direction:-1|1)=>void;onDragStart:(event:React.DragEvent)=>void;onDragEnd:()=>void;onDragOver:(event:React.DragEvent)=>void;onDrop:(event:React.DragEvent)=>void;dragging:boolean;dropSide:'before'|'after'|null}) {
  const storageKey = `memory-draft:${user}:${room}:${note.id}`;
  const [title,setTitle] = useState(note.title), [content,setContent] = useState<Section>(()=>readSection(note.body));
  const [status,setStatus] = useState('Saved'), [dirty,setDirty] = useState(false), [conflict,setConflict] = useState(false), [uploading,setUploading] = useState(false);
  const [deleteOpen,setDeleteOpen]=useState(false);
  const version = useRef(note.version), saving = useRef(false), revision = useRef(0), [retry,setRetry] = useState(0);
  const latest = useRef({title,content}); latest.current = {title,content};
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    try {
      const stored=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(stored) {setTitle(stored.title);setContent(readSection(stored.body));version.current=stored.version;setDirty(true);setStatus('Restored draft');}
    } catch { /* Ignore invalid device drafts. */ }
  },[storageKey]);
  useEffect(()=>{
    if(!dirty && !saving.current) {setTitle(note.title);setContent(readSection(note.body));version.current=note.version;}
  },[note.title,note.body,note.version,dirty]);
  const change = (next:Section, nextTitle=untitledTypes.includes(next.type)?derivedTitle(next):latest.current.title) => {
    revision.current++;
    latest.current={title:nextTitle,content:next};setTitle(nextTitle);setContent(next);setDirty(true);setStatus('Unsaved');
    localStorage.setItem(storageKey,JSON.stringify({title:nextTitle,body:JSON.stringify(next),version:version.current}));
  };
  // Updaters read the latest content so that edits finishing after an upload don't overwrite newer typing.
  const patch = (fields:Partial<Section>) => change({...latest.current.content,...fields});
  const setStyle = (fields:SectionStyle) => patch({style:{...latest.current.content.style,...fields}});
  const updateCards = (fn:(cards:Card[])=>Card[]) => patch({cards:fn(latest.current.content.cards??[])});
  const updateEntries = (fn:(entries:TimelineEntry[])=>TimelineEntry[]) => patch({entries:fn(latest.current.content.entries??[])});
  useEffect(()=>{
    if(!dirty||conflict||deleteOpen) return;
    const timer=setTimeout(async()=>{
      if(saving.current) {setRetry(r=>r+1);return;}
      if(!latest.current.title.trim()) {setStatus('Add a section title');return;}
      saving.current=true;setStatus('Saving…'); const tick=revision.current;
      try {
        const current=latest.current;
        await request('',{action:'edit',roomId:room,noteId:note.id,version:version.current,title:current.title,body:JSON.stringify(current.content),kind:note.kind,pinned:!!note.pinned,memoryDate:note.memory_date});
        version.current++;
        if(tick===revision.current) {localStorage.removeItem(storageKey);if(alive.current){setDirty(false);setStatus('Saved');}}
        else {localStorage.setItem(storageKey,JSON.stringify({title:latest.current.title,body:JSON.stringify(latest.current.content),version:version.current}));if(alive.current)setRetry(r=>r+1);}
        await onSaved();
      } catch(error) {
        if(alive.current) {
          setStatus('Draft kept on this device');
          if(error instanceof RequestError&&error.status===409) setConflict(true);
          else {onError(error instanceof Error?error.message:'Could not save section.');setConflict(true);}
        }
      } finally {saving.current=false;}
    },900);
    return()=>clearTimeout(timer);
  },[dirty,conflict,deleteOpen,title,content,retry,note.id,note.kind,note.memory_date,note.pinned,room,storageKey,onSaved,onError]);
  async function remove() {
    if(saving.current||uploading)throw new Error('Please wait for the current change to finish.');
    await request('',{action:'delete',roomId:room,noteId:note.id,version:version.current});localStorage.removeItem(storageKey);setDirty(false);setConflict(false);
  }
  async function uploadFile(file:File,imagesOnly:boolean):Promise<Attachment|null> {
    if(imagesOnly&&!imageTypes.includes(file.type)){onError('Choose a JPG, PNG, or WebP image.');return null;}
    setUploading(true);
    try {return await upload(room,file);}
    catch(error){onError(error instanceof Error?error.message:'Upload failed.');return null;}
    finally{setUploading(false);}
  }
  async function attach(file:File) {
    const single=content.type==='image'||content.type==='feature';
    const attachment=await uploadFile(file,single);
    if(attachment)patch({files:single?[attachment]:[...latest.current.content.files,attachment]});
  }
  async function addToGallery(files:File[]) {
    for(const file of files){const attachment=await uploadFile(file,true);if(attachment)patch({files:[...latest.current.content.files,attachment]});}
  }
  const style=content.style??{};
  const titled=!untitledTypes.includes(content.type);
  const richField=(label:string,placeholder:string,className='')=><RichText className={className} label={label} placeholder={placeholder} value={htmlOf(content)} onChange={(html,text)=>patch({html,text})}/>;
  const options:React.ReactNode=content.type==='header'?<><Segmented label="Align" value={style.align??'left'} options={alignOptions} onChange={align=>setStyle({align})}/><Segmented label="Size" value={style.size??'l'} options={[{value:'s',label:'Small'},{value:'m',label:'Medium'},{value:'l',label:'Large'}]} onChange={size=>setStyle({size})}/></>
    :content.type==='caption'?<Segmented label="Align" value={style.align??'center'} options={alignOptions} onChange={align=>setStyle({align})}/>
    :content.type==='callout'?<ColorPicker label="Color" value={style.color??'#466c50'} colors={calloutColors} onChange={color=>setStyle({color})}/>
    :content.type==='cards'?<Segmented label="Cards per row" value={style.perRow??3} options={perRowOptions} onChange={perRow=>setStyle({perRow})}/>
    :content.type==='gallery'?<Segmented label="Images per row" value={style.perRow??3} options={perRowOptions} onChange={perRow=>setStyle({perRow})}/>
    :content.type==='timeline'?<Segmented label="Layout" value={style.variant??'left'} options={[{value:'left',label:'Single line'},{value:'alternate',label:'Alternating'}]} onChange={variant=>setStyle({variant})}/>
    :content.type==='divider'?<Segmented label="Style" value={style.variant??'line'} options={['line','double','dots','stars','flourish','wave'].map(v=>({value:v,label:v[0].toUpperCase()+v.slice(1)}))} onChange={variant=>setStyle({variant})}/>
    :content.type==='spacer'?<Segmented label="Height" value={style.size??'m'} options={[{value:'s',label:'Small'},{value:'m',label:'Medium'},{value:'l',label:'Large'}]} onChange={size=>setStyle({size})}/>
    :null;
  return <section className={`document-section ${dragging?'section-dragging':''} ${dropSide?`section-drop-${dropSide}`:''}`} data-section-type={content.type} id={`section-${note.id}`} onDragOver={onDragOver} onDrop={onDrop}>
    <div className="section-position-controls"><button className="icon-button section-drag-handle" draggable={!moveDisabled} disabled={moveDisabled} onDragStart={onDragStart} onDragEnd={onDragEnd} aria-label={`Drag ${title} to a new position`} title="Drag to move section"><GripVertical size={22}/><span>Move</span></button><span className="section-position">Section {index+1} of {count}</span><button className="icon-button" aria-label={`Move ${title} up`} title="Move section up" disabled={moveDisabled||index===0} onClick={()=>onMove(-1)}><ArrowUp size={20}/></button><button className="icon-button" aria-label={`Move ${title} down`} title="Move section down" disabled={moveDisabled||index===count-1} onClick={()=>onMove(1)}><ArrowDown size={20}/></button></div>
    <div className="section-locations">{peers.filter(peer=>peer.active&&peer.sectionId===note.id).map(peer=><span key={peer.clientId} style={{borderColor:peer.color,color:peer.color}}>{peer.name} is here</span>)}</div>
    <div className={`section-heading ${titled?'':'section-heading-compact'}`}>{titled?<input data-presence-field="title" aria-label="Section title" maxLength={120} value={title} onChange={e=>change(content,e.target.value)}/>:<span className="section-kind">{sectionLabels[content.type]}</span>}<span className={`section-status ${dirty?'pending':''}`} aria-live="polite">{status}</span><button className="icon-button section-delete" aria-label={`Delete ${title}`} disabled={uploading||saving.current} onClick={()=>setDeleteOpen(true)}><Trash2 size={18}/></button></div>
    {options&&<div className="section-options">{options}</div>}
    {content.type==='text'&&richField(`${title} text`,'Start writing. Make space for an idea, a plan, or a memory…','document-text')}
    {content.type==='header'&&<input className={`header-input header-${style.size??'l'}`} style={{textAlign:style.align??'left'}} data-presence-field="text" aria-label="Header text" maxLength={120} placeholder="Write a header…" value={content.text} onChange={e=>patch({text:e.target.value})}/>}
    {content.type==='caption'&&<div style={{textAlign:style.align??'center'}}>{richField('Caption','Add a caption…','caption-text')}</div>}
    {content.type==='quote'&&<blockquote className="quote-block">{richField('Quote','Write a quote or a line worth remembering…','quote-text')}<input className="quote-author" data-presence-field="author" aria-label="Quote attribution" maxLength={200} placeholder="— Who said it? (optional)" value={style.author??''} onChange={e=>setStyle({author:e.target.value})}/></blockquote>}
    {content.type==='callout'&&<div className="callout" style={{'--callout':style.color??'#466c50'} as React.CSSProperties}><input className="callout-icon" aria-label="Callout icon or emoji" maxLength={8} value={style.icon??''} placeholder="💡" onChange={e=>setStyle({icon:[...e.target.value].slice(-4).join('')})}/>{richField('Callout text','Highlight a note, tip, or something important…')}</div>}
    {content.type==='divider'&&<Divider variant={style.variant??'line'}/>}
    {content.type==='spacer'&&<div className={`spacer spacer-${style.size??'m'}`} aria-hidden="true"/>}
    {content.type==='cards'&&<CardsBlock cards={content.cards??[]} perRow={style.perRow??3} update={updateCards} uploadImage={file=>uploadFile(file,true)} uploading={uploading}/>}
    {content.type==='timeline'&&<TimelineBlock entries={content.entries??[]} variant={style.variant??'left'} update={updateEntries}/>}
    {content.type==='gallery'&&<GalleryBlock files={content.files} perRow={style.perRow??3} uploading={uploading||!isSupabase()} onAdd={files=>void addToGallery(files)} onRemove={path=>patch({files:latest.current.content.files.filter(f=>f.path!==path)})}/>}
    {content.type==='list'&&<div className="checklist">{content.items.map(item=><div className={`list-row ${item.done?'complete':''}`} key={item.id}><input type="checkbox" aria-label={`Complete ${item.text||'item'}`} checked={item.done} onChange={e=>change({...content,items:content.items.map(i=>i.id===item.id?{...i,done:e.target.checked}:i)})}/><input className="list-text" data-presence-field={`item-${item.id}`} aria-label="List item" value={item.text} placeholder="Write a list item…" onChange={e=>change({...content,items:content.items.map(i=>i.id===item.id?{...i,text:e.target.value}:i)})}/><button className="icon-button" aria-label="Remove list item" onClick={()=>change({...content,items:content.items.filter(i=>i.id!==item.id)})}><X size={17}/></button></div>)}<button className="add-item" onClick={()=>change({...content,items:[...content.items,{id:crypto.randomUUID(),text:'',done:false}]})}><Plus size={18}/> Add an item</button></div>}
    {(content.type==='image'||content.type==='feature')&&<div className={content.type==='feature'?'feature-section':'image-section'}><div className="section-image">{content.files[0]&&<PrivateImage path={content.files[0].path} alt={content.type==='image'?(content.text||content.files[0].name):content.files[0].name}/>}<label className="image-upload"><Upload size={20}/>{uploading?'Uploading...':content.files[0]?'Replace image':'Insert an image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading||!isSupabase()} onChange={e=>{const file=e.target.files?.[0];if(file)void attach(file);e.target.value='';}}/></label>{content.files[0]&&<button className="text-button" onClick={()=>change({...content,files:[]})}>Remove image</button>}</div>{richField(content.type==='feature'?'Text alongside image':'Image caption and description',content.type==='feature'?'Tell the story behind this image...':'Add a caption or image description...','document-text')}</div>}
    {content.type==='files'&&<div className="files-section">{content.files.map(file=><div className="file-row" key={file.path}><FileText size={24}/><button onClick={()=>openFile(file).catch(e=>onError(e.message))}><strong>{file.name}</strong><small>{(file.size/1024).toFixed(0)} KB · Open file</small></button><button className="icon-button" aria-label={`Remove ${file.name} from section`} onClick={()=>change({...content,files:content.files.filter(f=>f.path!==file.path)})}><X size={18}/></button></div>)}<label className={`upload-area ${uploading?'disabled':''}`}><Upload size={22}/><strong>{uploading?'Uploading…':'Choose a file to insert'}</strong><span>Images, PDFs, or text · Up to 10 MB</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" disabled={uploading||!isSupabase()} onChange={e=>{const file=e.target.files?.[0];if(file)void attach(file);e.target.value='';}}/></label>{!isSupabase()&&<p className="muted">File uploads become available when Supabase is connected.</p>}</div>}
    {conflict&&<div className="conflict-panel"><p>The section could not be saved. Your draft is kept on this device.</p><div><button className="secondary" onClick={()=>{setTitle(note.title);setContent(readSection(note.body));version.current=note.version;localStorage.removeItem(storageKey);setDirty(false);setConflict(false);setStatus('Saved');}}>Use latest saved version</button><button className="secondary" onClick={async()=>{try {await request('',{action:'add',roomId:room,title:`${title.slice(0,110)} (copy)`,body:JSON.stringify(content),kind:'note',pinned:false,memoryDate:''});localStorage.removeItem(storageKey);setTitle(note.title);setContent(readSection(note.body));version.current=note.version;setDirty(false);setConflict(false);await onSaved();}catch(error){onError(error instanceof Error?error.message:'Could not save copy.');}}}>Save draft as a new section</button></div></div>}
    {deleteOpen&&<DeleteSectionDialog title={title} onConfirm={remove} onClose={()=>setDeleteOpen(false)} onDeleted={()=>void onSaved().catch(error=>onError(error instanceof Error?error.message:'Could not refresh the workspace.'))}/>}
  </section>;
}
