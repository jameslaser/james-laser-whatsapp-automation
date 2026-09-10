# Environment and Security

Secrets are server-only and must be injected through the project secret manager. Never use `VITE_` prefixes for WhatsApp tokens, Meta secrets, Gemini keys, webhook verify tokens, or database credentials.

## Variables

See `.env.example` for variable names only. The canonical WhatsApp resource is WABA `1833666484124208` for `JAMES LASER` and the `James Laser Hair Removal WhatsApp Business App`.

## Validation

Health checks report presence or connectivity without exposing secret values. A successful health response is not an end-to-end validation: the project still needs real database connectivity, Meta webhook delivery, approved template sending, Gemini configuration, and repeat tests with authorized clinic data.
