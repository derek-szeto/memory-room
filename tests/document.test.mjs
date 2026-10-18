import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptySection,readSection,orderedNotes,moveSection,sectionText,sectionTypes,maxCardsPerRow} from '../lib/document.ts';
test('every section type survives serialization with its defaults',()=>{
  for(const type of sectionTypes) assert.deepEqual(readSection(JSON.stringify(emptySection(type))),emptySection(type));
});
test('cards, timeline entries, and formatted text round-trip',()=>{
  const image={path:'12345678-1234-1234-1234-123456789abc/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photo.png',name:'photo.png',size:300};
  const cards={...emptySection('cards'),cards:[{id:'c1',title:'Grandma',subtitle:'1931–2019',color:'#a3487a',image,html:'<b>Kind</b> and <span style="color: rgb(150, 63, 53);">fierce</span>'}],style:{perRow:2}};
  assert.deepEqual(readSection(JSON.stringify(cards)),cards);
  const timeline={...emptySection('timeline'),entries:[{id:'e1',date:'1998',title:'Moved',html:'<i>New city</i>'}],style:{variant:'alternate'}};
  assert.deepEqual(readSection(JSON.stringify(timeline)),timeline);
  const text={...emptySection('text'),text:'Hello',html:'<u>Hello</u>'};
  assert.deepEqual(readSection(JSON.stringify(text)),text);
});
test('malformed optional fields are normalized instead of hiding the section',()=>{
  const body=JSON.stringify({...emptySection('cards'),cards:[null,{id:'c1',title:5,color:'red',image:{path:'../x',name:'x',size:1}}],style:{perRow:99,align:'diagonal',color:'url(evil)'}});
  const section=readSection(body);
  assert.equal(section.type,'cards');
  assert.deepEqual(section.cards,[{id:'c1',title:'',subtitle:'',color:'#466c50',image:null,html:''}]);
  assert.deepEqual(section.style,{perRow:maxCardsPerRow});
});
test('search text includes card and timeline content without markup',()=>{
  const section={...emptySection('cards'),cards:[{id:'c1',title:'Lake house',subtitle:'',color:'#466c50',image:null,html:'<b>Summer</b> &amp; swims'}]};
  assert.match(sectionText(section),/Lake house\nSummer & swims/);
});
test('legacy notes retain their original content',()=>{
  for (const body of ['A memory\nAnother line','{"something":"else"}','']) assert.equal(readSection(body).text,body);
});
test('checklists survive serialization including completion',()=>{
  const section={...emptySection('list'),items:[{id:'item-1',text:'Book a train',done:true}]};
  assert.deepEqual(readSection(JSON.stringify(section)),section);
});
test('image and text/image sections retain captions, text, and private paths',()=>{
  for(const type of ['image','feature']) {
    const section={...emptySection(type),text:'Accessible caption',files:[{path:'12345678-1234-1234-1234-123456789abc/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photo.png',name:'photo.png',size:300}]};
    assert.deepEqual(readSection(JSON.stringify(section)),section);
  }
});
test('malformed shared sections fall back to readable text',()=>{
  for(const extra of [{items:[null]},{files:[{path:'../../elsewhere',name:'file',size:10}]},{type:'unknown'}]) {
    const body=JSON.stringify({...emptySection('text'),...extra});
    assert.equal(readSection(body).text,body);
  }
});
test('section moves preserve other sections and support before/after destinations',()=>{
  const order=['a','b','c','d'];
  assert.deepEqual(moveSection(order,'d','b'),['a','d','b','c']);
  assert.deepEqual(moveSection(order,'a','c',true),['b','c','a','d']);
  assert.deepEqual(moveSection(order,'a','a'),order);
  assert.deepEqual(moveSection(order,'missing','b'),order);
  assert.deepEqual(order,['a','b','c','d']);
});
test('shared order is applied with stable fallbacks for legacy and newly added sections',()=>{
  const notes=[{id:'a',created_at:1},{id:'b',created_at:2},{id:'c',created_at:3}];
  assert.deepEqual(orderedNotes(notes,['b','a']).map(n=>n.id),['b','a','c']);
  assert.deepEqual(orderedNotes(notes,[]).map(n=>n.id),['a','b','c']);
});
