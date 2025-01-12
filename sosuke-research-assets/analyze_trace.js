const fs = require('fs');

const filePath = './gc_events.bin'; // バイナリファイルのパス
const buffer = fs.readFileSync(filePath);

// 構造体のサイズ
const TRACE_EVENT_SIZE = 24;

let currentType = 0;

for (let offset = 0; offset < buffer.length; offset += TRACE_EVENT_SIZE) {
    const type = buffer.readUInt8(offset); // type (1 byte)
    if (currentType != type) {
        currentType = type;
        if (type === 0) {
            counter = 0;
//            console.log("allocate");
        } else if (type === 1) {
            counter = 0;
//            console.log("gc");
        }
    }
    const absoluteAddress = buffer.readBigUInt64LE(offset + 8); // absolute_address (8 bytes)
    const size = buffer.readBigUInt64LE(offset + 16); // size (8 bytes)

    console.log(`Type: ${type}, Absolute Address: 0x${absoluteAddress.toString(16)}, Size: ${size}`);
}

