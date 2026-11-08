import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContactPhone, validContactPhone } from '../../web/src/pages/chat/phoneInput.js';

test('Mobile contact entry normalizes pasted formatting without guessing a country', () => {
  for (const value of ['+51900000099', ' +51 900 000 099 ', '+51 (900) 000-099']) {
    assert.equal(normalizeContactPhone(value), '+51900000099');
    assert.equal(validContactPhone(value), true);
  }
  for (const value of ['900000099', '51900000099', '+0123456789', '+51call900000099', '+51', '+51900000099@s.whatsapp.net']) assert.equal(validContactPhone(value), false, value);
});
