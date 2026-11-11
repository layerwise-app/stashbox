// Streams a ZIP archive (stored, not compressed) without buffering whole
// files: sizes and checksums go in data descriptors after each file.

export type ZipEntry = {
  path: string;
  isDir: boolean;
  date: Date;
  open?: () => Promise<ReadableStream<Uint8Array> | null>;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(crc: number, bytes: Uint8Array) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day =
    ((Math.max(date.getFullYear(), 1980) - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

function header(size: number, write: (view: DataView) => void) {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  async function* generate(): AsyncGenerator<Uint8Array> {
    let offset = 0;
    const central: Uint8Array[] = [];

    for (const entry of entries) {
      const name = encoder.encode(entry.isDir ? `${entry.path}/` : entry.path);
      const { time, day } = dosTime(entry.date);
      const flags = entry.isDir ? 0x0800 : 0x0808; // UTF-8 names, data descriptor
      const local = header(30, (v) => {
        v.setUint32(0, 0x04034b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, flags, true);
        v.setUint16(10, time, true);
        v.setUint16(12, day, true);
        v.setUint16(26, name.length, true);
      });
      const start = offset;
      yield local;
      yield name;
      offset += local.length + name.length;

      let crc = 0;
      let size = 0;
      if (!entry.isDir) {
        const stream = await entry.open?.();
        if (stream) {
          const reader = stream.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            crc = crc32(crc, value);
            size += value.length;
            yield value;
          }
        }
        if (size > 0xffffffff || offset + size > 0xffffffff)
          throw new Error('Download is too large for one ZIP file.');
        const descriptor = header(16, (v) => {
          v.setUint32(0, 0x08074b50, true);
          v.setUint32(4, crc, true);
          v.setUint32(8, size, true);
          v.setUint32(12, size, true);
        });
        yield descriptor;
        offset += size + descriptor.length;
      }

      const record = header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint16(8, flags, true);
        v.setUint16(12, time, true);
        v.setUint16(14, day, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, size, true);
        v.setUint32(24, size, true);
        v.setUint16(28, name.length, true);
        v.setUint32(38, entry.isDir ? 0x10 : 0, true);
        v.setUint32(42, start, true);
      });
      central.push(record, name);
    }

    let centralSize = 0;
    for (const part of central) {
      centralSize += part.length;
      yield part;
    }
    yield header(22, (v) => {
      v.setUint32(0, 0x06054b50, true);
      v.setUint16(8, entries.length, true);
      v.setUint16(10, entries.length, true);
      v.setUint32(12, centralSize, true);
      v.setUint32(16, offset, true);
    });
  }

  const iterator = generate();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    }
  });
}
