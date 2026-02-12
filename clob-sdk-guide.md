# Using the Polymarket CLOB SDK with LoremIpsumTrade

LoremIpsumTrade exposes a CLOB-compatible API that mirrors Polymarket's endpoint paths and response formats. This means you can use the official `@polymarket/clob-client` SDK to trade programmatically on our paper trading platform — just point it at our server URL instead of Polymarket's.

---

## Prerequisites

```bash
npm install @polymarket/clob-client @ethersproject/wallet
```

> The SDK requires an ethers v5 `Wallet` for EIP-712 order signing. Any random private key works — it's only used for client-side signing, not for on-chain transactions.

---

## Getting an API Key

1. Open the LoremIpsumTrade terminal UI
2. Connect your Ethereum wallet
3. Navigate to the **API Keys** tab
4. Click **Create API Key** — give it a name and select scopes (`read`, `trade`)
5. **Copy the key immediately** — it is only shown once and cannot be retrieved later

Your key will look like: `pp_aBcDeFgHiJk...`

---

## Client Setup

```typescript
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';

// Any random private key — only used for client-side order signing
const wallet = Wallet.createRandom();

const API_KEY = 'pp_your_api_key_here';
const HMAC_SECRET = Buffer.from('any-random-string').toString('base64');

const client = new ClobClient(
  'http://localhost:3001',  // LoremIpsumTrade API URL
  137,                       // Chain ID (Polygon)
  wallet,
  {
    key: API_KEY,
    secret: HMAC_SECRET,       // Required by SDK, not validated server-side
    passphrase: 'any-string',  // Required by SDK, not validated server-side
  },
);
```

> **Note:** The `secret` and `passphrase` fields are required by the SDK constructor but our server only validates the API key itself. You can use any values.

---

## Getting Active Markets & Token IDs

Before placing orders, you need to know which token IDs are available. Fetch active markets from our REST API:

```typescript
const response = await fetch('http://localhost:3001/markets/active');
const { data } = await response.json();

// data.markets is an array of active BTC 15-minute markets
// Each market has a clobTokenIds array with two token IDs:
//   [0] = UP token (BTC goes up)
//   [1] = DOWN token (BTC goes down)
const market = data.markets[0];
const [tokenUp, tokenDown] = market.clobTokenIds;

console.log(`Market: ${market.question}`);
console.log(`UP token:   ${tokenUp}`);
console.log(`DOWN token: ${tokenDown}`);
console.log(`Expires:    ${market.endDate}`);
```

---

## Operations

### Get Order Book

```typescript
const book = await client.getOrderBook(tokenUp);

console.log('Bids:', book.bids);  // [{ price: '0.45', size: '100' }, ...]
console.log('Asks:', book.asks);  // [{ price: '0.55', size: '100' }, ...]
console.log('Tick size:', book.tick_size);
```

### Get Tick Size

```typescript
const tickSize = await client.getTickSize(tokenUp);
console.log('Tick size:', tickSize);  // e.g. '0.001'
```

### Get Neg Risk

```typescript
const negRisk = await client.getNegRisk(tokenUp);
console.log('Neg risk:', negRisk);  // always false in paper trading
```

### Place an Order

Orders are created client-side (EIP-712 signed) and then posted to the server:

```typescript
// Step 1: Create a signed order
const signedOrder = await client.createOrder(
  {
    tokenID: tokenUp,
    price: 0.5,       // Price between 0.001 and 0.999
    size: 10,         // Number of shares (min 0.1)
    side: Side.BUY,   // Side.BUY or Side.SELL
  },
  { tickSize: '0.01', negRisk: false },
);

// Step 2: Post to server
const result = await client.postOrder(signedOrder, OrderType.GTC);

console.log('Success:', result.success);     // true
console.log('Order ID:', result.orderID);    // uuid
console.log('Status:', result.status);       // 'live' or 'matched'
console.log('Error:', result.errorMsg);      // '' on success
```

**Supported order types:**

