import test from 'node:test';import assert from 'node:assert/strict';import {mergeRecords,coordinates,category,imageCandidate,authorized} from '../lib/model.ts';
const b={business_id:'BIZ-1',name:'A',category:'Accommodation',latitude:9.7,longitude:118.7,editorial_status:'approved',description:'Edited'};
test('merge keeps IDs, edits and approval; fills missing fields',()=>{const x=mergeRecords([b],[{...b,description:'Imported',editorial_status:'imported',phone:'123'}]);assert.equal(x.businesses.length,1);assert.equal(x.businesses[0].description,'Edited');assert.equal(x.businesses[0].editorial_status,'approved');assert.equal(x.businesses[0].phone,'123')});test('reject invalid coordinates and ID',()=>{assert.equal(mergeRecords([], [{...b,latitude:999},{...b,business_id:'../bad'}]).rejected,2)});test('coordinate order and categories',()=>{assert.deepEqual(coordinates(b),[9.7,118.7]);assert.equal(category(b),'Stay');assert.equal(category({...b,category:'Food & Beverage',subcategory:'cafe'}),'Drink')});test('new imported listings cannot self publish',()=>{assert.equal(mergeRecords([], [b]).businesses[0].editorial_status,'imported')});test('URL candidates are pending by default, not approved',()=>{assert.equal(imageCandidate({business_id:'BIZ-1',image_url:'https://example.org/x.jpg'})?.permission_status,'pending');assert.equal(imageCandidate({business_id:'BIZ-1',url:'file:///etc/passwd'}),null);assert.equal(authorized('pending'),false)});

test('reports duplicate IDs without replacing the first occurrence', () => {
  const result = mergeRecords([], [b, { ...b, name: 'Duplicate' }], true);
  assert.equal(result.businesses[0].name, 'A');
  assert.equal(result.duplicates, 1);
});

test('a repeat import is idempotent', () => {
  const result = mergeRecords([b], [b]);
  assert.equal(result.updated, 0);
  assert.equal(result.unchanged, 1);
});

test('preserves intentional empty manual edits and protected provenance',()=>{
  const edited={...b,description:'',source_url:'Original source',_manual_fields:['description']};
  const incoming={...b,description:'Imported',source_url:'New source'};
  assert.equal(mergeRecords([edited],[incoming]).businesses[0].description,'');
  const overwritten=mergeRecords([edited],[incoming],true).businesses[0];
  assert.equal(overwritten.description,'Imported');
  assert.equal(overwritten.source_url,'Original source');
});
