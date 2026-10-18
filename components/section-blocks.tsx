'use client';
import {useEffect,useRef,useState} from 'react';
import {Plus,X,Trash2,Upload,ArrowUpRight,ChevronLeft,ChevronRight,ArrowUp,ArrowDown} from 'lucide-react';
import {maxCardsPerRow,type Attachment,type Card,type TimelineEntry} from '@/lib/document';
import {PrivateImage} from './private-image';
import {RichText,textColors} from './rich-text';

type Upload=(file:File)=>Promise<Attachment|null>;
const cardColors=['#466c50','#2f6f8f','#5b4a9e','#a3487a','#c2622d','#b8901a','#963f35','#283b33'];
const imageTypes='image/jpeg,image/png,image/webp';

export function Segmented<T extends string|number>({label,value,options,onChange}:{label:string;value:T;options:{value:T;label:string}[];onChange:(value:T)=>void}) {
  return <div className="segmented" role="group" aria-label={label}><span>{label}</span>{options.map(o=><button key={String(o.value)} type="button" aria-pressed={value===o.value} className={value===o.value?'on':''} onClick={()=>onChange(o.value)}>{o.label}</button>)}</div>;
}
export function ColorPicker({label,value,colors,onChange}:{label:string;value:string;colors:string[];onChange:(color:string)=>void}) {
  return <div className="color-picker" role="group" aria-label={label}><span>{label}</span>{colors.map(color=><button key={color} type="button" className={`swatch ${value===color?'on':''}`} style={{background:color}} aria-label={`${label} ${color}`} aria-pressed={value===color} onClick={()=>onChange(color)}/>)}<label className="swatch swatch-custom" title="Custom color"><span className="sr-only">Custom {label.toLowerCase()}</span><input type="color" value={value} onChange={e=>onChange(e.target.value)}/></label></div>;
}

export function CardsBlock({cards,perRow,update,uploadImage,uploading}:{cards:Card[];perRow:number;update:(fn:(cards:Card[])=>Card[])=>void;uploadImage:Upload;uploading:boolean}) {
  const [openId,setOpenId]=useState<string|null>(null);
  const open=cards.find(card=>card.id===openId);
  function add(){const id=crypto.randomUUID();update(list=>[...list,{id,title:'',subtitle:'',color:cardColors[list.length%cardColors.length],image:null,html:''}]);setOpenId(id);}
  const edit=(id:string,patch:Partial<Card>)=>update(list=>list.map(card=>card.id===id?{...card,...patch}:card));
  return <>
    <div className="card-grid" data-per-row={Math.min(maxCardsPerRow,perRow)}>
      {cards.map(card=><button key={card.id} type="button" className="memory-card" style={{'--card':card.color} as React.CSSProperties} onClick={()=>setOpenId(card.id)} aria-haspopup="dialog">
        {card.image&&<PrivateImage className="memory-card-image" path={card.image.path} alt=""/>}
        <span className="memory-card-body"><strong>{card.title||'Untitled card'}</strong>{card.subtitle&&<small>{card.subtitle}</small>}<span className="memory-card-more">Open <ArrowUpRight size={16}/></span></span>
      </button>)}
      <button type="button" className="memory-card memory-card-add" onClick={add}><Plus size={22}/><span>Add a card</span></button>
    </div>
    {open&&<CardDialog card={open} index={cards.indexOf(open)} count={cards.length} uploading={uploading} onClose={()=>setOpenId(null)}
      onChange={patch=>edit(open.id,patch)}
      onUpload={async file=>{const image=await uploadImage(file);if(image)edit(open.id,{image});}}
      onMove={direction=>update(list=>{const i=list.findIndex(c=>c.id===open.id),j=i+direction;if(i<0||j<0||j>=list.length)return list;const next=[...list];[next[i],next[j]]=[next[j],next[i]];return next;})}
      onRemove={()=>{update(list=>list.filter(c=>c.id!==open.id));setOpenId(null);}}/>}
  </>;
}

function CardDialog({card,index,count,uploading,onClose,onChange,onUpload,onMove,onRemove}:{card:Card;index:number;count:number;uploading:boolean;onClose:()=>void;onChange:(patch:Partial<Card>)=>void;onUpload:(file:File)=>Promise<void>;onMove:(direction:-1|1)=>void;onRemove:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),[confirming,setConfirming]=useState(false);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  return <dialog ref={dialog} className="card-dialog" style={{'--card':card.color} as React.CSSProperties} aria-label={card.title||'Card details'} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}>
    <button className="icon-button card-dialog-close" aria-label="Close card" onClick={onClose}><X size={22}/></button>
    <div className="card-dialog-image">
      {card.image&&<PrivateImage path={card.image.path} alt={card.title||card.image.name}/>}
      <div className="card-dialog-image-actions"><label className="image-upload"><Upload size={18}/>{uploading?'Uploading…':card.image?'Replace image':'Add an image'}<input type="file" accept={imageTypes} disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void onUpload(file);e.target.value='';}}/></label>{card.image&&<button className="text-button" onClick={()=>onChange({image:null})}>Remove image</button>}</div>
    </div>
    <input className="card-dialog-title" aria-label="Card title" placeholder="Card title" maxLength={120} value={card.title} onChange={e=>onChange({title:e.target.value})}/>
    <input className="card-dialog-subtitle" aria-label="Card subtitle" placeholder="A short line shown on the card" maxLength={200} value={card.subtitle} onChange={e=>onChange({subtitle:e.target.value})}/>
    <ColorPicker label="Card color" value={card.color} colors={cardColors} onChange={color=>onChange({color})}/>
    <RichText className="card-dialog-description" label="Card description" placeholder="Write the full story for this card…" value={card.html} onChange={html=>onChange({html})}/>
    <div className="card-dialog-actions">
      <div><button className="icon-button" aria-label="Move card earlier" title="Move earlier" disabled={index===0} onClick={()=>onMove(-1)}><ChevronLeft size={20}/></button><span>Card {index+1} of {count}</span><button className="icon-button" aria-label="Move card later" title="Move later" disabled={index===count-1} onClick={()=>onMove(1)}><ChevronRight size={20}/></button></div>
      <div>{confirming?<><button className="secondary" onClick={()=>setConfirming(false)}>Keep card</button><button className="signout-button" onClick={onRemove}><Trash2 size={17}/> Delete for everyone</button></>:<><button className="secondary" onClick={()=>setConfirming(true)}><Trash2 size={17}/> Delete card</button><button className="primary" onClick={onClose}>Done</button></>}</div>
    </div>
  </dialog>;
}

