const ID_PREFIX = 'i-';
const ID_LENGTH = 12;
const SUFFIX_LENGTH = ID_LENGTH - ID_PREFIX.length;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

/** Generate a unique 12-character ID matching existing rows, e.g. `i-doGaa_DeUC`. */
export function generateTransactionId(existingIds: Iterable<string>): string {
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds);

  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
    let suffix = '';

    for (const byte of bytes) {
      suffix += ID_CHARS[byte % ID_CHARS.length];
    }

    const id = `${ID_PREFIX}${suffix}`;
    if (id.length === ID_LENGTH && !existing.has(id)) {
      return id;
    }
  }

  throw new Error('Could not generate a unique transaction ID');
}
