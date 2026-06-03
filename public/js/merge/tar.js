/**
 * tar.js - Lightweight TAR archive parser and creator for browser environments.
 * Supports reading/writing POSIX USTAR format with UTF-8 filenames.
 */
const Tar = (() => {
  'use strict';

  const BLOCK = 512;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /**
   * Parse a TAR archive from a Uint8Array.
   * @param {Uint8Array} buffer - Raw TAR data (already decompressed).
   * @returns {Array<{name: string, data: Uint8Array, type: string}>}
   */
  function parse(buffer) {
    if (!buffer || buffer.length < BLOCK) return [];

    const entries = [];
    let offset = 0;

    while (offset + BLOCK <= buffer.length) {
      const header = buffer.subarray(offset, offset + BLOCK);
      if (isZeroBlock(header)) break;

      const name = readStr(header, 0, 100);
      const typeFlag = String.fromCharCode(header[156]);
      const size = readOctal(header, 124, 12);

      // USTAR extended filename (prefix + name)
      const magic = readStr(header, 257, 6);
      let fullName = name;
      if (magic.startsWith('ustar')) {
        const prefix = readStr(header, 345, 155);
        if (prefix) fullName = prefix + '/' + name;
      }
      fullName = normalizePath(fullName);

      offset += BLOCK;

      const dataBlocks = Math.ceil(size / BLOCK) * BLOCK;

      // Skip symlinks (matches Python tar_filter behavior)
      if (typeFlag === '2') {
        offset += dataBlocks;
        continue;
      }

      // Extract file data
      if (size > 0 && offset + size <= buffer.length) {
        entries.push({ name: fullName, data: buffer.slice(offset, offset + size), type: typeFlag });
      } else if (typeFlag === '5' || typeFlag === '0' || typeFlag === '\0') {
        entries.push({ name: fullName, data: new Uint8Array(0), type: typeFlag });
      }

      offset += dataBlocks;
    }

    return entries;
  }

  /**
   * Create a TAR archive from entries.
   * Entries with names ending in '/' are treated as directories (type '5').
   * @param {Array<{name: string, data: Uint8Array}>} entries
   * @returns {Uint8Array}
   */
  function create(entries) {
    if (!entries || entries.length === 0) return new Uint8Array(BLOCK * 2);

    // Pre-calculate total size for single allocation
    let totalSize = BLOCK * 2; // end-of-archive marker
    for (const entry of entries) {
      const size = entry.name.endsWith('/') ? 0 : (entry.data ? entry.data.length : 0);
      totalSize += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    }

    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (const entry of entries) {
      const isDir = entry.name.endsWith('/');
      const data = isDir ? null : (entry.data || new Uint8Array(0));
      const size = data ? data.length : 0;

      // Build 512-byte POSIX header
      const header = result.subarray(offset, offset + BLOCK);
      writeName(header, entry.name);
      writeStr(header, 100, 8, isDir ? '0000755\0' : '0000644\0'); // mode
      writeStr(header, 108, 8, '0000000\0'); // uid = 0
      writeStr(header, 116, 8, '0000000\0'); // gid = 0
      writeStr(header, 124, 12, padOctal(size, 11) + '\0'); // size
      writeStr(header, 136, 12, padOctal(0, 11) + '\0');    // mtime = 0
      header[156] = isDir ? 53 : 48; // type: '5' dir or '0' file
      writeStr(header, 257, 6, 'ustar\0'); // magic
      writeStr(header, 263, 2, '00');       // version

      // Checksum: fill field with spaces, sum all bytes, write result
      for (let i = 148; i < 156; i++) header[i] = 32;
      let chksum = 0;
      for (let i = 0; i < BLOCK; i++) chksum += header[i];
      writeStr(header, 148, 8, padOctal(chksum, 6) + '\0 ');

      offset += BLOCK;

      // Write file data + padding
      if (size > 0) {
        result.set(data, offset);
        offset += Math.ceil(size / BLOCK) * BLOCK;
      }
    }

    // End-of-archive (remaining bytes are already zero)
    return result;
  }

  // --- Helpers ---

  function isZeroBlock(block) {
    for (let i = 0; i < BLOCK; i++) {
      if (block[i] !== 0) return false;
    }
    return true;
  }

  function readStr(buf, off, len) {
    let end = off;
    const limit = off + len;
    while (end < limit && buf[end] !== 0) end++;
    return decoder.decode(buf.subarray(off, end));
  }

  function readOctal(buf, off, len) {
    const s = readStr(buf, off, len).trim();
    return s ? (parseInt(s, 8) || 0) : 0;
  }

  function writeStr(buf, off, len, str) {
    const bytes = encoder.encode(str);
    const n = Math.min(bytes.length, len);
    for (let i = 0; i < n; i++) buf[off + i] = bytes[i];
  }

  function writeName(header, name) {
    const bytes = encoder.encode(name);
    if (bytes.length <= 100) {
      header.set(bytes, 0);
    } else {
      // USTAR: split into prefix (offset 345, max 155) + name (offset 0, max 100)
      const slash = name.lastIndexOf('/');
      if (slash !== -1) {
        writeStr(header, 345, 155, name.substring(0, slash));
        writeStr(header, 0, 100, name.substring(slash + 1));
      } else {
        writeStr(header, 0, 100, name.substring(0, 100));
      }
    }
  }

  function padOctal(num, digits) {
    return num.toString(8).padStart(digits, '0');
  }

  function normalizePath(p) {
    return p.replace(/^\.\//, '').replace(/^\//, '');
  }

  return { parse, create };
})();
