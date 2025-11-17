export default () => ({
  okx: {
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_API_SECRET,
    passphrase: process.env.OKX_PASSPHRASE,
    baseUrl: process.env.OKX_BASE_URL || 'https://www.okx.com',
    apiKeyHEDGE: process.env.OKX_HEDGE_API_KEY,
    secretKeyHEDGE: process.env.OKX_HEDGE_API_SECRET,
    passphraseHEDGE: process.env.OKX_HEDGE_PASSPHRASE,
  },
});
