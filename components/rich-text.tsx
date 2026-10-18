'use client';
import {useEffect,useRef,useState} from 'react';
import {Bold,Italic,Underline,Strikethrough,Baseline,Highlighter,RemoveFormatting} from 'lucide-react';
import {sanitizeHtml} from '@/lib/rich-text';

export const textColors=['#283b33','#963f35','#c2622d','#b8901a','#466c50','#2f6f8f','#5b4a9e','#a3487a'];
const highlightColors=['#fff3a3','#ffd6c9','#d4f0c8','#cde7f7','#e6d9f7','#f9d3e6'];
type Command='bold'|'italic'|'underline'|'strikeThrough';
const formats:{command:Command;label:string;icon:React.ReactNode}[]=[{command:'bold',label:'Bold',icon:<Bold size={17}/>},{command:'italic',label:'Italic',icon:<Italic size={17}/>},{command:'underline',label:'Underline',icon:<Underline size={17}/>},{command:'strikeThrough',label:'Strikethrough',icon:<Strikethrough size={17}/>}];

/**
 * A formatted text field. `value` is HTML; `onChange` receives sanitized HTML and the plain text.
 * Deliberately has no data-presence-field: the caret overlay only understands input/textarea values.
 */
export function RichText({value,onChange,placeholder,label,className=''}:{value:string;onChange:(html:string,text:string)=>void;placeholder:string;label:string;className?:string}) {
  const editor=useRef<HTMLDivElement>(null),range=useRef<Range|null>(null),latest=useRef(value);
  const [empty,setEmpty]=useState(!value),[palette,setPalette]=useState<'foreColor'|'hiliteColor'|null>(null),[active,setActive]=useState<Command[]>([]);
  const sync=()=>{const el=editor.current;if(!el)return;const next=sanitizeHtml(latest.current);if(el.innerHTML!==next)el.innerHTML=next;setEmpty(!el.textContent?.trim());};
  // Remote or restored content only replaces the DOM while the person isn't typing in it.
  useEffect(()=>{latest.current=value;if(document.activeElement!==editor.current)sync();},[value]);
  useEffect(()=>{
    const save=()=>{const selection=document.getSelection(),el=editor.current;if(!selection?.rangeCount||!el||!el.contains(selection.anchorNode))return;range.current=selection.getRangeAt(0).cloneRange();setActive(formats.map(f=>f.command).filter(command=>document.queryCommandState(command)));};
    document.addEventListener('selectionchange',save);return()=>document.removeEventListener('selectionchange',save);
  },[]);
  function emit(){const el=editor.current;if(!el)return;setEmpty(!el.textContent?.trim());onChange(sanitizeHtml(el.innerHTML),el.innerText.replace(/\n+$/,''));}
  function run(command:string,argument?:string){
    const el=editor.current;if(!el)return;el.focus();
    const selection=document.getSelection();if(range.current&&selection){selection.removeAllRanges();selection.addRange(range.current);}
    // Colors are written as inline styles; bold/italic/underline stay as compact semantic tags.
    document.execCommand('styleWithCSS',false,String(command==='foreColor'||command==='hiliteColor'));
    document.execCommand(command,false,argument);emit();
  }
  return <div className={`rich-text-wrap ${className}`} onKeyDown={e=>{if(e.key==='Escape'&&palette){e.preventDefault();e.stopPropagation();setPalette(null);}}}>
    <div className="rich-toolbar" role="toolbar" aria-label={`Formatting for ${label}`} onMouseDown={e=>{if(!(e.target instanceof HTMLInputElement))e.preventDefault();}}>
      {formats.map(f=><button key={f.command} type="button" className={active.includes(f.command)?'on':''} aria-pressed={active.includes(f.command)} aria-label={f.label} title={f.label} onClick={()=>run(f.command)}>{f.icon}</button>)}
      <span className="rich-toolbar-divider"/>
      <button type="button" className={palette==='foreColor'?'on':''} aria-expanded={palette==='foreColor'} aria-label="Text color" title="Text color" onClick={()=>setPalette(palette==='foreColor'?null:'foreColor')}><Baseline size={17}/></button>
      <button type="button" className={palette==='hiliteColor'?'on':''} aria-expanded={palette==='hiliteColor'} aria-label="Highlight" title="Highlight" onClick={()=>setPalette(palette==='hiliteColor'?null:'hiliteColor')}><Highlighter size={17}/></button>
      <button type="button" aria-label="Clear formatting" title="Clear formatting" onClick={()=>run('removeFormat')}><RemoveFormatting size={17}/></button>
      {palette&&<div className="rich-palette" role="group" aria-label={palette==='foreColor'?'Text colors':'Highlight colors'}>
        {(palette==='foreColor'?textColors:highlightColors).map(color=><button key={color} type="button" className="swatch" style={{background:color}} aria-label={`${palette==='foreColor'?'Color':'Highlight'} ${color}`} onClick={()=>{run(palette,color);setPalette(null);}}/>)}
        {palette==='hiliteColor'&&<button type="button" className="swatch swatch-none" aria-label="Remove highlight" title="Remove highlight" onClick={()=>{run('hiliteColor','transparent');setPalette(null);}}/>}
        <label className="swatch swatch-custom" title="Custom color"><span className="sr-only">Custom color</span><input type="color" defaultValue={palette==='foreColor'?'#466c50':'#fff3a3'} onChange={e=>run(palette,e.target.value)}/></label>
      </div>}
    </div>
    <div ref={editor} className="rich-text" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} data-placeholder={placeholder} data-empty={empty}
      onInput={emit} onBlur={e=>{if(e.currentTarget.parentElement?.contains(e.relatedTarget as Node|null))return;setPalette(null);sync();}} onPaste={e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));}}/>
  </div>;
}
