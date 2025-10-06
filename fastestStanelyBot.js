import fetch from "node-fetch";
import open from "open";

//const puppeteer = require("puppeteer-extra");
//imports puppeteer plugin, makes it harder for websites to detect what is going on
//const StealthPlugin = require("puppeteer-extra-plugin-stealth");

//puppeteer.use(StealthPlugin());

const product_url =
  "https://www.stanley1913.com/products/winterscape-quencher-h2-0-flowstate-tumbler-40-oz?variant=44559799746687";

const SHOPIFY_GRAPHQL_URL =
  "https://stanley-pmi.myshopify.com/api/2025-01/graphql.json";
const STORE_ACCESS_TOKEN = "eecaa4fbf8df42ffe25fac400b1ce513";
const PRODUCT_VARIENT_ID = "gid://shopify/ProductVariant/44559799746687";

async function getPage() {
  const browser = await puppeteer.launch({ headless: false });

  const page = await browser.newPage();

  return { browser, page };
}
//helper function
async function shopifyRequest(query, variables = {}) {
  try {
    const response = await fetch(SHOPIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-shopify-storefront-access-token": STORE_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
    const data = await response.json();
    return data;
  } catch (e) {
    console.log("Shopify request error" + e);
  }
}

async function addProductToCart() {
  const query = `mutation CreateCart($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart {
        id
        checkoutUrl
        lines(first: 5) {
          edges {
            node {
              merchandise {
                ... on ProductVariant {
                  id
                  title
                }
              }
              quantity
            }
          }
        }
      }
    }
  }`;
  const variables = {
    lines: [{ merchandiseId: PRODUCT_VARIENT_ID, quantity: 1 }],
  };
  const data = await shopifyRequest(query, variables);
  const cart = data.data.cartCreate.cart;

  console.log("Cart created", JSON.stringify(cart, null, 2));
  return cart;
}

async function run() {
  try {
    console.log("Starting Shopify cart flow...");
    const cart = await addProductToCart();

    //open checkout in browser
    const checkoutUrl = cart.checkoutUrl;
    console.log(`Opening checkout page:\n${checkoutUrl}`);
    await open(checkoutUrl);
  } catch (error) {
    console.error("Error in shopify flow" + error);
  }

  // await browser.close();
}

run();

// fetch("https://stanley-pmi.myshopify.com/api/2025-01/graphql.json", {
//   headers: {
//     accept: "application/json",
//     "content-type": "application/json",
//     "sec-ch-ua":
//       '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
//     "sec-ch-ua-mobile": "?0",
//     "sec-ch-ua-platform": '"macOS"',
//     "x-sdk-variant": "storefront-api-client",
//     "x-sdk-version": "1.0.2",
//     "x-shopify-storefront-access-token": "eecaa4fbf8df42ffe25fac400b1ce513",
//     Referer: "https://www.stanley1913.com/",
//   },
//   body: '{"query":"\\n    query getCartVariants($ids: [ID!]!) {\\n      nodes(ids: $ids) {\\n        ... on ProductVariant {\\n          id\\n          price {\\n            amount\\n            currencyCode\\n          }\\n          compareAtPrice {\\n            amount\\n            currencyCode\\n          }\\n          metafield(namespace: \\"custom\\", key: \\"minmax_ignite\\") {\\n            key\\n            value\\n          }\\n          product {\\n            metafield(namespace: \\"minmaxify\\", key: \\"limits\\") {\\n              key\\n              value\\n            }\\n          }\\n        }\\n      }\\n    }\\n  ","variables":{"ids":["gid://shopify/ProductVariant/44559799746687"]}}',
//   method: "POST",
// });