export function TimelineBlock({entries,variant,update}:{entries:TimelineEntry[];variant:string;update:(fn:(entries:TimelineEntry[])=>TimelineEntry[])=>void}) {
  const edit=(id:string,patch:Partial<TimelineEntry>)=>update(list=>list.map(entry=>entry.id===id?{...entry,...patch}:entry));
  const move=(id:string,direction:-1|1)=>update(list=>{const i=list.findIndex(e=>e.id===id),j=i+direction;if(i<0||j<0||j>=list.length)return list;const next=[...list];[next[i],next[j]]=[next[j],next[i]];return next;});
  return <div className={`timeline timeline-${variant==='alternate'?'alternate':'left'}`}>
    <ol>{entries.map((entry,index)=><li className="timeline-entry" key={entry.id}><span className="timeline-dot" aria-hidden="true"/><div className="timeline-card">
      <input className="timeline-date" data-presence-field={`date-${entry.id}`} aria-label="Date or period" placeholder="When? e.g. Summer 1998" maxLength={80} value={entry.date} onChange={e=>edit(entry.id,{date:e.target.value})}/>
      <input className="timeline-title" data-presence-field={`title-${entry.id}`} aria-label="Moment title" placeholder="What happened?" maxLength={120} value={entry.title} onChange={e=>edit(entry.id,{title:e.target.value})}/>
      <RichText className="timeline-text" label={`${entry.title||'Moment'} description`} placeholder="Add the details…" value={entry.html} onChange={html=>edit(entry.id,{html})}/>
      <div className="timeline-entry-actions"><button className="icon-button" aria-label="Move moment earlier" disabled={index===0} onClick={()=>move(entry.id,-1)}><ArrowUp size={17}/></button><button className="icon-button" aria-label="Move moment later" disabled={index===entries.length-1} onClick={()=>move(entry.id,1)}><ArrowDown size={17}/></button><button className="icon-button" aria-label={`Remove ${entry.title||'moment'}`} onClick={()=>update(list=>list.filter(e=>e.id!==entry.id))}><X size={17}/></button></div>
    </div></li>)}</ol>
    <button className="add-item" onClick={()=>update(list=>[...list,{id:crypto.randomUUID(),date:'',title:'',html:''}])}><Plus size={18}/> Add a moment</button>
  </div>;
}

export function GalleryBlock({files,perRow,uploading,onAdd,onRemove}:{files:Attachment[];perRow:number;uploading:boolean;onAdd:(files:File[])=>void;onRemove:(path:string)=>void}) {
  return <div className="gallery-grid" data-per-row={Math.min(maxCardsPerRow,perRow)}>
    {files.map(file=><figure key={file.path} className="gallery-item"><PrivateImage path={file.path} alt={file.name}/><button className="icon-button gallery-remove" aria-label={`Remove ${file.name}`} onClick={()=>onRemove(file.path)}><X size={17}/></button></figure>)}
    <label className={`gallery-add ${uploading?'disabled':''}`}><Upload size={22}/><span>{uploading?'Uploading…':'Add images'}</span><input type="file" multiple accept={imageTypes} disabled={uploading} onChange={e=>{const list=[...(e.target.files??[])];if(list.length)onAdd(list);e.target.value='';}}/></label>
  </div>;
}

export function Divider({variant}:{variant:string}) {
  if(variant==='wave')return <div className="divider divider-wave" role="separator"><svg viewBox="0 0 240 16" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8 Q 15 0 30 8 T 60 8 T 90 8 T 120 8 T 150 8 T 180 8 T 210 8 T 240 8" fill="none" stroke="currentColor" strokeWidth="2"/></svg></div>;
  const glyph=variant==='dots'?'•  •  •':variant==='stars'?'✦  ✦  ✦':variant==='flourish'?'❦':'';
  return <div className={`divider divider-${variant}`} role="separator">{glyph&&<span aria-hidden="true">{glyph}</span>}</div>;
}
export const calloutColors=textColors.slice(1);
