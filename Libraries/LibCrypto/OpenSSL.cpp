/*
 * Copyright (c) 2025, Altomani Gianluca <altomanigianluca@gmail.com>
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

#include <AK/ByteBuffer.h>
#include <LibCrypto/OpenSSL.h>
#include <openssl/evp.h>

namespace Crypto {

ErrorOr<OpenSSL_BN> unsigned_big_integer_to_openssl_bignum(UnsignedBigInteger const& integer)
{
    auto bn = TRY(OpenSSL_BN::create());
    auto buf = TRY(ByteBuffer::create_uninitialized(integer.byte_length()));
    auto integer_size = integer.export_data(buf.bytes());
    OPENSSL_TRY_PTR(BN_bin2bn(buf.bytes().data(), integer_size, bn.ptr()));
    return bn;
}

ErrorOr<UnsignedBigInteger> openssl_bignum_to_unsigned_big_integer(OpenSSL_BN const& bn)
{
    auto size = BN_num_bytes(bn.ptr());
    auto buf = TRY(ByteBuffer::create_uninitialized(size));
    BN_bn2bin(bn.ptr(), buf.bytes().data());
    return UnsignedBigInteger::import_data(buf.bytes().data(), size);
}

}
