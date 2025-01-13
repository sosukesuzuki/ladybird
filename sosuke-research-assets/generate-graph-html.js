const generateHtmlAndCss = (events) => {
    const timeline = [];
    let cumulativeSize = BigInt(0); // 現在の累積サイズ
    let gcPhaseStartSize = BigInt(0); // GC開始時の累積サイズ
    let markedAddresses = new Set(); // GCMarkでマークされたアドレス
    const allocationMap = new Map(); // アドレス -> サイズのマップ
    const gcPhases = []; // GCフェーズの情報を格納
    let inGcPhase = false; // 現在がGCフェーズかどうか
    let gcStartIndex = 0; // GCフェーズ開始時のインデックス

    events.forEach((event, index) => {
        if (event.type === 0) {
            // Allocationイベント
            if (inGcPhase) {
                // GCフェーズ終了処理
                const freedBytes = calculateUnmarkedSize(allocationMap, markedAddresses);
                gcPhases.push({
                    startIndex: gcStartIndex,
                    endIndex: index,
                    freedBytes,
                }); // GCフェーズ情報を記録
                cumulativeSize -= freedBytes;
                markedAddresses.clear(); // マークされたアドレスをリセット
                inGcPhase = false;
            }
            cumulativeSize += event.size;
            allocationMap.set(event.address, event.size); // アドレスとサイズを記録
        } else if (event.type === 1) {
            // GCMarkイベント
            if (!inGcPhase) {
                // GCフェーズ開始
                gcPhaseStartSize = cumulativeSize;
                gcStartIndex = index;
                inGcPhase = true;
            }
            markedAddresses.add(event.address); // マークされたアドレスを記録
        }

        // 時系列データを追加
        timeline.push({ address: event.absoluteAddress, size: cumulativeSize });
    });

    // GCフェーズが終了せずに終わるケースを処理
    if (inGcPhase) {
        const freedBytes = calculateUnmarkedSize(allocationMap, markedAddresses);
        gcPhases.push({
            startIndex: gcStartIndex,
            endIndex: timeline.length,
            freedBytes,
        }); // 最後のGCフェーズ情報を記録
        cumulativeSize -= freedBytes;
    }

    // HTMLテンプレート生成
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trace Events Timeline</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f4f4f4;
        }
        h1 {
            text-align: center;
        }
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
        .chart {
            width: 100%;
            height: 600px;
            position: relative;
            border-left: 2px solid #666;
            border-bottom: 2px solid #666;
        }
        .chart-line {
            stroke-width: 2;
            fill: none;
        }
        .chart-line-allocate {
            stroke: #007acc;
        }
        .chart-line-gc {
            stroke: #cc3300;
        }
        .gc-bar {
            fill: rgba(0, 255, 0, 0.3);
        }
        .gc-label {
            fill: #008000;
            font-size: 12px;
            text-anchor: middle;
        }
        .y-axis text {
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>Trace Events Timeline</h1>
    <div class="chart-container">
        <svg class="chart" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg">
            ${generateYAxis(timeline)}
            ${generateSvgPath(timeline)}
            ${generateGcBars(gcPhases, timeline.length)}
        </svg>
    </div>
</body>
</html>
    `;
    return htmlTemplate;
};

// 縦軸の目盛りを生成
const generateYAxis = (timeline) => {
    const maxSize = timeline.reduce((max, point) => (point.size > max ? point.size : max), BigInt(0));
    const numTicks = 10;
    const tickInterval = Number(maxSize) / numTicks;

    const ticks = [];
    for (let i = 0; i <= numTicks; i++) {
        const value = BigInt(Math.floor(tickInterval * i));
        const y = 600 - (i / numTicks) * 600; // 縦軸の位置
        ticks.push(`<text x="0" y="${y}" class="y-axis">${formatBytes(value)}</text>`);
    }
    return ticks.join("\n");
};

// GCバーを生成（フェーズごと）
const generateGcBars = (gcPhases, timelineLength) => {
    return gcPhases
        .map(({ startIndex, endIndex, freedBytes }) => {
            const xPos = (startIndex / timelineLength) * 1200; // 横位置（開始位置）
            const width = ((endIndex - startIndex) / timelineLength) * 1200; // 幅
            return `
                <rect class="gc-bar" x="${xPos}" y="0" width="${width}" height="600" />
                <text class="gc-label" x="${xPos + width / 2}" y="20">${formatBytes(freedBytes)} freed</text>
            `;
        })
        .join("\n");
};

// サンプリングを導入したSVGパス生成
const generateSvgPath = (timeline) => {
    const maxPoints = 1000; // 表示する最大データ点数
    const samplingRate = Math.max(1, Math.floor(timeline.length / maxPoints));

    const maxSize = timeline.reduce((max, point) => (point.size > max ? point.size : max), BigInt(0));
    const minSize = BigInt(0);
    const rangeSize = Number(maxSize - minSize) || 1;

    const pathData = timeline
        .filter((_, index) => index % samplingRate === 0)
        .map((point, index) => {
            const x = (index / (timeline.length / samplingRate)) * 1200;
            const y = 600 - ((Number(point.size - minSize)) / rangeSize) * 600;
            return `${index === 0 ? "M" : "L"} ${x},${y}`;
        })
        .join(" ");

    return `<path class="chart-line chart-line-allocate" d="${pathData}" />`;
};

// マークされなかったオブジェクトのサイズを計算
const calculateUnmarkedSize = (allocationMap, markedAddresses) => {
    let unmarkedSize = BigInt(0);
    for (const [address, size] of allocationMap.entries()) {
        if (!markedAddresses.has(address)) {
            unmarkedSize += size;
            allocationMap.delete(address); // 未マークのオブジェクトを削除
        }
    }
    return unmarkedSize;
};

// バイト数をフォーマット
const formatBytes = (bytes) => `${(Number(bytes) / (1024 * 1024)).toFixed(2)} MB`;

const parseBinaryFile = (filename) => {
    const buffer = fs.readFileSync(filename);
    const events = [];

    for (let offset = 0; offset < buffer.length; offset += TRACE_EVENT_SIZE) {
        const type = buffer.readUInt8(offset);
        const absoluteAddress = buffer.readBigUInt64LE(offset + 8);
        const size = buffer.readBigUInt64LE(offset + 16);

        events.push({ type, address: absoluteAddress, size });
    }

    return events;
};

// 実行
const filename = "gc_events.bin"; // バイナリファイル名
const events = parseBinaryFile(filename);
const htmlContent = generateHtmlAndCss(events);
fs.writeFileSync(OUTPUT_HTML_FILE, htmlContent);
console.log(`Visualization saved to ${OUTPUT_HTML_FILE}`);
