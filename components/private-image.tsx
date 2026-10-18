'use client';
import {useEffect,useState} from 'react';
import {imageUrl} from '@/lib/workspace-client';
export function PrivateImage({path,alt,bucket='workspace-files',className='',fallback=''}:{path?:string;alt:string;bucket?:string;className?:string;fallback?:string}) {
  const [src,setSrc]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{setSrc('');setFailed(false);if(!path)return;let stopped=false;const update=()=>imageUrl(path,bucket).then(url=>{if(!stopped){setSrc(url);setFailed(false);}}).catch(()=>{if(!stopped)setFailed(true);});void update();const timer=setInterval(update,8*60000);return()=>{stopped=true;clearInterval(timer);};},[path,bucket]);
  return <span className={`private-image ${className}`}>{src&&!failed?<img src={src} alt={alt} onError={()=>setFailed(true)}/>:<span>{fallback||(failed?'Image unavailable':path?'Loading image…':'')}</span>}</span>;
}
