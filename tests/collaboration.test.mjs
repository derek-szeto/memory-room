import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {AppError, noteInput, saveNote, deleteNote} from '../lib/collaboration.ts';
function setup() {
  const sql = new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  }
  const room = '12345678-1234-1234-1234-123456789abc', other = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  sql.prepare('INSERT INTO rooms VALUES (?, ?, ?, ?, ?)').run(room,'Test room','alice','invite',1);
  sql.prepare('INSERT INTO members VALUES (?, ?, ?, ?)').run(room,'alice','Alice',1);
  sql.prepare('INSERT INTO members VALUES (?, ?, ?, ?)').run(room,'bob','Bob',1);
  const db = {prepare(query) {let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)||null;},async run(){return sql.prepare(query).run(...args);}};}};
  return {sql,db,room,other};
}
const fields={title:'Trip plans',body:'Meet at noon',kind:'note',pinned:false,memoryDate:''};
test('concurrent edits reject a stale version and preserve the saved draft',async()=>{
  const {db,sql,room}=setup();
  try {
    const noteId=await saveNote(db,{...fields,roomId:room,action:'add'},{id:'alice',name:'Alice'});
    await saveNote(db,{...fields,title:'Changed by Bob',action:'edit',roomId:room,noteId,version:1},{id:'bob',name:'Bob'});
    await assert.rejects(()=>saveNote(db,{...fields,title:'Stale draft',action:'edit',roomId:room,noteId,version:1},{id:'alice',name:'Alice'}),e=>e instanceof AppError&&e.status===409);
    const row=sql.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
    assert.equal(row.title,'Changed by Bob'); assert.equal(row.version,2); assert.equal(row.editor,'Bob');
  } finally {sql.close();}
});
test('room membership and room-scoped edits prevent access to another room',async()=>{
  const {db,sql,room,other}=setup();
  try {
    await assert.rejects(()=>saveNote(db,{...fields,roomId:room,action:'add'},{id:'outsider',name:'Mallory'}),e=>e.status===403);
    const noteId=await saveNote(db,{...fields,roomId:room,action:'add'},{id:'alice',name:'Alice'});
    sql.prepare('INSERT INTO members VALUES (?, ?, ?, ?)').run(other,'alice','Alice',1);
    await assert.rejects(()=>saveNote(db,{...fields,roomId:other,noteId,version:1,action:'edit'},{id:'alice',name:'Alice'}),e=>e.status===409);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM notes').get().n,1);
  } finally {sql.close();}
});
test('deletion also checks the version',async()=>{
  const {db,sql,room}=setup();
  try {
    const noteId=await saveNote(db,{...fields,roomId:room,action:'add'},{id:'alice',name:'Alice'});
    await assert.rejects(()=>deleteNote(db,{roomId:room,noteId,version:2},'alice'),e=>e.status===409);
    await deleteNote(db,{roomId:room,noteId,version:1},'bob');
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM notes').get().n,0);
  } finally {sql.close();}
});
test('input validation rejects invalid dates, oversized notes, and invalid types',()=>{
  assert.throws(()=>noteInput({...fields,memoryDate:'2026-02-30'}),AppError);
  assert.throws(()=>noteInput({...fields,body:'x'.repeat(20001)}),AppError);
  assert.throws(()=>noteInput({...fields,pinned:'yes'}),AppError);
  assert.equal(noteInput({...fields,memoryDate:'2026-02-28'}).memoryDate,'2026-02-28');
});
