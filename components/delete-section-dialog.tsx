'use client';
import {useEffect,useRef,useState} from 'react';
import {Trash2,X} from 'lucide-react';
export function DeleteSectionDialog({title,onConfirm,onClose,onDeleted}:{title:string;onConfirm:()=>Promise<void>;onClose:()=>void;onDeleted:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [closing,setClosing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{if(timer.current)clearTimeout(timer.current);node?.close();};},[]);
 function close(deleted=false){if(closing)return;setClosing(true);const reduced=document.documentElement.dataset.reduceMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches;timer.current=setTimeout(()=>{onClose();if(deleted)onDeleted();},reduced?0:200);}
 async function confirm(){if(busy||closing)return;setBusy(true);setError('');try{await onConfirm();close(true);}catch(error){setError(error instanceof Error?error.message:'The section could not be deleted. Please try again.');setBusy(false);}}
 return <dialog ref={dialog} className={`delete-dialog ${closing?'closing':''}`} aria-labelledby="delete-section-title" aria-describedby="delete-section-description" onCancel={e=>{e.preventDefault();if(!busy)close();}} onClick={e=>{if(e.target===e.currentTarget&&!busy){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)close();}}}>
  <button className="icon-button delete-dialog-close" aria-label="Close deletion popup" disabled={busy||closing} onClick={()=>close()}><X size={22}/></button><span className="delete-dialog-symbol"><Trash2 size={29}/></span><h2 id="delete-section-title">Delete this section?</h2><p id="delete-section-description"><strong>{title||'Untitled section'}</strong> will be removed for everyone in this workspace. This cannot be undone.</p>{error&&<p className="delete-dialog-error" role="alert">{error}</p>}<div className="delete-dialog-actions"><button className="secondary" autoFocus disabled={busy||closing} onClick={()=>close()}>Keep section</button><button className="signout-button" disabled={busy||closing} onClick={()=>void confirm()}><Trash2 size={18}/>{busy?'Deleting…':'Delete section'}</button></div>
 </dialog>;
}
