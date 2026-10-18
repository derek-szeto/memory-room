export type Room = {id: string; name: string; owner_id: string; invite: string | null; description?:string; icon_path?:string; layout?:'document'|'webpage'; metadata_version?:number;section_order?:string[];order_version?:number};
export type Note = {id: string; title: string; body: string; kind: 'note'|'memory'; pinned: number; memory_date: string; author: string; editor: string; created_at: number; updated_at: number; version: number};
export type Member = {user_id?:string; name: string; last_seen: number; avatar_path?:string; color?:string};
export type Profile = {id:string; name:string; avatar_path:string; color:string};
export type Attachment = {path: string; name: string; size: number};
export const sectionTypes = ['text','list','files','image','feature','header','caption','quote','callout','gallery','cards','timeline','divider','spacer'] as const;
export type SectionType = typeof sectionTypes[number];
export type Card = {id: string; title: string; subtitle: string; color: string; image: Attachment | null; html: string};
export type TimelineEntry = {id: string; date: string; title: string; html: string};
export type SectionStyle = {align?: 'left'|'center'|'right'; size?: 's'|'m'|'l'; color?: string; perRow?: number; variant?: string; author?: string; icon?: string};
/** `text` always holds plain text (search, export, legacy readers). `html` holds the formatted version when present. */
export type Section = {format: 'memory-section-v1'; type: SectionType; text: string; items: {id: string; text: string; done: boolean}[]; files: Attachment[]; html?: string; cards?: Card[]; entries?: TimelineEntry[]; style?: SectionStyle};
export const maxCardsPerRow = 4;
export const sectionLabels: Record<SectionType,string> = {text:'Text section',list:'Checklist',files:'Files & attachments',image:'Image',feature:'Text & image',header:'Header',caption:'Caption',quote:'Quote',callout:'Callout',gallery:'Gallery',cards:'Cards',timeline:'Timeline',divider:'Divider',spacer:'Spacer'};
/** Sections without a visible title field; their title is derived from their text for the outline. */
export const untitledTypes: SectionType[] = ['header','caption','quote','callout','divider','spacer'];
/** Sections that are purely visual and shouldn't appear in the document outline. */
export const decorativeTypes: SectionType[] = ['divider','spacer','caption'];
export function emptySection(type: Section['type']): Section {
  const section: Section = {format:'memory-section-v1',type,text:'',items:[],files:[]};
  if (type==='cards') {section.cards=[];section.style={perRow:3};}
  if (type==='timeline') {section.entries=[];section.style={variant:'left'};}
  if (type==='header') section.style={align:'left',size:'l'};
  if (type==='caption') section.style={align:'center'};
  if (type==='callout') section.style={color:'#466c50',icon:'💡'};
  if (type==='gallery') section.style={perRow:3};
  if (type==='divider') section.style={variant:'line'};
  if (type==='spacer') section.style={size:'m'};
  return section;
}
export function orderedNotes(notes:Note[],order:string[]=[]):Note[] {
  const ranks=new Map(order.map((id,index)=>[id,index]));
  return [...notes].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity)||a.created_at-b.created_at||a.id.localeCompare(b.id));
}
export function moveSection(order:string[],source:string,target:string,after=false):string[] {
  if(source===target||!order.includes(source)||!order.includes(target))return [...order];
  const next=order.filter(id=>id!==source);next.splice(next.indexOf(target)+(after?1:0),0,source);return next;
}
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value==='object';
const str = (value: unknown, max: number) => typeof value==='string' ? value.slice(0,max) : '';
export const safeHex = (value: unknown, fallback: string) => typeof value==='string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
function isAttachment(file: unknown): file is Attachment {
  return isObject(file) && typeof file.path==='string' && /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-zA-Z0-9._-]+$/.test(file.path) && typeof file.name==='string' && typeof file.size==='number' && file.size>=0;
}
function readStyle(value: unknown): SectionStyle {
  if (!isObject(value)) return {};
  const style: SectionStyle = {};
  if (value.align==='left'||value.align==='center'||value.align==='right') style.align=value.align;
  if (value.size==='s'||value.size==='m'||value.size==='l') style.size=value.size;
  if (typeof value.color==='string' && /^#[0-9a-fA-F]{6}$/.test(value.color)) style.color=value.color;
  if (typeof value.perRow==='number' && Number.isInteger(value.perRow)) style.perRow=Math.min(maxCardsPerRow,Math.max(1,value.perRow));
  if (typeof value.variant==='string' && /^[a-z]{1,20}$/.test(value.variant)) style.variant=value.variant;
  if (typeof value.author==='string') style.author=value.author.slice(0,200);
  if (typeof value.icon==='string') style.icon=[...value.icon].slice(0,4).join('');
  return style;
}
export function readSection(body: string): Section {
  try {
    const value = JSON.parse(body);
    if (value?.format === 'memory-section-v1' && sectionTypes.includes(value.type) && typeof value.text === 'string' && Array.isArray(value.items) && Array.isArray(value.files)
      && value.items.every((item: unknown)=>!!item && typeof item==='object' && 'id' in item && typeof item.id==='string' && 'text' in item && typeof item.text==='string' && 'done' in item && typeof item.done==='boolean')
      && value.files.every(isAttachment)) {
      // Optional fields are normalized individually so one bad card or entry can't hide the whole section.
      const section: Section = {format:value.format,type:value.type,text:value.text,items:value.items,files:value.files};
      if (typeof value.html==='string') section.html=value.html;
      if (Array.isArray(value.cards)) section.cards=value.cards.filter(isObject).map((card: Record<string, unknown>)=>({id:str(card.id,64)||crypto.randomUUID(),title:str(card.title,120),subtitle:str(card.subtitle,200),color:safeHex(card.color,'#466c50'),image:isAttachment(card.image)?card.image:null,html:str(card.html,20000)}));
      if (Array.isArray(value.entries)) section.entries=value.entries.filter(isObject).map((entry: Record<string, unknown>)=>({id:str(entry.id,64)||crypto.randomUUID(),date:str(entry.date,80),title:str(entry.title,120),html:str(entry.html,20000)}));
      if (value.style!==undefined) section.style=readStyle(value.style);
      return section;
    }
  } catch { /* Original plain-text notes remain readable. */ }
  return {...emptySection('text'), text:body};
}
const stripTags = (html: string) => html.replace(/<br\s*\/?>|<\/(div|p|li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
/** Plain text for search and the text export, including card and timeline content. */
export function sectionText(section: Section): string {
  const parts = [section.text];
  if (section.type==='list') parts.push(...section.items.map(item=>`[${item.done?'x':' '}] ${item.text}`));
  if (section.type==='files'||section.type==='gallery') parts.push(...section.files.map(file=>`${file.name} (${Math.round(file.size/1024)} KB)`));
  if (section.style?.author) parts.push(`— ${section.style.author}`);
  for (const card of section.cards ?? []) parts.push([card.title,card.subtitle,stripTags(card.html)].filter(Boolean).join('\n'));
  for (const entry of section.entries ?? []) parts.push([entry.date,entry.title,stripTags(entry.html)].filter(Boolean).join(' · '));
  return parts.filter(Boolean).join('\n');
}
