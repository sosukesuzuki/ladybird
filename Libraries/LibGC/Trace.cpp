/*
 * Copyright (c) 2024, Sosuke Suzuki <aosukeke@gmail.com>
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#include <LibGC/Trace.h>
#include <AK/Format.h>

namespace JS {

void Trace::log() {
    dbgln("log from Trace");
}

}
