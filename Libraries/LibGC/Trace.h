/*
 * Copyright (c) 2024, Sosuke Suzuki <aosukeke@gmail.com>
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

#include <AK/Types.h>
#include <AK/Vector.h>
#include <LibCore/SharedCircularQueue.h>
#include <LibThreading/WorkerThread.h>

namespace GC {

enum class TraceEventType: uint8_t {
    Allocate,
    GCMark,
};

struct TraceEvent {
    TraceEventType type;
    uint64_t absolute_address;
    uint64_t size;
};

using TraceEventSharedQueue = Core::SharedSingleProducerCircularQueue<TraceEvent, 1024>;

class Trace {
public:
    static Trace& instance()
    {
        static Trace instance(MUST(Threading::WorkerThread<int>::create(StringView("TraceWorker", 11))));
        return instance;
    }

    static void log(TraceEvent event)
    {
        instance().enqueue_event(event);
    }
private:
    Trace(NonnullOwnPtr<Threading::WorkerThread<int>> worker): m_worker(move(worker))
    {
        dbgln("Constructor");
        m_queue = MUST(TraceEventSharedQueue::create());
        auto started = m_worker->start_task([&]() -> ErrorOr<void, int> {
            Vector<TraceEvent, 1024> buffer;
            buffer.ensure_capacity(1024);
            while (true) {
                auto result = m_queue.dequeue();
                if (result.is_error()) {
                    auto queueStatus = result.error();
                    if (queueStatus == TraceEventSharedQueue::QueueStatus::Empty)
                        continue;
                }
                auto event = result.value();
                buffer.append(event);
                if (buffer.size() >= buffer.capacity()) {
                    // TODO: write to file
                    dbgln("WRITE!!");
                    buffer.clear_with_capacity();
                }
            }
            return { };
        });
        dbgln("started: {}", started);
    };

    void enqueue_event(TraceEvent event)
    {
        while (true) {
            auto result = m_queue.enqueue(event);
            if (result.is_error() && result.error() == TraceEventSharedQueue::QueueStatus::Full) {
                // dbgln("waiting");
            } else {
                // dbgln("address: 0x{:x}, size: {}", event.absolute_address, event.size);
                break;
            }
        }
    }

    TraceEventSharedQueue m_queue;
    NonnullOwnPtr<Threading::WorkerThread<int>> m_worker;
};

}

