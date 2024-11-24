/*
 * Copyright (c) 2021, Linus Groh <linusg@serenityos.org>
 * Copyright (c) 2024, Tim Flynn <trflynn89@ladybird.org>
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#pragma once

#include <LibJS/Runtime/PrototypeObject.h>
#include <LibJS/Runtime/Temporal/Instant.h>

namespace JS::Temporal {

class InstantPrototype final : public PrototypeObject<InstantPrototype, Instant> {
    JS_PROTOTYPE_OBJECT(InstantPrototype, Instant, Temporal.Instant);
    GC_DECLARE_ALLOCATOR(InstantPrototype);

public:
    virtual void initialize(Realm&) override;
    virtual ~InstantPrototype() override = default;

private:
    explicit InstantPrototype(Realm&);

    JS_DECLARE_NATIVE_FUNCTION(epoch_milliseconds_getter);
    JS_DECLARE_NATIVE_FUNCTION(epoch_nanoseconds_getter);
    JS_DECLARE_NATIVE_FUNCTION(value_of);
};

}
