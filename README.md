# CHAT-APP

## Features

- Cookie/JWT authentication, profiles, online presence, image messages, and conversation requests.
- Accepted chat conversations with live Socket.IO messages, typing indicators, and read receipts.
- Message editing, soft deletion, in-conversation search, and optional disappearing messages. Disappearing messages expire 24 hours after sending through MongoDB's TTL index; the open client also polls to hide them before TTL cleanup runs.
- Browser-side encrypted text messages using Web Crypto ECDH P-256, HKDF, and AES-GCM. Images remain unencrypted in this iteration.

## Security notes

The text encryption is a portfolio-grade demonstration of E2E fundamentals, not a production-audited messaging protocol. The server stores ciphertext for newly encrypted text and receives only public keys. Private key JWKs are kept in browser localStorage for demo portability, which is weaker than a hardened device keystore. There is no Signal-style ratchet, verification UI, multi-device key management, or forward secrecy across sessions. Server-side text search can only search older/plaintext messages; encrypted text is instead searched locally after decryption in the open conversation.
