export default () => ({
  okx: {
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_API_SECRET,
    passphrase: process.env.OKX_PASSPHRASE,
    baseUrl: process.env.OKX_BASE_URL || 'https://www.okx.com',
  },
});
