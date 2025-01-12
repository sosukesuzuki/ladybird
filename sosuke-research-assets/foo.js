// 大量のオブジェクトを生成して保持
let memoryHog = [];
let counter = 0;

function allocateAndRelease() {
    while (true) {
        // ランダムなオブジェクトを生成（例: 10,000個のデータ）
        let largeObject = new Array(10 ** 4).fill({ value: Math.random() });

        // 配列に追加して保持する
        memoryHog.push(largeObject);

        counter++;

        // 一定の世代を超えたオブジェクトを解放
        if (memoryHog.length > 50) {
            memoryHog.shift(); // 古い世代のオブジェクトを削除
        }

        if (counter % 100 === 0) {
            console.log(`Allocated ${counter} chunks, memoryHog length: ${memoryHog.length}`);
        }
    }
}

try {
    allocateAndRelease();
} catch (e) {
    console.error("Out of memory or GC triggered!", e);
}
