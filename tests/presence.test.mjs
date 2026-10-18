import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validLocation} from '../lib/presence.ts';
import {contrastInk,safeColor} from '../lib/colors.ts';
test('presence rejects malformed coordinates and unsafe caret offsets',()=>{
 const location={sectionId:'12345678-1234-1234-1234-123456789abc',x:.5,y:.8,field:'text',caret:12};
 assert.equal(validLocation(location),true);
 for(const extra of [{x:Infinity},{y:NaN},{x:-.1},{y:1.1},{caret:-1},{caret:2.5},{caret:20001},{sectionId:'<script>'},{field:'x'.repeat(101)}])assert.equal(validLocation({...location,...extra}),false);
});
test('custom backgrounds choose a contrasting text color and validate colors',()=>{
 assert.equal(contrastInk('#ffffff'),'#142019');assert.equal(contrastInk('#000000'),'#ffffff');
 assert.equal(safeColor('url(unsafe)','#466c50'),'#466c50');
 assert.equal(safeColor('#abcdef','#466c50'),'#abcdef');
});
