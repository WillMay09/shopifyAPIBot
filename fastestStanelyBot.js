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
//sends post request
async function shopifyRequest(query, variables = {}, prevCookies = "") {
  console.log("\n🟢 ---- NEW GRAPHQL REQUEST ----");
  console.log("➡️ Request Cookies Sent:", prevCookies || "(none)");
  console.log("➡️ Variables:", JSON.stringify(variables, null, 2));

  try {
    const response = await fetch(SHOPIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-shopify-storefront-access-token": STORE_ACCESS_TOKEN,
        cookie: prevCookies,
      },
      body: JSON.stringify({ query, variables }),
    });
    //return an array of set cookie headers
    const setCookieHeaders = response.headers.raw()["set-cookie"] || [];
    console.log("Raw Set-Cookie Headers from Shopify:", setCookieHeaders);

    //all key value pairs are joined on a single cookie
    const newCookies = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
    console.log("Parsed New Cookies:", newCookies || "(none)");

    const data = await response.json();

    console.log("Full Shopify Rsponse: \n", JSON.stringify(data, null, 2));
    //check for graphql errors
    if (data.errors) {
      console.error("Shopify GraphQL Errors:", data.errors);
      throw new Error("Shopify API returned errors");
    }
    const mergedCookies = [prevCookies, newCookies].filter(Boolean).join("; ");
    console.log("Merged Cookies (to be reused):", mergedCookies);

    //return data + new cookie string
    return { data, cookies: mergedCookies };
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
  const { data, cookies } = await shopifyRequest(query, variables);
  const cart = data.data.cartCreate.cart;

  console.log("Cart created", JSON.stringify(cart, null, 2));
  return { cart, cookies };
}

async function fillOutShippingInfo(cartID, shippingAddress, cookies) {
  const mutation = `
    mutation AddDeliveryAddressAndBuyerInfo($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
      cartDeliveryAddressesAdd(
        cartId: $cartId
        addresses: $addresses
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
        cartId: $cartId
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
    }
  `;

  const variables = {
    cartId: cartID,
    addresses: [
      {
        address: {
          deliveryAddress: {
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            address1: shippingAddress.address1,
            city: shippingAddress.city,
            provinceCode: shippingAddress.provinceCode,
            countryCode: shippingAddress.countryCode,
            zip: shippingAddress.zip,
          },
        },
      },
    ],
  };

  const { data, cookies: newCookies } = await shopifyRequest(
    mutation,
    variables,
    cookies
  );

  const cartData = data.data.cartDeliveryAddressesAdd?.cart;

  console.log("----------Shipping Info Graphql Response -------------------");
  console.log(JSON.stringify(data, null, 2));

  console.log("✅ Shipping info successfully filled out");
  console.log("➡️ Checkout URL:", cartData.checkoutUrl);

  return { shippingPage: cartData, cookies: newCookies };
}

//formats the cookies correctly, puppeteer expects array of cookie objects
//with fields name, value, domain etc
async function setCookiesForPuppeteer(page, cookieString) {
  console.log("\n🟣 ---- SETTING COOKIES IN PUPPETEER ----");

  if (!cookieString) {
    console.warn("No cookies provided to Puppeteer");
    return;
  }

  console.log("➡️ Original Cookie String:", cookieString);
  const cookies = cookieString.split("; ").map((c) => {
    const [name, value] = c.split("=");
    return {
      name,
      value,
      domain: ".myshopify.com",
      path: "/",
      httpOnly: false,
      secure: true,
    };
  });
  //puppeteer's checkout session sees the same cookies that where present
  //in graphql request
  console.log("Formatted Puppeteer Cookies:", cookies);

  await page.setCookie(...cookies);
  console.log("✅ Cookies successfully applied to Puppeteer session");
}

async function puppeteerPaymentCheckout(shippingUrl, page) {
  await page.goto(shippingUrl, { waitUntil: "networkidle2" });
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
    const { browser, page } = await getPage();
    console.log("Starting Shopify cart flow...");
    const { cart, cookies } = await addProductToCart();
    let { shippingPage, cookies: updatedCookies } = await fillOutShippingInfo(
      cart.id,
      {
        firstName: "Test",
        lastName: "User",
        address1: "3886 Richmond Ave.",
        city: "Houston",
        provinceCode: "TX",
        countryCode: "US",
        zip: "77046",
        phone: "+15555555555",
      },
      cookies
    );

    //format cookies for puppeteer
    await setCookiesForPuppeteer(page, updatedCookies);
    //open checkout in browser

    const shippingUrl = shippingPage.checkoutUrl;

    console.log(`Opening checkout page:\n${shippingUrl}`);

    //await puppeteerPaymentCheckout(shippingUrl, page);

    //await open(shippingUrl);
  } catch (error) {
    console.error("Error in shopify flow" + error);
  }

  // await browser.close();
}

run();
