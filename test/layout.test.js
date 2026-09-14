"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { bounds } = require('../shared/layout');
const preview = require('../setup/preview-model');
for (const [width,height] of [[1920,1080],[3840,2160],[900,700]]) test(`available athletics height respects header and safe edge at ${width}x${height}`, () => {
  const body={top:height*.04,bottom:height*.96};
  const header={bottom:height*.19};
  const gap=Math.min(32,Math.max(18,width*.016));
  const area=bounds(body,height,[header],[],gap);
  assert.ok(Math.abs(area.top+body.top-header.bottom-gap)<.001);
  assert.ok(Math.abs(area.top+body.top+area.height-body.bottom)<.001);
  const factor=preview.scale({width,height},600);
  assert.ok(factor*width<=600 && factor*height<=480);
  assert.equal(preview.overflows([{clientHeight:area.height,scrollHeight:area.height}]),false);
  assert.equal(preview.overflows([{clientHeight:area.height,scrollHeight:area.height+5}]),true);
});
test('bottom modules constrain space and oversized headers never create negative heights',()=>{
  assert.deepEqual(bounds({top:40,bottom:960},1000,[{bottom:200}],[{top:900}],20),{top:180,height:660});
  assert.equal(bounds({top:40,bottom:960},1000,[{bottom:990}],[],20).height,0);
});
test('school identity is positioned independently above the athletics pane grid',()=>{
  const css=require('node:fs').readFileSync('MMM-SchoolAthletics.css','utf8');
  assert.match(css,/\.school-athletics-school-name \{\s*position: fixed;/);
	assert.match(css,/top: clamp\(52px, 6vh, 78px\)/);
  assert.match(css,/font-size: clamp\(44px, 2\.7vw, 56px\)/);
  assert.match(css,/\.school-athletics-school-logo \{\s*width: clamp\(70px, 6vw, 122px\)/);
});
