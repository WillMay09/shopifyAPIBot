import fetch from "node-fetch";
import open from "open";
import puppeteer from "puppeteer";

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
    console.log("Full Shopify Rsponse: \n", JSON.stringify(data, null, 2));
    //check for graphql errors
    if (data.errors) {
      console.error("Shopify GraphQL Errors:", data.errors);
      throw new Error("Shopify API returned errors");
    }
    return data;
  } catch (e) {
    console.log("Shopify request error" + e);
    throw e;
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

async function fillOutShippingInfo(cartID, shippingAddress) {
  const mutation = `mutation AddDeliveryAddressAndBuyerInfo {
  cartDeliveryAddressesAdd(
    cartId: "gid://shopify/Cart/hWN47PkTz38JcBtFbRKxe1aM?key=65c8c5db7258b148de9ad96843e48d8f"
    addresses: [
      {
        address: {
          deliveryAddress: {
            firstName: "John"
            lastName: "Jones"
            address1: "3818 Richmond Ave"
            city: "Houston"
            provinceCode: "TX"
            countryCode: US
            zip: "77044"
          }
        }
      }
    ]
  ) {
    cart {
      id
      checkoutUrl
      totalQuantity
    }
    userErrors {
      field
      message
    }
  }

  cartBuyerIdentityUpdate(
    cartId: "gid://shopify/Cart/hWN47PkTz38JcBtFbRKxe1aM?key=65c8c5db7258b148de9ad96843e48d8f"
    buyerIdentity: {
      email: "john.jones@example.com"
      phone: "+17135551234"
      countryCode: US
    }
  ) {
    cart {
      id
      buyerIdentity {
        email
        phone
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

  const variables = {
    cartId: cartID,
    addresses: [
      {
        address: {
          address1: shippingAddress.address1,
          city: shippingAddress.city,
          provinceCode: shippingAddress.provinceCode,
          countryCode: shippingAddress.countryCode,
          zip: shippingAddress.zip,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          phone: shippingAddress.phone,
        },
      },
    ],
  };

  const data = await shopifyRequest(mutation);

  const shippingPage = data.data.cartDeliveryAddressesAdd.cart;

  console.log(
    "shipping info filled out" + JSON.stringify(shippingPage, null, 2)
  );

  return shippingPage;
}

// async function selectShippingMethod(cartID, deliveryGroupId, deliveryHandle) {
//   const mutation = ` mutation SelectDeliveryOption($cartId: ID!, $deliveryGroupId: ID!, $handle: String!) {
//     cartSelectedDeliveryOptionsUpdate(
//       cartId: $cartId
//       selectedDeliveryOptions: [{ deliveryGroupId: $deliveryGroupId, handle: $handle }]
//     ) {
//       cart {
//         id
//         checkoutUrl
//       }
//       userErrors {
//         message
//       }
//     }
//   }`;

//   const variables = {
//     cartId: cartID,
//     deliveryGroupId,
//     handle: deliveryHandle,
//   };

//   const data = await shopifyRequest(mutation, variables);
//   const cart = data.data.cartSelectedDeliveryOptionsUpdate.cart;
//   console.log("✅ Shipping method selected:", JSON.stringify(cart, null, 2));
//   return cart;
// }

async function puppeteerPaymentCheckout(shippingUrl, page) {
  await page.goto(shippingUrl, { waitUntil: "domcontentloaded" });
  const creditCardInfo = [
    {
      iframe: "iframe[id^='card-fields-number']",
      selector: "input[id='number']",
      value: "4539781755627228",
    },
    {
      iframe: "iframe[id^='card-fields-expiry']",
      selector: "input[id='expiry']",
      value: "05/31",
    },
    {
      iframe: "iframe[id^='card-fields-verification_value']",
      selector: "input[id='verification_value']",
      value: "758",
    },
    { iframe: null, selector: "input[id='name']", value: "Bob Chad" }, // outside iframe
  ];

  for (const { iframe, selector, value } of creditCardInfo) {
    try {
      let frame = page;

      if (iframe) {
        const frameHandle = await page.waitForSelector(iframe, {
          visible: true,
          timeout: 10000,
        });
        frame = await frameHandle.contentFrame();
      }
      await frame.waitForSelector(selector, { visible: true, timeout: 5000 });
      await frame.type(selector, value);
    } catch (error) {
      console.log(`Failed to fill ${error} : ${error.message}`);
    }
  }

  const continueToPayment = await page.waitForSelector(
    "::-p-xpath(//button[.//span[text()='Pay now']])"
  );

  await continueToPayment.evaluate((el) => el.scrollIntoView());

  await continueToPayment.evaluate((el) => el.click());
}

async function run() {
  try {
    console.log("Starting Shopify cart flow...");
    const cart = await addProductToCart();
    const shippingPage = await fillOutShippingInfo(cart.id, {
      firstName: "Test",
      lastName: "User",
      address1: "3886 Richmond Ave.",
      city: "Houston",
      provinceCode: "TX",
      countryCode: "United States",
      zip: "77046",
      phone: "+15555555555",
    });
    //open checkout in browser

    const { browser, page } = await getPage();
    const shippingUrl = shippingPage.checkoutUrl;

    console.log(`Opening checkout page:\n${shippingUrl}`);

    await puppeteerPaymentCheckout(shippingUrl, page);

    //await open(shippingUrl);
  } catch (error) {
    console.error("Error in shopify flow" + error);
  }

  // await browser.close();
}

run();
