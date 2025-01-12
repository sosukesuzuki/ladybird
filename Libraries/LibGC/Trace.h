/*
 * Copyright (c) 2024, Sosuke Suzuki <aosukeke@gmail.com>
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

#include <AK/Types.h>
#include <AK/Vector.h>
#include <AK/ByteBuffer.h>
#include <LibCore/File.h>
#include <LibCore/SharedCircularQueue.h>
#include <LibThreading/WorkerThread.h>

namespace GC {

enum class TraceEventType: uint8_t {
    BaseAddress,
    Allocate,
    GCMark,
};

struct TraceBaseAddressEvent {
    TraceEventType type;
    uint64_t absolute_address;
};

struct TraceEvent {
    TraceEventType type;
    uint32_t relative_address;
    uint32_t size;
};

using TraceEventSharedQueue = Core::SharedSingleProducerCircularQueue<TraceEvent, 1024>;

class Trace {
public:
    static Trace& instance()
    {
        static Trace instance(
            MUST(Threading::WorkerThread<int>::create(StringView("TraceWorker", 11))),
            MUST(Core::File::open(StringView("gc_events.bin", 13), Core::File::OpenMode::Write | Core::File::OpenMode::Append))
        );
        return instance;
    }

    static void recordAllocationEvent(uintptr_t absolute_address, size_t size) {
        auto& trace_instance = instance();
        uint32_t relative_address = trace_instance.to_relative_address(absolute_address);
        TraceEvent event {
            .type = TraceEventType::Allocate,
            .relative_address = relative_address,
            .size = static_cast<uint32_t>(size)
        };
        trace_instance.enqueue_event(event);
    }

    static void recordGCMarkEvent(uintptr_t absolute_address) {
        auto& trace_instance = instance();
        uint32_t relative_address = trace_instance.to_relative_address(absolute_address);
        TraceEvent event {
            .type = TraceEventType::GCMark,
            .relative_address = relative_address,
            .size = 0
        };
        trace_instance.enqueue_event(event);
    }

    static void log(TraceEvent event)
    {
        instance().enqueue_event(event);
    }
private:
    Trace(NonnullOwnPtr<Threading::WorkerThread<int>> worker, NonnullOwnPtr<Core::File> file): m_worker(move(worker)), m_file(move(file)), m_base_address(reinterpret_cast<uintptr_t>(this))
    {
        m_queue = MUST(TraceEventSharedQueue::create());
        m_worker->start_task([&]() -> ErrorOr<void, int> {
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
                // dbgln("from worker: type: {}, address: 0x{:x}, size: {}", static_cast<uint8_t>(event.type), event.absolute_address, event.size);
                buffer.append(event);
                if (buffer.size() >= buffer.capacity()) {
                    MUST(this->write(buffer));
                    buffer.clear_with_capacity();
                }
            }
            return { };
        });
        MUST(write(m_base_address));
    };

    uint32_t to_relative_address(uint64_t absolute_address) const
    {
        return static_cast<uint32_t>(absolute_address - m_base_address);
    }

    void enqueue_event(TraceEvent event)
    {
        while (true) {
            auto result = m_queue.enqueue(event);
            if (result.is_error() && result.error() == TraceEventSharedQueue::QueueStatus::Full) {
                // dbgln("waiting");
            } else {
                // dbgln("type: {}, address: 0x{:x}, size: {}", static_cast<uint8_t>(event.type), event.absolute_address, event.size);
                break;
            }
        }
    }

    ErrorOr<void> write(const uintptr_t base_address) {
        TraceBaseAddressEvent event(TraceEventType::BaseAddress, base_address);
        TRY(m_file->write_some({ &event, sizeof(TraceBaseAddressEvent) }));
        return { };
    }

    ErrorOr<void> write(const Vector<TraceEvent, 1024>& buffer) {
        TRY(m_file->write_some(ReadonlyBytes { buffer.data(), buffer.size() * sizeof(TraceEvent) }));
        return { };
    }

    TraceEventSharedQueue m_queue;
    NonnullOwnPtr<Threading::WorkerThread<int>> m_worker;
    NonnullOwnPtr<Core::File> m_file;
    uintptr_t m_base_address;
};

}

