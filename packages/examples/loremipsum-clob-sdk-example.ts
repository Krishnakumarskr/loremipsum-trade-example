/**
 * LoremIpsumTrade — CLOB SDK Example
 *
 * This script demonstrates how to use the official Polymarket CLOB SDK
 * (@polymarket/clob-client) against the LoremIpsumTrade API.
 *
 * The only difference from trading on real Polymarket: you point the SDK
 * at our server URL instead of Polymarket's, and use your LoremIpsumTrade
 * API key. Everything else — order signing, SDK methods, response formats
 * — works exactly the same.
 *
 * Prerequisites:
 *   npm install @polymarket/clob-client @ethersproject/wallet
 *
 * Getting an API Key:
 *   1. Open the LoremIpsumTrade terminal UI
 *   2. Connect any EVM wallet
 *   3. Go to the API Keys tab
 *   4. Create a new key
 *   5. Copy it immediately — it's only shown once
 *
 * Usage:
 *   npx tsx packages/examples/loremipsum-clob-sdk-example.ts
 */

import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = 'https://clob.loremipsumtrade.com'; // LoremIpsumTrade API
const API_KEY = 'pp_your_api_key_here'; // Replace with your API key

// Token ID for the market you want to trade.
// Get this from the LoremIpsumTrade UI — visible in the trading dashboard.
const TOKEN_ID = '17481208530353875830615935707624600030621570528457286311665700570914599766206';

// Any random private key works — it's only used for client-side EIP-712 order
// signing. No real wallet or funds are needed.
const wallet = Wallet.createRandom();

// The SDK requires an HMAC secret and passphrase, but our server only
// validates the API key. Use any values here.
const HMAC_SECRET = Buffer.from('any-random-string').toString('base64');
const PASSPHRASE = 'any-passphrase';

// ─────────────────────────────────────────────────────────────────────────────
// Initialize the CLOB client
// ─────────────────────────────────────────────────────────────────────────────

const client = new ClobClient(
  API_URL,
  137, // Chain ID (Polygon — required by SDK, not used by our server)
  wallet,
  { key: API_KEY, secret: HMAC_SECRET, passphrase: PASSPHRASE },
);

// ─────────────────────────────────────────────────────────────────────────────
// Examples — Order Operations
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('LoremIpsumTrade — CLOB SDK Order Examples');
  console.log('='.repeat(60));

  // ── 1. Place a BUY order (GTC) ───────────────────────────────────────────

  console.log('\n--- 1. Place a BUY Order (GTC) ---\n');

  // Step 1: Create a signed order client-side (EIP-712)
  const signedOrder = await client.createOrder(
    {
      tokenID: TOKEN_ID,
      price: 0.45, // Price between 0.001 and 0.999
      size: 10,    // Number of shares (min 0.1)
      side: Side.BUY,
    },
    { tickSize: '0.01', negRisk: false },
  );

  console.log(`Signed order token: ${signedOrder.tokenId.slice(0, 20)}...`);

  // Step 2: Post to server
  //   OrderType.GTC = Good-Till-Cancel (limit order)
  //   OrderType.FOK = Fill-or-Kill (all or nothing)
  //   OrderType.FAK = Fill-And-Kill / IOC (fill available, cancel rest)
  const postResult = await client.postOrder(signedOrder, OrderType.GTC);

  console.log(`Success:   ${postResult.success}`);
  console.log(`Order ID:  ${postResult.orderID}`);
  console.log(`Status:    ${postResult.status}`);
  console.log(`Error:     ${postResult.errorMsg || '(none)'}`);

  const orderId = postResult.orderID;

  // ── 2. Get order by ID ─────────────────────────────────────────────────

  console.log('\n--- 2. Get Order by ID ---\n');

  const order = await client.getOrder(orderId);

  console.log(`ID:        ${order.id}`);
  console.log(`Status:    ${order.status}`); // LIVE, MATCHED, or CANCELED
  console.log(`Side:      ${order.side}`);
  console.log(`Price:     ${order.price}`);
  console.log(`Size:      ${order.original_size}`);
  console.log(`Filled:    ${order.size_matched}`);
  console.log(`Market:    ${order.market}`);

  // ── 3. List open orders ────────────────────────────────────────────────

  console.log('\n--- 3. List Open Orders ---\n');

  const openOrders = await client.getOpenOrders();
  console.log(`Open orders: ${openOrders.length}`);

  for (const o of openOrders) {
    console.log(`  ${o.id} | ${o.side} ${o.original_size} @ ${o.price} | ${o.status}`);
  }

  // ── 4. Filter open orders by token ─────────────────────────────────────

  console.log('\n--- 4. Filter Orders by Token ---\n');

  const filtered = await client.getOpenOrders({ asset_id: TOKEN_ID });
  console.log(`Orders for token: ${filtered.length}`);

  // ── 5. Cancel a single order ───────────────────────────────────────────

  console.log('\n--- 5. Cancel a Single Order ---\n');

  const cancelResult = await client.cancelOrder({ orderID: orderId });
  console.log(`Canceled:     [${cancelResult.canceled.join(', ')}]`);
  console.log(`Not canceled: ${JSON.stringify(cancelResult.not_canceled)}`);

  // ── 6. Cancel all orders ───────────────────────────────────────────────

  console.log('\n--- 6. Cancel All Orders ---\n');

  // Place two orders first
  const s1 = await client.createOrder(
    { tokenID: TOKEN_ID, price: 0.30, size: 5, side: Side.BUY },
    { tickSize: '0.01', negRisk: false },
  );
  const s2 = await client.createOrder(
    { tokenID: TOKEN_ID, price: 0.35, size: 5, side: Side.BUY },
    { tickSize: '0.01', negRisk: false },
  );
  await client.postOrder(s1, OrderType.GTC);
  await client.postOrder(s2, OrderType.GTC);

  const beforeCancel = await client.getOpenOrders();
  console.log(beforeCancel);
  console.log(`Open before cancel: ${beforeCancel.length}`);

  const cancelAll = await client.cancelAll();
  console.log(`Canceled: ${cancelAll.canceled.length} orders`);

  const afterCancel = await client.getOpenOrders();
  console.log(`Open after cancel:  ${afterCancel.length}`);

  // ── 7. Get trade history ───────────────────────────────────────────────

  console.log('\n--- 7. Get Trade History ---\n');

  const trades = await client.getTrades();
  console.log(`Total trades: ${trades.length}`);

  for (const t of trades) {
    console.log(`  ${t.id} | ${t.side} ${t.size} @ ${t.price} | ${t.status}`);
  }

  // ── Done ───────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60));
  console.log('All examples completed successfully!');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
