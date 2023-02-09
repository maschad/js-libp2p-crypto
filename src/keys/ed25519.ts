import crypto from 'crypto'
import { promisify } from 'util'
import { toString as uint8arrayToString } from 'uint8arrays/to-string'
import { fromString as uint8arrayFromString } from 'uint8arrays/from-string'
import type { Uint8ArrayKeyPair } from './interface'

const keypair = promisify(crypto.generateKeyPair)

const PUBLIC_KEY_BYTE_LENGTH = 32
const PRIVATE_KEY_BYTE_LENGTH = 64 // private key is actually 32 bytes but for historical reasons we concat private and public keys
const KEYS_BYTE_LENGTH = 32
const SIGNATURE_BYTE_LENGTH = 64

export { PUBLIC_KEY_BYTE_LENGTH as publicKeyLength }
export { PRIVATE_KEY_BYTE_LENGTH as privateKeyLength }

function derivePublicKey (privateKey: Uint8Array): Uint8Array {
  const keyObject = crypto.createPrivateKey({
    format: 'jwk',
    key: {
      crv: 'Ed25519',
      x: '',
      d: uint8arrayToString(privateKey, 'base64url'),
      kty: 'OKP'
    }
  })
  const jwk = keyObject.export({
    format: 'jwk'
  })

  if (jwk.x == null || jwk.x === '') {
    throw new Error('Could not export JWK public key')
  }

  return uint8arrayFromString(jwk.x, 'base64url')
}

export async function generateKey (): Promise<Uint8ArrayKeyPair> {
  const key = await keypair('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'jwk' },
    privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
  })

  // @ts-expect-error node types are missing jwk as a format
  const privateKeyRaw = uint8arrayFromString(key.privateKey.d, 'base64url')
  // @ts-expect-error node types are missing jwk as a format
  const publicKeyRaw = uint8arrayFromString(key.privateKey.x, 'base64url')

  return {
    privateKey: concatKeys(privateKeyRaw, publicKeyRaw),
    publicKey: publicKeyRaw
  }
}

/**
 * Generate keypair from a 32 byte uint8array
 */
export async function generateKeyFromSeed (seed: Uint8Array): Promise<Uint8ArrayKeyPair> {
  if (seed.length !== KEYS_BYTE_LENGTH) {
    throw new TypeError('"seed" must be 32 bytes in length.')
  } else if (!(seed instanceof Uint8Array)) {
    throw new TypeError('"seed" must be a node.js Buffer, or Uint8Array.')
  }

  // based on node forges algorithm, the seed is used directly as private key
  const publicKeyRaw = derivePublicKey(seed)

  return {
    privateKey: concatKeys(seed, publicKeyRaw),
    publicKey: publicKeyRaw
  }
}

export async function hashAndSign (key: Uint8Array, msg: Uint8Array): Promise<Buffer> {
  if (!(key instanceof Uint8Array)) {
    throw new TypeError('"key" must be a node.js Buffer, or Uint8Array.')
  }

  let privateKey: Uint8Array
  let publicKey: Uint8Array

  if (key.byteLength === PRIVATE_KEY_BYTE_LENGTH) {
    privateKey = key.subarray(0, 32)
    publicKey = key.subarray(32)
  } else if (key.byteLength === KEYS_BYTE_LENGTH) {
    privateKey = key.subarray(0, 32)
    publicKey = derivePublicKey(privateKey)
  } else {
    throw new TypeError('"key" must be 64 or 32 bytes in length.')
  }

  const obj = crypto.createPrivateKey({
    format: 'jwk',
    key: {
      crv: 'Ed25519',
      d: uint8arrayToString(privateKey, 'base64url'),
      x: uint8arrayToString(publicKey, 'base64url'),
      kty: 'OKP'
    }
  })

  return crypto.sign(null, msg, obj)
}

export async function hashAndVerify (key: Uint8Array, sig: Uint8Array, msg: Uint8Array): Promise<boolean> {
  if (key.byteLength !== PUBLIC_KEY_BYTE_LENGTH) {
    throw new TypeError('"key" must be 32 bytes in length.')
  } else if (!(key instanceof Uint8Array)) {
    throw new TypeError('"key" must be a node.js Buffer, or Uint8Array.')
  }

  if (sig.byteLength !== SIGNATURE_BYTE_LENGTH) {
    throw new TypeError('"sig" must be 64 bytes in length.')
  } else if (!(sig instanceof Uint8Array)) {
    throw new TypeError('"sig" must be a node.js Buffer, or Uint8Array.')
  }

  const obj = crypto.createPublicKey({
    format: 'jwk',
    key: {
      crv: 'Ed25519',
      x: uint8arrayToString(key, 'base64url'),
      kty: 'OKP'
    }
  })

  return crypto.verify(null, msg, obj, sig)
}

function concatKeys (privateKeyRaw: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const privateKey = new Uint8Array(PRIVATE_KEY_BYTE_LENGTH)
  for (let i = 0; i < KEYS_BYTE_LENGTH; i++) {
    privateKey[i] = privateKeyRaw[i]
    privateKey[KEYS_BYTE_LENGTH + i] = publicKey[i]
  }
  return privateKey
}
