const fs = require('fs');
const assert = require('node:assert/strict');

let base = 0;
let allocate = 0;
let mark = 0;

const generateHtmlAndCss = (events) => {
    const timeline = [];
    let cumulativeSize = 0;
    let baseAddress = 0;
    let markedAddresses = new Set();
    const allocationMap = new Map();
    const gcPhases = [];
    let inGcPhase = false;
    let gcStartIndex = 0;

    events.forEach((event, index) => {
        if (event.type === "BaseAddress") {
            base++;
            baseAddress = event.address;
        } else if (event.type === "Allocate") {
            allocate++;
            if (inGcPhase) {
                const freedBytes = calculateUnmarkedSize(allocationMap, markedAddresses);
                gcPhases.push({
                    startIndex: gcStartIndex,
                    endIndex: index,
                    freedBytes,
                });
                cumulativeSize -= freedBytes;
                markedAddresses.clear();
                inGcPhase = false;
            }
            cumulativeSize += event.size;
            allocationMap.set(event.address, event.size);
        } else if (event.type === "GCMark") {
            mark++;
            if (!inGcPhase) {
                gcStartIndex = index;
                inGcPhase = true;
            }
            markedAddresses.add(event.address);
        }

        timeline.push({
            address: baseAddress + event.address,
            size: cumulativeSize,
        });
    });

    if (inGcPhase) {
        const freedBytes = calculateUnmarkedSize(allocationMap, markedAddresses);
        gcPhases.push({
            startIndex: gcStartIndex,
            endIndex: timeline.length,
            freedBytes,
        });
        cumulativeSize -= freedBytes;
    }

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trace Events Timeline</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; }
        h1 { text-align: center; }
        .chart-container {
            width: 100%;
            max-width: 1200px;
            margin: 20px auto;
            padding: 20px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .chart { width: 100%; height: 600px; position: relative; border-left: 2px solid #666; border-bottom: 2px solid #666; }
        .chart-line { stroke-width: 2; fill: none; }
        .chart-line-allocate { stroke: #007acc; }
        .chart-line-gc { stroke: #cc3300; }
        .gc-bar { fill: rgba(0, 255, 0, 0.3); }
        .gc-label { fill: #008000; font-size: 12px; text-anchor: middle; }
        .y-axis text { font-size: 12px; }
    </style>
</head>
<body>
    <h1>Trace Events Timeline</h1>
    <div class="chart-container">
        <svg class="chart" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg">
            ${generateYAxis(timeline)}
            ${generateSvgPath(timeline)}
        </svg>
    </div>
</body>
</html>`;
    return htmlTemplate;
};

const generateYAxis = (timeline) => {
    const maxSize = timeline.reduce((max, point) => Math.max(max, point.size), 0);
    const numTicks = 10;
    const tickInterval = maxSize / numTicks;

    const ticks = [];
    for (let i = 0; i <= numTicks; i++) {
        const value = Math.floor(tickInterval * i);
        const y = 600 - (i / numTicks) * 600;
        ticks.push(`<text x="0" y="${y}" class="y-axis">${formatBytes(value)}</text>`);
    }
    return ticks.join("\n");
};

const generateGcBars = (gcPhases, timelineLength) => {
    return gcPhases
        .map(({ startIndex, endIndex, freedBytes }) => {
            const xPos = (startIndex / timelineLength) * 1200;
            const width = ((endIndex - startIndex) / timelineLength) * 1200;
            return `
                <rect class="gc-bar" x="${xPos}" y="0" width="${width}" height="600" />
                <text class="gc-label" x="${xPos + width / 2}" y="20">${formatBytes(freedBytes)} freed</text>`;
        })
        .join("\n");
};

const generateSvgPath = (timeline) => {
    const maxPoints = 1000;
    const samplingRate = Math.max(1, Math.floor(timeline.length / maxPoints));

    const maxSize = timeline.reduce((max, point) => Math.max(max, point.size), 0);
    const rangeSize = maxSize || 1;

    const pathData = timeline
        .filter((_, index) => index % samplingRate === 0)
        .map((point, index) => {
            const x = (index / (timeline.length / samplingRate)) * 1200;
            const y = 600 - (point.size / rangeSize) * 600;
            return `${index === 0 ? "M" : "L"} ${x},${y}`;
        })
        .join(" ");

    return `<path class="chart-line chart-line-allocate" d="${pathData}" />`;
};

const calculateUnmarkedSize = (allocationMap, markedAddresses) => {
    let unmarkedSize = 0;
    for (const [address, size] of allocationMap.entries()) {
        if (!markedAddresses.has(address)) {
            unmarkedSize += size;
            allocationMap.delete(address);
        }
    }
    return unmarkedSize;
};

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

const parseBinaryFile = (filename) => {
    const buffer = fs.readFileSync(filename);
    const events = [];


    let offset = 0;

    const baseAddressType = buffer.readUInt8(offset);
    assert(baseAddressType === 0);
    const baseAddress = buffer.readUint32LE(offset + 8)
    events.push({
        type: "BaseAddress",
        address: baseAddress,
    });
    offset += 16

    const TRACE_EVENT_SIZE = 12;
    for (; offset + TRACE_EVENT_SIZE <= buffer.length; offset += TRACE_EVENT_SIZE) {
        const type = buffer.readUInt8(offset);
        const address = buffer.readUInt32LE(offset + 4);
        const size = buffer.readUInt32LE(offset + 8);

        const typeValue = type === 0 ? "BaseAddress" : type === 1 ? "Allocate" : "GCMark";
        events.push({
            type: typeValue,
            address,
            size,
        });
    }

    return events;
};


const filename = "gc_events_2.bin";
const events = parseBinaryFile(filename);
const htmlContent = generateHtmlAndCss(events);
console.log("BASE: ", base);
console.log("ALLOCATE: ", allocate);
console.log("MARK: ", mark);
fs.writeFileSync("output_2.html", htmlContent);
