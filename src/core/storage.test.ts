import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeState } from './geometry';
import { STORAGE_KEYS, clearStored, readStored, writeStored, type KV } from './storage';

function fakeKV(initial: Record<string, string> = {}): KV & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

test('missing key returns fallback', () => {
  assert.equal(
    readStored(fakeKV(), 'k', (d) => d, 'fb'),
    'fb'
  );
});

test('round trip', () => {
  const kv = fakeKV();
  writeStored(kv, 'k', { a: 1 });
  assert.equal(kv.map.get('k'), '{"v":1,"data":{"a":1}}');
  assert.deepEqual(
    readStored(kv, 'k', (d) => d, null),
    { a: 1 }
  );
});

test('legacy unversioned value is migrated', () => {
  const kv = fakeKV({ s: '{"outerD":200}', a: '[{"name":"x","p":{}}]' });
  assert.equal(readStored(kv, 's', (d) => sanitizeState(d as Record<string, unknown>), null)?.outerD, 200);
  assert.deepEqual(
    readStored(kv, 'a', (d) => d, null),
    [{ name: 'x', p: {} }]
  );
});

test('legacy object with numeric v but no data is still legacy', () => {
  const kv = fakeKV({ k: '{"v":5,"x":1}' });
  assert.deepEqual(
    readStored(kv, 'k', (d) => d, null),
    { v: 5, x: 1 }
  );
});

test('corrupt json falls back', () => {
  assert.equal(
    readStored(fakeKV({ k: '{oops' }), 'k', (d) => d, 'fb'),
    'fb'
  );
});

test('parse that throws falls back', () => {
  const kv = fakeKV({ k: '{"v":1,"data":1}' });
  const parse = () => {
    throw new Error('bad');
  };
  assert.equal(readStored(kv, 'k', parse, 'fb'), 'fb');
});

test('getItem that throws falls back', () => {
  const kv: KV = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.equal(
    readStored(kv, 'k', (d) => d, 'fb'),
    'fb'
  );
});

test('future version falls back', () => {
  assert.equal(
    readStored(fakeKV({ k: '{"v":99,"data":{}}' }), 'k', (d) => d, 'fb'),
    'fb'
  );
});

test('write swallows quota errors', () => {
  const kv: KV = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
    removeItem: () => {},
  };
  assert.doesNotThrow(() => writeStored(kv, 'k', {}));
});

test('clearStored removes keys and swallows errors', () => {
  const kv = fakeKV({ a: '1', b: '2', c: '3' });
  clearStored(kv, ['a', 'b']);
  assert.deepEqual([...kv.map.keys()], ['c']);
  const bad: KV = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {
      throw new Error('x');
    },
  };
  assert.doesNotThrow(() => clearStored(bad, ['a']));
  assert.equal(STORAGE_KEYS.state, 'ringforge.state');
});
