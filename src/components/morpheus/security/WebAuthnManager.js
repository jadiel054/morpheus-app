const CK = 'morpheus_webauthn_credential'; const EF = 'biometric_enrolled'

export function isWebAuthnSupported() { return typeof window !== 'undefined' && !!window.PublicKeyCredential }
export function isWebAuthnRegistered() { return localStorage.getItem(EF) === 'true' }

export async function registerBiometric(userId, userName) {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn nao suportado')
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const cred = await navigator.credentials.create({ publicKey: { challenge, rp: { name: 'MORPHEUS', id: window.location.hostname }, user: { id: new TextEncoder().encode(userId), name: userName, displayName: userName }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000, authenticatorSelection: { userVerification: 'preferred' } } })
  localStorage.setItem(CK, JSON.stringify({ id: cred.id, rawId: Array.from(new Uint8Array(cred.rawId)) }))
  localStorage.setItem(EF, 'true'); return { success: true }
}

export async function verifyBiometric() {
  if (!isWebAuthnSupported() || !isWebAuthnRegistered()) throw new Error('Biometria nao configurada')
  const stored = JSON.parse(localStorage.getItem(CK) || '{}'); const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({ publicKey: { challenge, rpId: window.location.hostname, allowCredentials: [{ id: new Uint8Array(stored.rawId), type: 'public-key' }], timeout: 60000, userVerification: 'preferred' } })
  return { success: !!assertion }
}

export function removeBiometricCredential() { localStorage.removeItem(CK); localStorage.removeItem(EF) }