| SDK OrderType | Behavior |
|---------------|----------|
| `OrderType.GTC` | Good-Till-Cancel (limit order, stays open until filled or cancelled) |
| `OrderType.FOK` | Fill-or-Kill (must fill entirely or not at all) |
| `OrderType.FAK` | Fill-And-Kill / IOC (fill what's available, cancel the rest) |

### Get Order by ID

```typescript
const order = await client.getOrder(orderId);

console.log('Status:', order.status);          // 'LIVE', 'MATCHED', or 'CANCELED'
console.log('Side:', order.side);              // 'BUY' or 'SELL'
console.log('Price:', order.price);
console.log('Original size:', order.original_size);
console.log('Filled:', order.size_matched);
console.log('Market:', order.market);
console.log('Trades:', order.associate_trades); // array of trade IDs
```

### Get Open Orders

```typescript
// All open orders
const orders = await client.getOpenOrders();

// Filter by token
const filteredOrders = await client.getOpenOrders({
  asset_id: tokenUp,
});
```

### Cancel an Order

```typescript
const result = await client.cancelOrder({ orderID: orderId });

console.log('Canceled:', result.canceled);          // ['order-id-1']
console.log('Not canceled:', result.not_canceled);  // {}
```

### Cancel All Orders

```typescript
const result = await client.cancelAll();

console.log('Canceled:', result.canceled);  // ['id1', 'id2', ...]
```

### Get Trade History

```typescript
const trades = await client.getTrades();
// Returns array of executed fills
```

---

## Endpoint Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/book?token_id=...` | No | Order book for a token |
| `GET` | `/tick-size?token_id=...` | No | Minimum tick size |
| `GET` | `/neg-risk` | No | Neg-risk flag (always `false`) |
| `GET` | `/fee-rate` | No | Taker fee rate in basis points |
| `POST` | `/order` | Yes | Place a signed order |
| `DELETE` | `/order` | Yes | Cancel a single order |
| `DELETE` | `/orders` | Yes | Cancel a batch of orders |
| `DELETE` | `/cancel-all` | Yes | Cancel all open orders |
| `GET` | `/data/order/:id` | Yes | Get order details by ID |
| `GET` | `/data/orders` | Yes | List open orders (filter by `market`, `asset_id`) |
| `GET` | `/data/trades` | Yes | List trade history (filter by `market`, `asset_id`, `before`, `after`) |

---

## Full Example

```typescript
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';

async function main() {
  const wallet = Wallet.createRandom();

  const client = new ClobClient(
    'http://localhost:3001',
    137,
    wallet, //Can be any random wallet
    {
      key: 'pp_your_api_key_here', //Should be the API key from LoremIpsumTrade UI
      secret: Buffer.from('any-secret').toString('base64'), //Can be any random string
      passphrase: 'any-passphrase', //Can be any random string
    },
  );

  // 3. Place a BUY order
  const signed = await client.createOrder(
    { tokenID: tokenUp, price: 0.45, size: 10, side: Side.BUY },
    { tickSize: book.tick_size, negRisk: false },
  );
  const result = await client.postOrder(signed, OrderType.GTC);
  console.log(`Order placed: ${result.orderID} (${result.status})`);

  // 4. Check open orders
  const orders = await client.getOpenOrders();
  console.log(`Open orders: ${orders.length}`);

  // 5. Cancel all
  const canceled = await client.cancelAll();
  console.log(`Canceled: ${canceled.canceled.length} orders`);
}

main().catch(console.error);
```

---

## Differences from Real Polymarket

| Aspect | Paper Prediction | Real Polymarket |
|--------|-----------------|-----------------|
| Matching | Virtual matching engine (no real money) | Real on-chain order book |
| Balance | $10,000 virtual starting balance | Real USDC |
| Markets | BTC Up/Down 15-minute markets only | All Polymarket markets |
| Neg-Risk | Always `false` | Varies by market |
| Fee Rate | 0% maker / 0.2% taker (fixed) | May vary |
| Settlement | Automatic at market expiry | Blockchain-based |
| Private Key | Any random key works | Must control real wallet |
| API Key Auth | Only `X-API-Key` validated | Full HMAC signature validation |

---

